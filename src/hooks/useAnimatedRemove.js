import { useState, useRef } from "react";

/**
 * Manages the "removing" set + setTimeout pattern used whenever a row
 * should animate out before being unmounted.
 *
 * Usage:
 *   const { removing, scheduleRemove } = useAnimatedRemove(350);
 *
 *   // trigger removal of an item identified by `key`
 *   scheduleRemove(key, () => dispatch({ type: "removeItem", id }));
 *
 *   // in the row: pass isRemoving={removing.has(key)}
 */
export function useAnimatedRemove(delay = 320) {
  const [removing, setRemoving] = useState(new Set());
  const timers = useRef({});

  const scheduleRemove = (key, removeFn) => {
    if (removing.has(key)) return;
    setRemoving(prev => new Set([...prev, key]));
    timers.current[key] = setTimeout(() => {
      removeFn();
      setRemoving(prev => { const n = new Set(prev); n.delete(key); return n; });
      delete timers.current[key];
    }, delay);
  };

  return { removing, scheduleRemove };
}