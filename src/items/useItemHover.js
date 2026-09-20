import { useCallback, useEffect, useRef, useState } from "react";
import { useItemData } from "./useItemData";

/**
 * Hover to preview an item, click to pin it.
 *
 * Pinning is what makes the tooltip usable: unpinned it follows the pointer
 * and cannot be reached, pinned it holds still so the QL can be changed and
 * the contents read. Any click elsewhere, or Escape, releases it.
 *
 * Returns handlers to spread on whatever should trigger it, and the state the
 * tooltip needs.
 */
export function useItemHover(item, members, ql, onQlChange) {
  const [at, setAt] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const panelRef = useRef(null);

  const { data, loading, show, hide, interpolate } = useItemData();

  const close = useCallback(() => {
    setPinned(false);
    setHovering(false);
    hide();
  }, [hide]);

  useEffect(() => {
    if (!pinned) return;
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [pinned, close]);

  /** Whole pixels: the tooltip is positioned from this. */
  const track = (e) => setAt({ x: Math.round(e.clientX), y: Math.round(e.clientY) });

  const setQl = (next) => {
    const value = Math.round(Number(next));
    if (Number.isNaN(value)) return;
    onQlChange?.(value);
    interpolate(value, undefined);
  };

  const handlers = {
    onMouseEnter: (e) => {
      if (pinned) return;
      track(e);
      setHovering(true);
      show({ ...item, members }, ql);
    },
    onMouseMove: (e) => {
      if (!pinned) track(e);
    },
    onMouseLeave: () => {
      if (!pinned) {
        setHovering(false);
        hide();
      }
    },
    onMouseDown: (e) => {
      // Stop the window-level listener that closes a pinned tooltip from
      // seeing this very click and closing it again.
      e.stopPropagation();
      if (pinned) {
        close();
      } else {
        setPinned(true);
        setHovering(true);
        show({ ...item, members }, ql);
      }
    },
  };

  return {
    open: hovering || pinned,
    pinned,
    at,
    data,
    loading,
    panelRef,
    handlers,
    setQl,
  };
}

export default useItemHover;
