import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PREFIX = "appState_";
const SAVE_DELAY = 400;

/**
 * One WebSocket per app, owned in one place.
 *
 * Previously the canvas opened a socket for every app to watch connection
 * state, and then each window opened its own for the app it hosted — so every
 * running app had two live connections and received every message twice. The
 * sessions live here now and windows are handed what they need.
 *
 * Reconnection is a flat 2s retry. The plugin comes and goes with the game
 * client, so a dropped socket is the normal case rather than an error.
 *
 * An app declares which of its state keys are transient, and those are kept
 * out of storage in both directions — stripped on the way in as well as on
 * the way out, so state written by an earlier version does not keep being
 * replayed after the fix.
 */

const without = (state, keys) => {
  if (!keys?.size) return state;
  return Object.fromEntries(
    Object.entries(state ?? {}).filter(([key]) => !keys.has(key)),
  );
};

const load = (id, transientKeys) => {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFIX + id));
    return saved ? without(saved, transientKeys) : null;
  } catch {
    return null;
  }
};

const save = (id, state, transientKeys) => {
  try {
    localStorage.setItem(
      PREFIX + id,
      JSON.stringify(without(state, transientKeys)),
    );
  } catch {
    /* private mode */
  }
};

export function useAppSessions(configs) {
  const transient = useMemo(
    () =>
      new Map(configs.map((c) => [c.id, new Set(c.transientKeys ?? [])])),
    [configs],
  );
  const transientRef = useRef(transient);
  transientRef.current = transient;

  const sockets = useRef({});
  const timers = useRef({});
  const started = useRef(new Set());
  const alive = useRef(true);

  const [connections, setConnections] = useState(() =>
    Object.fromEntries(configs.map((c) => [c.id, false])),
  );

  const [states, setStates] = useState(() =>
    Object.fromEntries(
      configs.map((c) => {
        const initial = c.initialState();
        const saved = load(c.id, new Set(c.transientKeys ?? []));

        // Settings merge a level deeper than the rest of state. A flat spread
        // replaces the whole settings object with whatever was saved, so a
        // setting added after someone last used the app arrives undefined -
        // and its control renders empty.
        return [
          c.id,
          saved
            ? { ...initial, ...saved, settings: { ...initial.settings, ...(saved.settings ?? {}) } }
            : initial,
        ];
      }),
    ),
  );

  // Persisting runs on a timer, not inside the state updater.
  //
  // A streaming app makes that difference expensive: the dungeon map sends a
  // position ten times a second, and saving per message turned each one into a
  // synchronous localStorage write on the main thread. A write is also a side
  // effect, and React is free to run an updater twice for one update, so in
  // StrictMode every message wrote twice. Recording the state in a ref is
  // idempotent, which is why that part can stay where it is.
  const dirty = useRef(new Map());
  const flushTimer = useRef(null);

  const flush = useCallback(() => {
    clearTimeout(flushTimer.current);
    flushTimer.current = null;
    for (const [id, state] of dirty.current) {
      save(id, state, transientRef.current.get(id));
    }
    dirty.current.clear();
  }, []);

  const patch = useCallback(
    (id, partial) => {
      setStates((prev) => {
        const next = { ...prev[id], ...partial };
        dirty.current.set(id, next);
        return { ...prev, [id]: next };
      });
      if (!flushTimer.current) flushTimer.current = setTimeout(flush, SAVE_DELAY);
    },
    [flush],
  );

  // Nothing queued may be lost to a reload or a closed tab.
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [flush]);

  const send = useCallback((id, msg) => {
    const ws = sockets.current[id];
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  /** Merge state, and mirror settings to the plugin when they are part of it. */
  const push = useCallback(
    (id, partial) => {
      patch(id, partial);
      if ("settings" in partial) {
        send(id, { type: "updateConfig", settings: partial.settings });
      }
    },
    [patch, send],
  );

  useEffect(() => {
    alive.current = true;

    for (const config of configs) {
      if (started.current.has(config.id)) continue;
      started.current.add(config.id);

      const connect = () => {
        if (!alive.current) return;

        const ws = new WebSocket(`ws://localhost:${config.port}/ws`);
        sockets.current[config.id] = ws;

        ws.onopen = () =>
          alive.current &&
          setConnections((p) => ({ ...p, [config.id]: true }));

        ws.onclose = () => {
          if (!alive.current) return;
          setConnections((p) => ({ ...p, [config.id]: false }));
          timers.current[config.id] = setTimeout(connect, 2000);
        };

        ws.onerror = () => ws.close();

        ws.onmessage = (event) => {
          let data;
          try {
            data = JSON.parse(event.data);
          } catch {
            return;
          }
          const partial = config.handleMessage?.(data);
          if (partial) patch(config.id, partial);
        };
      };

      connect();
    }

    const openSockets = sockets.current;
    const pendingTimers = timers.current;

    return () => {
      alive.current = false;
      for (const id of Object.keys(openSockets)) {
        clearTimeout(pendingTimers[id]);
        openSockets[id]?.close();
      }
    };
    // Configs are discovered at module load and never change at runtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connections, states, send, push };
}

export default useAppSessions;
