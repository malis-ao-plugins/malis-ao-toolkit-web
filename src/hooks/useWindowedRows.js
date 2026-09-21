import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Render only the rows that are on screen.
 *
 * A list of a few hundred items is not expensive because of the items. It is
 * expensive because every label in this kit is a pixel-font mask drawn as an
 * image, and a row carries several.
 *
 * The trap is that windowing can cost more than it saves. Scrolling a plain
 * list is pure compositing: the browser moves pixels and React does nothing.
 * A window that recalculates its range on every scroll event turns that into
 * a re-render per event — measured at a 22ms median frame and a 67ms worst
 * while scrolling, for a list of 40 rendered rows.
 *
 * So the range moves in blocks. Scrolling within a block changes nothing and
 * React is never woken; crossing one re-renders once. The overscan is what
 * covers the rows either side while that happens.
 *
 * Rows are a uniform height (`.ph-listrow` has `min-height: var(--ctl-h)`),
 * so the height of one, measured from a real row, gives the position of all
 * of them. Two spacers stand in for the rest, which keeps the scrollbar the
 * size it would have been.
 */

const FIRST_PASS = 40;

/** Rows per step. The range only moves when the first visible row crosses one. */
const BLOCK = 12;

export function useWindowedRows(count, { overscan = 8 } = {}) {
  const ref = useRef(null);
  const [rowHeight, setRowHeight] = useState(0);
  const [viewport, setViewport] = useState(0);

  // The block, not the scroll position.
  //
  // Keeping scrollTop in state re-rendered the list on every frame of a
  // scroll, because scrollTop changes every frame — the block snapping only
  // applied afterwards, when deriving the range, which was far too late to
  // save the render. Measured: 22ms median frames while scrolling a
  // 40-row list whose content made no difference at all.
  const [block, setBlock] = useState(0);
  const metrics = useRef({ rowHeight: 0 });
  metrics.current.rowHeight = rowHeight;

  // Scroll events arrive faster than frames, and most of them change nothing.
  // One rAF at a time, and state only when the block actually moves.
  const frame = useRef(0);
  const pending = useRef(0);

  const onScroll = useCallback((event) => {
    pending.current = event.currentTarget.scrollTop;
    if (frame.current) return;

    frame.current = requestAnimationFrame(() => {
      frame.current = 0;

      const height = metrics.current.rowHeight;
      if (!height) return;

      const next = Math.floor(Math.floor(pending.current / height) / BLOCK) * BLOCK;
      setBlock((was) => (was === next ? was : next));
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const observer = new ResizeObserver(() => setViewport(el.clientHeight));
    observer.observe(el);
    setViewport(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  // Measured from whatever row happens to be rendered, every pass, because
  // the face can change size under us and a row goes with it.
  useLayoutEffect(() => {
    const row = ref.current?.querySelector("[data-row]");
    const height = row?.offsetHeight ?? 0;
    // Only ever set to a new value, so this settles after one pass.
    if (height && height !== rowHeight) setRowHeight(height);
  }, [rowHeight, count, viewport]);

  const ready = rowHeight > 0 && viewport > 0;

  const start = ready ? Math.max(0, block - overscan) : 0;

  const end = ready
    ? Math.min(count, block + BLOCK + Math.ceil(viewport / rowHeight) + overscan)
    : Math.min(count, FIRST_PASS);

  return {
    ref,
    onScroll,
    start,
    end,
    /** Stand-ins for the rows above and below, so the scrollbar stays honest. */
    padTop: start * rowHeight,
    padBottom: Math.max(0, (count - end) * rowHeight),
  };
}

export default useWindowedRows;
