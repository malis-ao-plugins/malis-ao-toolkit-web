import { useCallback, useEffect, useRef, useState } from "react";
import { PixelText } from "../packages/pixel-text";
import "./launcher.css";

const PUCK = 32;
const TILE = 44;
const RADIUS = 76;
const OPEN_DELAY = 120;
const CLOSE_DELAY = 220;
const DRAG_SLOP = 3;

const POS_KEY = "launcherPos";

function loadPos() {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY)) ?? { x: 24, y: 24 };
  } catch {
    return { x: 24, y: 24 };
  }
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
  const [pinned, setPinned] = useState(false);
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
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const enter = useCallback(() => {
    clearTimers();
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY);
  }, []);

  const leave = useCallback(() => {
    clearTimers();
    if (pinned) return;
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setHovered(null);
    }, CLOSE_DELAY);
  }, [pinned]);

  // Dragging the puck moves the launcher; a click without travel pins it open.
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
    if (!d.moved) {
      setPinned((p) => !p);
      setOpen(true);
    }
  };

  const items = apps ?? [];
  const centre = PUCK / 2;

  return (
    <div
      className="lch ph"
      style={{ left: pos.x, top: pos.y }}
      onPointerEnter={enter}
      onPointerLeave={leave}
    >
      <button
        type="button"
        className={`lch__puck${open ? " lch__puck--open" : ""}${pinned ? " lch__puck--pinned" : ""}`}
        title="Apps — drag to move"
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
            // Start at the top and go clockwise. Rounded here, once, so the
            // tile lands on whole pixels and the label inside stays sharp.
            const angle = (i / items.length) * Math.PI * 2 - Math.PI / 2;
            const left = Math.round(centre + Math.cos(angle) * RADIUS - TILE / 2);
            const top = Math.round(centre + Math.sin(angle) * RADIUS - TILE / 2);

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
                style={{ left, top, width: TILE, height: TILE }}
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
                  if (!pinned) setOpen(false);
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
