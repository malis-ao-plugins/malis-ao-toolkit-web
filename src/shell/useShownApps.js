import { useCallback, useEffect, useState } from "react";

const KEY = "shownApps";

/**
 * Which apps currently have a window.
 *
 * Separate from *connected*: an app can be running and deliberately hidden.
 * Minimising writes `false` here, so the window stays gone across reloads and
 * reconnects until it is picked again from the launcher.
 *
 * An app with no entry has never been decided about, and opens on its first
 * connection — otherwise a fresh install shows an empty screen with no clue
 * that anything is there.
 */
function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

export function useShownApps() {
  const [shown, setShown] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(shown));
    } catch {
      /* private mode — the session still works, it just will not persist */
    }
  }, [shown]);

  const isShown = useCallback((id) => shown[id] !== false, [shown]);

  const show = useCallback(
    (id) => setShown((p) => ({ ...p, [id]: true })),
    [],
  );

  const hide = useCallback(
    (id) => setShown((p) => ({ ...p, [id]: false })),
    [],
  );

  const toggle = useCallback(
    (id) => setShown((p) => ({ ...p, [id]: p[id] === false })),
    [],
  );

  return { shown, isShown, show, hide, toggle };
}

export default useShownApps;
