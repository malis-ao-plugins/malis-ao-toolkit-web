import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PixelText, Row, Segmented } from "../../ui";
import { bounds, cameraFor, fit, floorsOf, roomsOnFloor, unproject } from "./draw";
import { createRenderer } from "./gl/renderer";

/** Kit tokens, read once per mount so the map follows the skin. */
function readColors(el) {
  const s = getComputedStyle(el);
  const v = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
  return {
    wall: v("--c-fg-dim", "#9aa"),
    wallHi: v("--c-fg-hi", "#fff"),
    door: v("--c-good", "#4ade80"),
    spawn: v("--c-info", "#22d3ee"),
    // you are not a theme accent - pure green, whatever the skin
    self: "#00ff00",
    npc: v("--c-bad", "#f87171"),
    player: v("--c-fg-hi", "#fff"),
    chest: v("--c-warn", "#facc15"),
    chestOpen: v("--c-fg-mute", "#667"),
    lift: v("--c-info", "#22d3ee"),
    objective: v("--c-hot", "#ff5c33"),

    // the only room told apart from the rest
    entrance: v("--c-accent-lo", "#7c5cff"),
    visited: v("--c-good", "#4ade80"),
  };
}

const NO_ROOMS = [];

const ZOOM_MIN = 0.15;
const ZOOM_MAX = 8;

export function MapCanvas({ settings, set, state, setState }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const dragRef = useRef(null);
  const colorsRef = useRef(null);

  // Drawing and pointer input are both coalesced to one frame.
  //
  // A pointer fires well above the refresh rate, and the plugin pushes a
  // position every game frame on top of that. Handing each event straight to
  // React meant a full reconcile and a GL draw per event, queued behind each
  // other. Both now keep the latest value in a ref and act on it once a frame.
  const sceneRef = useRef(null);
  const drawFrame = useRef(0);
  const inputRef = useRef(null);
  const inputFrame = useRef(0);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(null);
  const [failed, setFailed] = useState(false);

  // Rooms you have walked through. The plugin already says which room the
  // player is in on every frame, so this is the browser's to keep - a new Set
  // only when it actually grows, so the paint effect is not woken for nothing.
  const [visited, setVisited] = useState(() => new Set());

  // A dynel only exists while it is loaded, so the objective disappears the
  // moment you walk away from it. Keep the last sighting: knowing where it
  // was is the whole point of marking it.
  const [seen, setSeen] = useState(null);

  // Held by identity: `?? []` would hand every render a new empty array, which
  // re-ran the upload and the paint effect on every message.
  const rooms = useMemo(() => state.dungeon?.rooms ?? NO_ROOMS, [state.dungeon]);
  const player = state.player ?? null;
  const floors = useMemo(() => floorsOf(rooms), [rooms]);

  // The floor shown: the player's unless one was pinned.
  const pinned = state.pinnedFloor;
  const floor =
    pinned != null && floors.includes(pinned)
      ? pinned
      : player && floors.includes(player.f)
        ? player.f
        : (floors[0] ?? 0);

  const box = useMemo(() => bounds(roomsOnFloor(rooms, floor)), [rooms, floor]);

  // Measure the drawing area.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // One GL context for the life of the panel.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    colorsRef.current = readColors(canvas);

    try {
      rendererRef.current = createRenderer(canvas);
    } catch {
      rendererRef.current = null;
    }

    if (!rendererRef.current) setFailed(true);

    const onLost = (e) => {
      e.preventDefault();
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    const renderer = rendererRef.current;
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      cancelAnimationFrame(drawFrame.current);
      cancelAnimationFrame(inputFrame.current);
      drawFrame.current = 0;
      inputFrame.current = 0;
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, []);

  /** Draw the newest scene once, on the next frame. */
  const requestDraw = useCallback(() => {
    if (drawFrame.current) return;
    drawFrame.current = requestAnimationFrame(() => {
      drawFrame.current = 0;
      if (sceneRef.current) rendererRef.current?.draw(sceneRef.current);
    });
  }, []);

  /** Apply the newest pan once, on the next frame. */
  const requestInput = useCallback(() => {
    if (inputFrame.current) return;
    inputFrame.current = requestAnimationFrame(() => {
      inputFrame.current = 0;
      const next = inputRef.current;
      inputRef.current = null;
      if (next) setView(next);
    });
  }, []);

  // Geometry is uploaded once per dungeon, never per frame.
  useEffect(() => {
    rendererRef.current?.setDungeon(rooms);
    setVisited(new Set());
    setSeen(null);
  }, [rooms]);

  const live = state.objective ?? null;
  useEffect(() => {
    if (live) setSeen(live);
  }, [live]);

  const here = player?.room;
  useEffect(() => {
    if (here == null || here === 0) return;
    setVisited((v) => (v.has(here) ? v : new Set(v).add(here)));
  }, [here]);

  const fitFloor = useCallback(() => {
    if (!box || !size.w) return;
    setView(fit(box, size.w, size.h));
  }, [box, size.w, size.h]);

  // Fit when the dungeon, the floor or the box changes, never mid-pan.
  const boxKey = box ? `${floor}:${box.minX},${box.minZ},${box.maxX},${box.maxZ}` : null;
  const lastFit = useRef(null);
  useEffect(() => {
    if (!boxKey || !size.w) return;
    if (lastFit.current === boxKey) return;
    lastFit.current = boxKey;
    fitFloor();
  }, [boxKey, size.w, fitFloor]);

  // Follow keeps the player centred without touching the zoom.
  useEffect(() => {
    if (!settings.follow || !player || !view) return;
    if (player.f !== floor) return;
    setView((v) => (v ? { ...v, cx: player.x, cz: player.z } : v));
  }, [settings.follow, player, floor, view?.scale]); // eslint-disable-line react-hooks/exhaustive-deps

  // Paint. One camera builds the frame and answers the pointer, so what is
  // drawn and what is hit-tested can never drift apart.
  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer || !view || !size.w) return;

    const dpr = window.devicePixelRatio || 1;

    // Assigning width or height reallocates the drawing buffer and clears it,
    // so it happens on a resize and not on every position message.
    const pixelW = Math.floor(size.w * dpr);
    const pixelH = Math.floor(size.h * dpr);
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;
    }

    const camera = cameraFor(view, size.w, size.h, dpr, state.dungeon?.tileSize ?? 2);
    cameraRef.current = camera;

    sceneRef.current = {
      width: canvas.width,
      height: canvas.height,
      dpr,
      camera,
      floor,
      player,
      dynels: state.dynels ?? [],
      objective: live ?? seen,
      objectiveStale: !live && !!seen,
      visited,
      colors: colorsRef.current ?? readColors(canvas),
      // an unset colour falls through to the skin's own token
      style: {
        wall: settings.wallColor || null,
        door: settings.doorColor || null,
        wallWidth: settings.wallWidth ?? 1,
        doorWidth: settings.doorWidth ?? 2,
      },
      // markers are world-sized, so ask for one that comes out about the same
      // on screen whatever the zoom
      markerSize: Math.max(1.2, (4 * dpr) / camera.scale),
      show: {
        spawns: !!settings.showSpawns,
        dynels: !!settings.showDynels,
        chests: !!settings.showChests,
        lifts: !!settings.showLifts,
        objective: !!settings.showObjective,
        doors: !!settings.showDoors,
      },
    };

    requestDraw();
  }, [rooms, floor, view, player, state.dynels, live, seen, visited, state.dungeon, settings, size, requestDraw]);

  const toWorld = useCallback((clientX, clientY) => {
    const camera = cameraRef.current;
    if (!camera) return [0, 0];
    const rect = canvasRef.current.getBoundingClientRect();
    return unproject(camera)(
      (clientX - rect.left) * camera.dpr,
      (clientY - rect.top) * camera.dpr,
    );
  }, []);

  const onWheel = (e) => {
    if (!view) return;
    const step = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.scale * step));
    const [wx, wz] = toWorld(e.clientX, e.clientY);
    const k = 1 - view.scale / scale;
    setView({ scale, cx: view.cx + (wx - view.cx) * k, cz: view.cz + (wz - view.cz) * k });
  };

  const onPointerDown = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY, cx: view?.cx ?? 0, cz: view?.cz ?? 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!view) return;

    if (drag) {
      if (settings.follow) set({ follow: false });
      const camera = cameraRef.current;
      const perPixel = (camera?.scale ?? view.scale) / (camera?.dpr ?? 1);
      inputRef.current = {
        scale: view.scale,
        cx: drag.cx - (e.clientX - drag.x) / perPixel,
        cz: drag.cz - (e.clientY - drag.y) / perPixel,
      };
      requestInput();
    }
  };

  const endDrag = (e) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const loaded = rooms.length > 0;

  return (
    <div className="dm">
      <div
        className="dm__stage"
        ref={wrapRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <canvas ref={canvasRef} className="dm__canvas" />
        {(!loaded || failed) && (
          <div className="dm__empty">
            <PixelText>
              {failed ? "No WebGL in this window." : "No dungeon. Zone into one."}
            </PixelText>
          </div>
        )}
      </div>

      {floors.length > 1 && (
        <Row className="dm__bar" gap={1}>
          <Segmented
            value={floor}
            items={floors.map((f) => ({ value: f, label: `F${f}` }))}
            onChange={(f) => setState({ pinnedFloor: f })}
          />
        </Row>
      )}
    </div>
  );
}

export default MapCanvas;
