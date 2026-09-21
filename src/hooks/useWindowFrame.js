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
 *
 * A window is also kept inside its container - while dragging, while
 * resizing, when it is first restored, and when the browser window changes
 * size. A window dragged off the edge is one you cannot get back without
 * clearing storage, so it is simply not allowed to go there.
 */

/** The box a window has to stay inside: its container, else the viewport. */
function bounds(node) {
  const parent = node?.offsetParent;
  if (parent) return { width: parent.clientWidth, height: parent.clientHeight };
  return {
    width: document.documentElement.clientWidth || window.innerWidth,
    height: document.documentElement.clientHeight || window.innerHeight,
  };
}

/**
 * The same frame, moved and shrunk as little as it takes to fit.
 *
 * A window wider than its container keeps its left edge rather than being
 * squeezed: at that size nothing is reachable anyway, and shrinking it would
 * lose the size the user chose.
 */
function fit(frame, box) {
  const width = Math.min(frame.width, Math.max(MIN_W, box.width));
  const height = Math.min(frame.height, Math.max(MIN_H, box.height));
  return {
    ...frame,
    width,
    height,
    x: Math.round(Math.min(Math.max(0, frame.x), Math.max(0, box.width - width))),
    y: Math.round(Math.min(Math.max(0, frame.y), Math.max(0, box.height - height))),
  };
}
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

  // A frame saved when the browser was bigger, or a browser that has since
  // been made smaller, would put a window out of reach.
  useEffect(() => {
    const settle = () => {
      setFrame((f) => {
        const next = fit(f, bounds(nodeRef.current));
        return next.x === f.x && next.y === f.y && next.width === f.width && next.height === f.height
          ? f
          : next;
      });
    };

    settle();
    window.addEventListener("resize", settle);
    return () => window.removeEventListener("resize", settle);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + id, JSON.stringify(frame));
    } catch {
      /* private mode */
    }
  }, [id, frame]);

  const gesture = useRef(null);

  // React state, not a class added by hand. A window raises itself on the
  // same pointerdown that starts the drag, which re-renders it and recomputes
  // className — an imperatively added class was thrown away immediately, and
  // the drag ran with the flight transition still live.
  const [dragging, setDragging] = useState(false);

  const begin = useCallback((event, mode) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = {
      mode,
      x: event.clientX,
      y: event.clientY,
      start: { ...frameRef.current },
    };

    // Asks for a compositor layer, and turns the transition off, for as long
    // as the gesture runs.
    setDragging(true);
  }, []);

  const move = useCallback((event) => {
    const g = gesture.current;
    if (!g) return;

    const dx = Math.round(event.clientX - g.x);
    const dy = Math.round(event.clientY - g.y);
    const box = bounds(nodeRef.current);

    const next = { ...g.start };
    if (g.mode === "move") {
      // clamped here rather than at the end of the gesture, so the window
      // stops at the edge under the pointer instead of snapping back later
      next.x = Math.min(Math.max(0, g.start.x + dx), Math.max(0, box.width - next.width));
      next.y = Math.min(Math.max(0, g.start.y + dy), Math.max(0, box.height - next.height));
    } else {
      if (g.mode.includes("e"))
        next.width = Math.max(MIN_W, Math.min(g.start.width + dx, box.width - g.start.x));
      if (g.mode.includes("s"))
        next.height = Math.max(MIN_H, Math.min(g.start.height + dy, box.height - g.start.y));
    }

    g.latest = next;

    // A move is a transform, never left/top.
    //
    // left and top are layout properties: changing one asks the browser to
    // recalculate layout and repaint, and it pays that for everything on
    // screen, not just the window being dragged. With a few hundred rows open
    // in another window that is felt immediately — dragging one window went
    // slow because a different one had a long list in it.
    //
    // A transform is composited. Nothing is laid out, nothing else repaints.
    // The frame keeps its real x/y and the transform is the offset from it,
    // which is settled back into left/top when the gesture ends.
    const el = nodeRef.current;
    if (el) {
      if (g.mode === "move") {
        el.style.transform = `translate(${next.x - g.start.x}px, ${next.y - g.start.y}px)`;
      } else {
        if (next.width !== g.start.width) el.style.width = `${next.width}px`;
        if (next.height !== g.start.height) el.style.height = `${next.height}px`;
      }
    }
  }, []);

  const end = useCallback((event) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    // Drop the transform and take the same offset in left/top, in one go.
    // Both writes land in the same style flush, so there is no frame where
    // the window is back at where it started.
    const el = nodeRef.current;
    if (el && g.mode === "move" && g.latest) {
      el.style.transform = "";
      el.style.left = `${g.latest.x}px`;
      el.style.top = `${g.latest.y}px`;
    }

    // Cleared in the same commit as the new left/top below, so the transition
    // is never back before that last write - which would ease the window back
    // to where it was let go rather than leaving it there.
    setDragging(false);

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

  return { frame, handlers, windowRef: nodeRef, dragging };
}

export default useWindowFrame;
