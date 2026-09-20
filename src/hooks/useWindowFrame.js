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
 * A gesture writes straight to the element and only commits to state when it
 * ends. Setting state on every pointermove re-rendered the window and
 * everything in it, which an inventory of a few hundred rows turns into a
 * visibly heavy drag — and wrote to localStorage once per pixel moved.
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

  /** The window element, so a gesture can move it without a render. */
  const nodeRef = useRef(null);

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

    const next = { ...g.start };
    if (g.mode === "move") {
      next.x = g.start.x + dx;
      next.y = g.start.y + dy;
    } else {
      if (g.mode.includes("e")) next.width = Math.max(MIN_W, g.start.width + dx);
      if (g.mode.includes("s")) next.height = Math.max(MIN_H, g.start.height + dy);
    }

    g.latest = next;

    const el = nodeRef.current;
    if (el) {
      el.style.left = `${next.x}px`;
      el.style.top = `${next.y}px`;
      el.style.width = `${next.width}px`;
      el.style.height = `${next.height}px`;
    }
  }, []);

  const end = useCallback((event) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    // One render, and one write to storage, for the whole gesture.
    if (g.latest) setFrame(g.latest);
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

  return { frame, handlers, windowRef: nodeRef };
}

export default useWindowFrame;
