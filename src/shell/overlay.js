import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Whether the toolkit window is sitting over the game right now.
 *
 * There is one window. The main process moves it over whichever injected
 * client is in front and back to where it was when none is (electron.js,
 * followGame), and says so here. In a browser, or before the first word from
 * the main process, it is an ordinary window.
 *
 * Over the game the page is transparent, lets the mouse through except where
 * the UI is, and keeps its own layout: the same windows at the same places
 * would not fit both a 720px window and a full-screen game.
 */

let overlay = false;
const listeners = new Set();

window.electronAPI?.onOverlayMode?.((on) => {
  overlay = Boolean(on);
  document.documentElement.classList.toggle("overlay-mode", overlay);
  document.body.classList.toggle("overlay-mode", overlay);
  listeners.forEach((listener) => listener());

  // Two frames: the first runs before the new look is painted, the second
  // after. Only then may the window be stretched over the game, or it shows
  // the opaque window background across the whole screen for a moment.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => window.electronAPI?.overlayModeApplied?.(overlay)),
  );
});

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isOverlay() {
  return overlay;
}

export function useOverlay() {
  return useSyncExternalStore(subscribe, isOverlay);
}

/** A storage key for what is laid out differently over the game. */
export function layoutKey(key, over = overlay) {
  return over ? `${key}_overlay` : key;
}

// Not "overlayDirectInput": that was written as off on every load while off
// was the default, so it says nothing about what anyone chose.
const DIRECT_INPUT_KEY = "overlayTyping";

/**
 * Whether a text field in the overlay takes the keyboard from the game when
 * it is pressed, until the game is clicked again. On unless switched off.
 * Off, the overlay never takes focus.
 */
export function useOverlayDirectInput() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(DIRECT_INPUT_KEY) !== "0";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(DIRECT_INPUT_KEY, on ? "1" : "0");
    } catch {
      /* private mode */
    }
    window.electronAPI?.setOverlayDirectInput?.(on);
  }, [on]);

  return [on, setOn];
}
