import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PREFIX = "appState_";

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
        return [c.id, saved ? { ...initial, ...saved } : initial];
      }),
    ),
  );

  const patch = useCallback((id, partial) => {
    setStates((prev) => {
      const next = { ...prev[id], ...partial };
      save(id, next, transientRef.current.get(id));
      return { ...prev, [id]: next };
    });
  }, []);

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
