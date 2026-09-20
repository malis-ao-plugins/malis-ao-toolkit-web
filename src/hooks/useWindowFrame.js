import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "windowFrame_";

/** The size a window is before anyone has resized it. */
export const DEFAULT_FRAME = { x: 80, y: 80, width: 320, height: 520 };
const MIN_W = 240;
const MIN_H = 160;

/**
 * Where a window is and how big it is, persisted per app.
 *
 * Move and resize only — panels no longer move, so there is nothing else for
 * a window to remember beyond which tab is showing and what is collapsed.
 *
 * Every value is rounded to a whole pixel on the way in. A window at x=10.5
 * puts every glyph inside it on a half pixel, which is the one thing the
 * pixel-drawn text cannot survive.
 */
function load(id) {
  try {
    return {
      ...DEFAULT_FRAME,
      ...(JSON.parse(localStorage.getItem(PREFIX + id)) ?? {}),
    };
  } catch {
    return { ...DEFAULT_FRAME };
  }
}

export function useWindowFrame(id, initialPos) {
  const [frame, setFrame] = useState(() => {
    const saved = load(id);
    return initialPos && !localStorage.getItem(PREFIX + id)
      ? { ...saved, ...initialPos }
      : saved;
  });

  const frameRef = useRef(frame);
  frameRef.current = frame;

  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + id, JSON.stringify(frame));
    } catch {
      /* private mode */
    }
  }, [id, frame]);

  const gesture = useRef(null);

  const begin = useCallback((event, mode) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = {
      mode,
      x: event.clientX,
      y: event.clientY,
      start: { ...frameRef.current },
    };
  }, []);

  const move = useCallback((event) => {
    const g = gesture.current;
    if (!g) return;

    const dx = Math.round(event.clientX - g.x);
    const dy = Math.round(event.clientY - g.y);

    setFrame((prev) => {
      if (g.mode === "move") {
        return { ...prev, x: g.start.x + dx, y: g.start.y + dy };
      }
      const next = { ...prev };
      if (g.mode.includes("e")) next.width = Math.max(MIN_W, g.start.width + dx);
      if (g.mode.includes("s")) next.height = Math.max(MIN_H, g.start.height + dy);
      return next;
    });
  }, []);

  const end = useCallback((event) => {
    if (!gesture.current) return;
    gesture.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  /** Spread onto the title bar (mode "move") or a resize grip. */
  const handlers = useCallback(
    (mode) => ({
      onPointerDown: (e) => begin(e, mode),
      onPointerMove: move,
      onPointerUp: end,
      onPointerCancel: end,
    }),
    [begin, move, end],
  );

  return { frame, handlers };
}

export default useWindowFrame;
