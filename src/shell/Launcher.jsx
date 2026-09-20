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

  const items = apps ?? [];
  const angleFor = arcFor(pos, Math.max(1, items.length));

  // Rounded once, here, so a tile lands on whole pixels and the label inside
  // it stays sharp.
  const tiles = items.map((app, i) => {
    const angle = angleFor(i);
    return {
      app,
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

      {/* Sits under the puck rather than on the ring: the ring is the apps,
          and this is the toolkit itself. Close enough to the puck to be
          found, near enough to it that no tile can reach it — the nearest a
          tile gets is 54px below the centre, and this ends at 36. */}
      <button
        type="button"
        className={`lch__pill${optionsOpen ? " lch__pill--on" : ""}`}
        title="Interface options"
        aria-pressed={!!optionsOpen}
        onClick={onOptions}
      >
        <PixelText upper>UI</PixelText>
      </button>

      {mounted && items.length > 0 && (
        <div
          key={cycle}
          className={`lch__ring${folding ? " lch__ring--folding" : ""}`}
          role="menu"
        >
          {tiles.map(({ app, left, top }, i) => {
            const connected = !!connections?.[app.id];
            const visible = isShown(app.id);

            return (
              <button
                key={app.id}
                type="button"
                role="menuitem"
                disabled={!connected}
                className={
                  "lch__tile" +
                  (visible && connected ? " lch__tile--on" : "") +
                  (connected ? "" : " lch__tile--off")
                }
                style={{
                  "--lch-x": `${left}px`,
                  "--lch-y": `${top}px`,
                  "--lch-i": i,
                  width: TILE,
                  height: TILE,
                }}
                title={
                  connected
                    ? `${app.label} — ${visible ? "hide" : "show"}`
                    : `${app.label} — not connected`
                }
                onPointerEnter={() => setHovered(app.id)}
                onPointerLeave={() => setHovered(null)}
                onClick={() => {
                  if (!connected) return;
                  onToggle(app.id);
                  setOpen(false);
                }}
              >
                <PixelText size={16} className="lch__tile-key">
                  {initials(app.name2 ?? app.label)}
                </PixelText>
                <span
                  className={`lch__dot${connected ? " lch__dot--on" : ""}`}
                />
              </button>
            );
          })}

          {/* Full name of whatever is under the pointer, so the two-letter
              tiles never have to be guessed at. */}
          {hovered && (
            <div className="lch__readout">
              <PixelText upper>
                {items.find((a) => a.id === hovered)?.name2 ?? ""}
              </PixelText>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Launcher;
