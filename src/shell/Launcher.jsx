import { useCallback, useEffect, useRef, useState } from "react";
import { PixelText } from "../ui";
import "./launcher.css";

const PUCK = 32;
const TILE = 44;
const RADIUS = 76;

/** How much room a tile needs beyond the puck's centre. */
const CLEARANCE = RADIUS + TILE / 2;
const OPEN_DELAY = 60;
const DRAG_SLOP = 3;

/** How far outside a lane the pointer may stray before the ring gives up. */
const AIM_SLOP = 10;
/** Long enough for the slowest tile to fold back in. See launcher.css. */
const FOLD_MS = 240;

const POS_KEY = "launcherPos";

function loadPos() {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY)) ?? { x: 24, y: 24 };
  } catch {
    return { x: 24, y: 24 };
  }
}

/**
 * Shortest distance from a point to a line segment.
 *
 * The segment is the lane from the puck to a tile; this is how far the
 * pointer is from travelling straight down it.
 */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;

  const t = length
    ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length))
    : 0;

  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/**
 * The arc the ring opens into, given where the puck is sitting.
 *
 * A full circle only works with room on every side. The puck starts in a
 * corner and is usually dragged to one, and a tile that opens past the edge
 * of the screen cannot be clicked — which is most of what made this thing
 * awkward. So the fan turns away from whichever edges are close: half a
 * circle against one edge, a quarter into a corner.
 */
function arcFor({ x, y }, count) {
  const cx = x + PUCK / 2;
  const cy = y + PUCK / 2;

  const blocked = {
    left: cx < CLEARANCE,
    right: window.innerWidth - cx < CLEARANCE,
    up: cy < CLEARANCE,
    down: window.innerHeight - cy < CLEARANCE,
  };

  const away = {
    x: (blocked.left ? 1 : 0) - (blocked.right ? 1 : 0),
    y: (blocked.up ? 1 : 0) - (blocked.down ? 1 : 0),
  };

  // Nothing in the way: the whole circle, starting at the top.
  if (!away.x && !away.y) {
    const step = (Math.PI * 2) / count;
    return (i) => i * step - Math.PI / 2;
  }

  const centre = Math.atan2(away.y, away.x);
  const sweep = away.x && away.y ? Math.PI / 2 : Math.PI;

  if (count === 1) return () => centre;

  const start = centre - sweep / 2;
  const step = sweep / (count - 1);
  return (i) => start + i * step;
}

/** "Mission Roller" -> "MR". Enough to tell four apps apart on a 44px tile. */
function initials(name) {
  const words = String(name).split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/**
 * Always-present entry point for the overlay.
 *
 * Hover the puck and the connected apps fan out around it; pick one and its
 * window comes back exactly where it was left. Minimising a window hides it
 * completely, so with everything minimised the overlay is a single 32px puck
 * over the game — which is the point.
 *
 * The tiles sit on a circle, but every coordinate is rounded to a whole pixel
 * before it reaches the DOM. A radial layout is the easiest way to end up with
 * text on a half pixel, and it is the one thing this UI cannot have.
 */
export function Launcher({ apps, connections, isShown, onToggle, onOptions, optionsOpen }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(null);

  // The ring outlives `open` by one animation, so the tiles can fold back
  // into the puck instead of vanishing. `cycle` keys the ring, so re-opening
  // during a fold restarts the fan rather than leaving a tile mid-flight.
  const [mounted, setMounted] = useState(false);
  const [folding, setFolding] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [pos, setPos] = useState(loadPos);

  const openTimer = useRef(null);
  const dragRef = useRef(null);

  /* Enable the windows to be dragged in overlay mode. */
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("overlay") !== "1"
    ) {
      return;
    }

    let passthrough = true;
    let pointerDownOnUI = false;

    function setPassthrough(value) {
      if (passthrough === value) return;

      passthrough = value;
      window.electronAPI?.setOverlayMousePassthrough(value);
    }

    function isOverUI(x, y) {
      const element = document.elementFromPoint(x, y);

      const mapStage = document.querySelector(
        '.dm__stage[data-overlay-map-clickthrough="true"]',
      );
      const mapApp = mapStage?.closest(".app");
      if (mapStage && mapApp) {
        const isInside = (node) => {
          if (!node) return false;
          const rect = node.getBoundingClientRect();
          return (
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom
          );
        };
        const appRect = mapApp.getBoundingClientRect();
        const insideMapApp =
          x >= appRect.left &&
          x <= appRect.right &&
          y >= appRect.top &&
          y <= appRect.bottom;

        if (insideMapApp) {
          const topBar = mapApp.querySelector(".window-drag-handle");
          const mapArea = mapApp.querySelector(".dm__stage");
          if (isInside(topBar)) return true;
          if (isInside(mapArea)) return false;

          // Transparent space inside the map window should reach the game.
          if (!element?.closest(".app") || element.closest(".app") === mapApp) {
            return false;
          }
        }
      }

      return (
        element instanceof Element &&
        element.closest(".app, .lch, [data-overlay-interactive]") !== null
      );
    }

    function onMouseMove(event) {
      if (pointerDownOnUI) {
        setPassthrough(false);
        return;
      }

      setPassthrough(!isOverUI(event.clientX, event.clientY));
    }

    function onMouseDown(event) {
      const overUI = isOverUI(event.clientX, event.clientY);

      if (overUI) {
        pointerDownOnUI = true;
        setPassthrough(false);
      }
    }

    function onMouseUp(event) {
      pointerDownOnUI = false;
      const overUI = isOverUI(event.clientX, event.clientY);
      setPassthrough(!overUI);
    }

    function onBlur() {
      pointerDownOnUI = false;
      // When focus leaves the overlay, return to click-through mode so the
      // game can receive input.
      setPassthrough(true);
    }

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("blur", onBlur);

    return () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("mouseup", onMouseUp, true);
      window.removeEventListener("blur", onBlur);

      window.electronAPI?.setOverlayMousePassthrough(true);
    };
  }, []);

  /* */


  const clearTimers = () => clearTimeout(openTimer.current);

  useEffect(() => clearTimers, []);

  useEffect(() => {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      /* ignore */
    }
  }, [pos]);

  useEffect(() => {
    if (open) {
      setFolding(false);
      setMounted(true);
      setCycle((n) => n + 1);
      return undefined;
    }

    let cancelled = false;
    setFolding(true);
    const timer = setTimeout(() => {
      if (cancelled) return;
      setMounted(false);
      setFolding(false);
    }, FOLD_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /**
   * Close when the pointer stops heading anywhere.
   *
   * The ring's hover area is one disc big enough to bridge the gap between
   * the puck and a tile, which means anywhere inside it counted as still
   * interested — so the ring stayed open while the pointer sat in the empty
   * space between two tiles.
   *
   * What actually matters is whether the pointer is travelling down a lane
   * towards something: the corridor from the puck's centre to a tile's
   * centre, a tile's width across. That is generous where it needs to be,
   * because every lane starts at the same place — near the puck they all
   * overlap and any direction is still "towards" something — and it narrows
   * to the tile itself at the far end.
   *
   * Leaving every lane closes it on the spot. There is nothing to wait for:
   * the lanes already describe every direction worth keeping it open for.
   */
  useEffect(() => {
    if (!open) return undefined;

    const onMove = (event) => {
      const cx = pos.x + PUCK / 2;
      const cy = pos.y + PUCK / 2;

      const onPuck =
        Math.hypot(event.clientX - cx, event.clientY - cy) <=
        PUCK / 2 + AIM_SLOP;

      const aiming =
        onPuck ||
        tilesRef.current.some(
          (tile) =>
            distanceToSegment(
              event.clientX,
              event.clientY,
              cx,
              cy,
              cx + tile.left + TILE / 2,
              cy + tile.top + TILE / 2,
            ) <=
            TILE / 2 + AIM_SLOP,
        );

      if (!aiming) {
        setOpen(false);
        setHovered(null);
      }
    };

    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [open, pos.x, pos.y]);

  const enter = useCallback(() => {
    clearTimers();
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY);
  }, []);

  const leave = useCallback(() => {
    clearTimers();
    setOpen(false);
    setHovered(null);
  }, []);

  // Dragging the puck moves the launcher. A click does nothing on purpose:
  // hovering is the whole interaction, and a click used to pin the ring open
  // so that it then had to be clicked again to get rid of it.
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: pos.x,
      oy: pos.y,
      moved: false,
    };
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
    d.moved = true;
    clearTimers();
    setOpen(false);
    setPos({
      x: Math.max(0, Math.round(d.ox + dx)),
      y: Math.max(0, Math.round(d.oy + dy)),
    });
  };

  const onPointerUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!d.moved) setOpen(true);
  };

  /**
   * What the ring offers, as one list.
   *
   * The options window is not an app — nothing is listening on a port for
   * it — but it is reached the same way, so it is described the same way
   * and the ring does not need to know the difference. It carries no link
   * light, because there is no link to report.
   */
  const entries = [
    ...(apps ?? []).map((app) => ({
      key: app.id,
      initials: initials(app.name2 ?? app.label),
      name: app.name2 ?? app.label,
      available: !!connections?.[app.id],
      showing: isShown(app.id),
      title: connections?.[app.id]
        ? `${app.label} - ${isShown(app.id) ? "hide" : "show"}`
        : `${app.label} - not connected`,
      onPick: () => onToggle(app.id),
      link: true,
    })),
    {
      key: "shell-options",
      initials: "UI",
      name: "Interface",
      available: true,
      showing: !!optionsOpen,
      title: `Interface options - ${optionsOpen ? "hide" : "show"}`,
      onPick: onOptions,
      link: false,
    },
  ];

  const angleFor = arcFor(pos, Math.max(1, entries.length));

  // Rounded once, here, so a tile lands on whole pixels and the label inside
  // it stays sharp.
  const tiles = entries.map((entry, i) => {
    const angle = angleFor(i);
    return {
      entry,
      left: Math.round(Math.cos(angle) * RADIUS - TILE / 2),
      top: Math.round(Math.sin(angle) * RADIUS - TILE / 2),
    };
  });

  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;

  return (
    <div
      className="lch ph"
      style={{ left: pos.x, top: pos.y }}
      onPointerEnter={enter}
      onPointerLeave={leave}
    >
      <button
        type="button"
        className={`lch__puck${open ? " lch__puck--open" : ""}`}
        title="Apps - hover to open, drag to move"
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="lch__bar" />
        <span className="lch__bar" />
        <span className="lch__bar" />
      </button>

      {mounted && entries.length > 0 && (
        <div
          key={cycle}
          className={`lch__ring${folding ? " lch__ring--folding" : ""}`}
          role="menu"
        >
          {tiles.map(({ entry, left, top }, i) => (
            <button
              key={entry.key}
              type="button"
              role="menuitem"
              disabled={!entry.available}
              className={
                "lch__tile" +
                (entry.showing && entry.available ? " lch__tile--on" : "") +
                (entry.available ? "" : " lch__tile--off")
              }
              style={{
                "--lch-x": `${left}px`,
                "--lch-y": `${top}px`,
                "--lch-i": i,
                width: TILE,
                height: TILE,
              }}
              title={entry.title}
              onPointerEnter={() => setHovered(entry.key)}
              onPointerLeave={() => setHovered(null)}
              onClick={() => {
                if (!entry.available) return;
                entry.onPick();
                setOpen(false);
              }}
            >
              <PixelText size={16} className="lch__tile-key">
                {entry.initials}
              </PixelText>
              {entry.link && (
                <span
                  className={`lch__dot${entry.available ? " lch__dot--on" : ""}`}
                />
              )}
            </button>
          ))}

          {/* Full name of whatever is under the pointer, so the two-letter
              tiles never have to be guessed at. */}
          {hovered && (
            <div className="lch__readout">
              <PixelText upper>
                {entries.find((e) => e.key === hovered)?.name ?? ""}
              </PixelText>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Launcher;
