import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PREFIX = "appState_";
const SAVE_DELAY = 400;

/** The toolkit hub: whichever game client holds port 7067. */
export const HUB_URL = "ws://localhost:7067/ws";

/** The state key of an app that keeps one state for every client. */
export const ALL = "*";

/**
 * One socket to the toolkit hub, and every app's state, per client.
 *
 * Every injected game client joins one hub, and every message through it
 * names its app and its client (the character): `{ app, client, ... }`. The
 * hub tells the page which clients are connected and which apps each runs.
 *
 * How an app splits its state across clients is its own declaration:
 *
 *   multiClient: false   one state for all clients, as before; a message from
 *                        any client lands in it, and a send goes to them all
 *   multiClient: true    a state per client, under the client's id, so two
 *                        characters in two dungeons are two maps
 *   clientSettings       with multiClient, settings are per client too (the
 *                        roller's roll list); without it they are shared, kept
 *                        under ALL, and a change goes to every client
 *
 * State lives in `states[appId][key]`, where key is ALL or a client id. The
 * ALL record is stored under the key apps always used, so saved settings carry
 * over, and a client seen for the first time starts from it.
 *
 * Reconnection is a flat 2s retry. The hub comes and goes with the game
 * clients, so a dropped socket is the normal case rather than an error.
 *
 * An app declares which of its state keys are transient, and those are kept
 * out of storage in both directions — stripped on the way in as well as on
 * the way out, so state written by an earlier version does not keep being
 * replayed after the fix.
 */

const storageKey = (appId, key) =>
  key === ALL ? PREFIX + appId : `${PREFIX}${appId}@${key}`;

const without = (state, keys) => {
  if (!keys?.size) return state;
  return Object.fromEntries(
    Object.entries(state ?? {}).filter(([key]) => !keys.has(key)),
  );
};

const load = (storage, transientKeys) => {
  try {
    const saved = JSON.parse(localStorage.getItem(storage));
    return saved ? without(saved, transientKeys) : null;
  } catch {
    return null;
  }
};

const isPlainObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Saved settings over the app's defaults, one level deeper for keyed
 * collections: saved zones replaced the whole default zone list, so a zone
 * added to the defaults later stayed missing - which the plugin reads as off.
 */
const mergeSettings = (initial = {}, saved = {}) =>
  Object.fromEntries(
    Object.keys({ ...initial, ...saved }).map((key) => [
      key,
      isPlainObject(initial[key]) && isPlainObject(saved[key])
        ? { ...initial[key], ...saved[key] }
        : key in saved
          ? saved[key]
          : initial[key],
    ]),
  );

const save = (storage, state, transientKeys) => {
  try {
    localStorage.setItem(storage, JSON.stringify(without(state, transientKeys)));
  } catch {
    /* private mode */
  }
};

/** Which state key a message from, or a send to, `client` uses. */
export const keyFor = (config, client) =>
  config.multiClient && client != null ? String(client) : ALL;

/** Which record holds the settings for `key`. */
const settingsKeyFor = (config, key) =>
  config.multiClient && config.clientSettings ? key : ALL;

/**
 * What a window shows for one key: the client's own record, with the shared
 * settings in it when the app shares them.
 */
export const viewState = (config, appStates, key) => {
  const shared = appStates?.[ALL];
  if (!config.multiClient || key === ALL) return shared;

  const own = appStates?.[key];
  if (!own) return shared;
  return config.clientSettings ? own : { ...own, settings: shared?.settings };
};

/** The ALL record: saved state over the declared defaults. */
const loadShared = (config, transientKeys) => {
  const initial = config.initialState();
  const saved = load(storageKey(config.id, ALL), transientKeys);

  // Settings merge a level deeper than the rest of state. A flat spread
  // replaces the whole settings object with whatever was saved, so a setting
  // added after someone last used the app arrives undefined - and its control
  // renders empty.
  return saved
    ? { ...initial, ...saved, settings: mergeSettings(initial.settings, saved.settings) }
    : initial;
};

/**
 * A client's record, the first time this page sees that client. Saved state
 * if there is any; otherwise the app's defaults, with settings taken from the
 * shared record so a new character starts from what was last used.
 */
const loadClient = (config, key, shared, transientKeys) => {
  const { settings: initialSettings, ...initial } = config.initialState();
  const saved = load(storageKey(config.id, key), transientKeys);

  if (!config.clientSettings) {
    const { settings: _ignored, ...rest } = saved ?? {};
    return { ...initial, ...rest };
  }

  return saved
    ? { ...initial, ...saved, settings: mergeSettings(initialSettings, saved.settings) }
    : { ...initial, settings: mergeSettings(initialSettings, shared?.settings) };
};

export function useAppSessions(configs) {
  const byId = useMemo(
    () => Object.fromEntries(configs.map((c) => [c.id, c])),
    [configs],
  );
  const transient = useMemo(
    () => new Map(configs.map((c) => [c.id, new Set(c.transientKeys ?? [])])),
    [configs],
  );
  const transientRef = useRef(transient);
  transientRef.current = transient;

  const socket = useRef(null);
  const retry = useRef(null);
  const alive = useRef(true);

  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState([]);
  const clientsRef = useRef(clients);
  clientsRef.current = clients;

  const [states, setStates] = useState(() =>
    Object.fromEntries(
      configs.map((c) => [
        c.id,
        { [ALL]: loadShared(c, new Set(c.transientKeys ?? [])) },
      ]),
    ),
  );

  // The socket handlers outlive renders; this is how they read current state.
  const statesRef = useRef(states);
  statesRef.current = states;

  // Persisting runs on a timer, not inside the state updater.
  //
  // A streaming app makes that difference expensive: the dungeon map sends a
  // position every frame, and saving per message turned each one into a
  // synchronous localStorage write on the main thread. A write is also a side
  // effect, and React is free to run an updater twice for one update, so in
  // StrictMode every message wrote twice. Recording the state in a ref is
  // idempotent, which is why that part can stay where it is.
  const dirty = useRef(new Map());
  const flushTimer = useRef(null);

  const flush = useCallback(() => {
    clearTimeout(flushTimer.current);
    flushTimer.current = null;
    for (const [, { appId, key, state }] of dirty.current) {
      save(storageKey(appId, key), state, transientRef.current.get(appId));
    }
    dirty.current.clear();
  }, []);

  const markDirty = useCallback(
    (appId, key, state) => {
      dirty.current.set(`${appId}\u0000${key}`, { appId, key, state });
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

  /** The clients that run an app. */
  const clientsWith = useCallback(
    (appId) =>
      clientsRef.current.filter((c) => c.apps?.includes(appId)).map((c) => c.client),
    [],
  );

  const sendTo = useCallback((appId, client, msg) => {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ ...msg, app: appId, client }));
    }
  }, []);

  /** A message for the client behind `key`, or for every client under ALL. */
  const send = useCallback(
    (appId, key, msg) => {
      const targets = key === ALL ? clientsWith(appId) : [Number(key)];
      for (const client of targets) sendTo(appId, client, msg);
    },
    [clientsWith, sendTo],
  );

  /**
   * Merge a partial into the record for `key`. Settings go to the record that
   * holds them, which for shared settings is ALL. `partial` may be a function
   * of the state the window shows, for a message that changes part of a
   * nested value: the socket handler cannot see state that has not rendered
   * yet, and the updater can.
   */
  const patch = useCallback(
    (appId, key, partial) => {
      const config = byId[appId];
      if (!config) return;

      setStates((prev) => {
        let app = prev[appId];

        // A client can speak before the hub's list of clients names it.
        if (!app[key]) {
          app = {
            ...app,
            [key]: loadClient(config, key, app[ALL], transientRef.current.get(appId)),
          };
        }

        const resolved =
          typeof partial === "function"
            ? partial(viewState(config, app, key))
            : partial;
        if (!resolved) return app === prev[appId] ? prev : { ...prev, [appId]: app };

        const { settings, ...rest } = resolved;
        let next = app;

        if ("settings" in resolved) {
          const at = settingsKeyFor(config, key);
          const record = { ...next[at], settings };
          next = { ...next, [at]: record };
          markDirty(appId, at, record);
        }

        if (Object.keys(rest).length) {
          const record = { ...next[key], ...rest };
          next = { ...next, [key]: record };
          markDirty(appId, key, record);
        }

        return next === prev[appId] ? prev : { ...prev, [appId]: next };
      });
    },
    [byId, markDirty],
  );

  /** Merge state, and mirror settings to the clients that hold them. */
  const push = useCallback(
    (appId, key, partial) => {
      const config = byId[appId];
      if (!config) return;

      patch(appId, key, partial);
      if ("settings" in partial) {
        const at = settingsKeyFor(config, key);
        send(appId, at, { type: "updateConfig", settings: partial.settings });
      }
    },
    [byId, patch, send],
  );

  // Which app on which client has been sent its settings since it appeared.
  const announced = useRef(new Set());

  /**
   * The hub's list of clients. A client a multi-client app has not seen gets
   * a record, and every app on a client that just appeared is sent its
   * settings: a plugin starts with none of its own, and only hears
   * updateConfig when something changes, so a fresh inject works without
   * touching a control.
   */
  const onClients = useCallback(
    (list) => {
      setClients(list);

      const present = new Set();
      const fresh = [];
      for (const { client, apps = [] } of list) {
        for (const appId of apps) {
          const config = byId[appId];
          if (!config) continue;
          const pair = `${appId}@${client}`;
          present.add(pair);
          if (!announced.current.has(pair)) fresh.push({ config, client });
        }
      }
      for (const pair of [...announced.current]) {
        if (!present.has(pair)) announced.current.delete(pair);
      }
      if (!fresh.length) return;

      const created = {};
      for (const { config, client } of fresh) {
        announced.current.add(`${config.id}@${client}`);
        const key = keyFor(config, client);
        const app = statesRef.current[config.id];

        let record = app[key] ?? created[config.id]?.[key];
        if (!record) {
          record = loadClient(config, key, app[ALL], transientRef.current.get(config.id));
          created[config.id] = { ...created[config.id], [key]: record };
        }

        const view = viewState(config, { ...app, [key]: record }, key);
        sendTo(config.id, client, { type: "updateConfig", settings: view?.settings });
      }

      if (Object.keys(created).length) {
        setStates((prev) => {
          const next = { ...prev };
          for (const [appId, records] of Object.entries(created)) {
            const missing = Object.fromEntries(
              Object.entries(records).filter(([key]) => !prev[appId][key]),
            );
            next[appId] = { ...prev[appId], ...missing };
          }
          return next;
        });
      }
    },
    [byId, sendTo],
  );

  useEffect(() => {
    alive.current = true;

    const connect = () => {
      if (!alive.current) return;

      const ws = new WebSocket(HUB_URL);
      socket.current = ws;

      ws.onopen = () => {
        if (alive.current) setOpen(true);
      };

      ws.onclose = () => {
        if (!alive.current) return;
        setOpen(false);
        setClients([]);
        announced.current.clear();
        retry.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();

      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        if (data?.hub === "clients") {
          onClients(Array.isArray(data.clients) ? data.clients : []);
          return;
        }

        const config = byId[data?.app];
        if (!config) return;
        const partial = config.handleMessage?.(data);
        if (partial) patch(config.id, keyFor(config, data.client), partial);
      };
    };

    connect();

    return () => {
      alive.current = false;
      clearTimeout(retry.current);
      socket.current?.close();
    };
    // Configs are discovered at module load and never change at runtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connections = useMemo(
    () =>
      Object.fromEntries(
        configs.map((c) => [
          c.id,
          open && clients.some((client) => client.apps?.includes(c.id)),
        ]),
      ),
    [configs, open, clients],
  );

  return { connections, clients, states, send, push };
}

export default useAppSessions;
