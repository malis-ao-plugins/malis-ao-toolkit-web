import { useCallback, useEffect, useRef, useState } from "react";
import { PixelText } from "../ui";
import "./launcher.css";

const PUCK = 32;
const TILE = 44;
const RADIUS = 76;

/** How much room a tile needs beyond the puck's centre. */
const CLEARANCE = RADIUS + TILE / 2;
const OPEN_DELAY = 60;
const CLOSE_DELAY = 260;
const DRAG_SLOP = 3;

const POS_KEY = "launcherPos";

function loadPos() {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY)) ?? { x: 24, y: 24 };
  } catch {
    return { x: 24, y: 24 };
  }
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
export function Launcher({ apps, connections, isShown, onToggle }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [pos, setPos] = useState(loadPos);

  const openTimer = useRef(null);
  const closeTimer = useRef(null);
  const dragRef = useRef(null);

  const clearTimers = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  };

  useEffect(() => clearTimers, []);

  useEffect(() => {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      /* ignore */
    }
  }, [pos]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const enter = useCallback(() => {
    clearTimers();
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY);
  }, []);

  const leave = useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setHovered(null);
    }, CLOSE_DELAY);
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

      {open && items.length > 0 && (
        <div className="lch__ring" role="menu">
          {items.map((app, i) => {
            // Measured from the ring's own origin, which CSS has already put
            // at the centre of the puck. Adding the centre again here shifted
            // every tile 16px down and right — off-centre, and far enough out
            // that the bottom-right ones fell outside the ring's hover area,
            // so the menu closed as you reached for them.
            //
            // Rounded once, here, so the tile lands on whole pixels and the
            // label inside it stays sharp.
            const angle = angleFor(i);
            const left = Math.round(Math.cos(angle) * RADIUS - TILE / 2);
            const top = Math.round(Math.sin(angle) * RADIUS - TILE / 2);

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
