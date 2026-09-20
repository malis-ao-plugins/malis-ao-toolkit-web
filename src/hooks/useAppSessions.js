import { useCallback, useEffect, useRef, useState } from "react";

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
 */

const load = (id) => {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + id));
  } catch {
    return null;
  }
};

const save = (id, state) => {
  try {
    localStorage.setItem(PREFIX + id, JSON.stringify(state));
  } catch {
    /* private mode */
  }
};

export function useAppSessions(configs) {
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
        const saved = load(c.id);
        return [c.id, saved ? { ...initial, ...saved } : initial];
      }),
    ),
  );

  const patch = useCallback((id, partial) => {
    setStates((prev) => {
      const next = { ...prev[id], ...partial };
      save(id, next);
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

    return () => {
      alive.current = false;
      for (const id of Object.keys(sockets.current)) {
        clearTimeout(timers.current[id]);
        sockets.current[id]?.close();
      }
    };
    // Configs are discovered at module load and never change at runtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connections, states, send, push };
}

export default useAppSessions;
