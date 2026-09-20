import { useEffect, useState } from "react";
import { ATLASES, atlasKey } from "./atlases";

/**
 * Atlas loading.
 *
 * Module-level rather than a React context: an atlas is immutable, shared by
 * every consumer, and there is no sensible way to have two of them. A context
 * would only add a provider that every app has to remember to mount.
 */

const loaded = new Map(); // key -> { image, meta, index }
const pending = new Map(); // key -> Promise
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn();
}

function load(key) {
  if (loaded.has(key)) return Promise.resolve(loaded.get(key));
  if (pending.has(key)) return pending.get(key);

  const entry = ATLASES[key];
  if (!entry) return Promise.resolve(null);

  const promise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      // Char -> cell index, built once so drawing is a map lookup per glyph.
      const index = new Map();
      [...entry.meta.chars].forEach((ch, i) => index.set(ch, i));

      const atlas = { image, meta: entry.meta, index };
      loaded.set(key, atlas);
      pending.delete(key);
      notify();
      resolve(atlas);
    };
    image.onerror = () => {
      pending.delete(key);
      resolve(null);
    };
    image.src = entry.url;
  });

  pending.set(key, promise);
  return promise;
}

/** Warm every atlas up front. Optional — useful on app start to avoid a flash. */
export function preloadPixelFonts() {
  return Promise.all(Object.keys(ATLASES).map(load));
}

export function getAtlas(size, weight) {
  return loaded.get(atlasKey(size, weight)) ?? null;
}

/**
 * Returns the atlas once it is decoded, re-rendering the caller when it lands.
 * Until then it returns null and the caller falls back to ordinary text.
 */
export function useAtlas(size, weight) {
  const key = atlasKey(size, weight);
  const [atlas, setAtlas] = useState(() => loaded.get(key) ?? null);

  useEffect(() => {
    let alive = true;

    const sync = () => {
      const next = loaded.get(key) ?? null;
      if (alive) setAtlas(next);
    };

    listeners.add(sync);
    load(key).then(sync);

    return () => {
      alive = false;
      listeners.delete(sync);
    };
  }, [key]);

  return atlas;
}
