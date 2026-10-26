import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { APP_CONFIGS } from "./apps.config";
import { ALL, useAppSessions, viewState } from "./hooks/useAppSessions";
import { useShownApps } from "./shell/useShownApps";
import { Launcher } from "./shell/Launcher";
import { SettingsWindow } from "./shell/SettingsWindow";
import { useTheme } from "./shell/theme";
import AppWindow from "./AppWindow";
import { DEFAULT_FRAME } from "./hooks/useWindowFrame";

/**
 * The overlay.
 *
 * A launcher puck, and one window per app that is both connected and not
 * minimised. That is the whole shell.
 *
 * The previous version was a pannable canvas of windows that could be dragged
 * into each other and merged, with panels torn off into floating satellites.
 * Sitting over a game none of that earned its keep: panning moves windows
 * relative to a background you cannot see, and a merged window has no obvious
 * way back. Windows are now independent and stay where they are put.
 */

const MARGIN = 48;
const GAP = 16;

/**
 * Where a window goes the first time it is ever shown.
 *
 * Side by side rather than cascaded. A window is 320px wide and the step was
 * 28px, so each one landed almost exactly on top of the one before it — the
 * stacking the offset existed to prevent. Wraps to another row, nudged down,
 * when the screen runs out of width.
 */
const firstPos = (index) => {
  const step = DEFAULT_FRAME.width + GAP;
  const perRow = Math.max(
    1,
    Math.floor((window.innerWidth - MARGIN * 2 + GAP) / step),
  );

  return {
    x: MARGIN + (index % perRow) * step,
    y: 72 + Math.floor(index / perRow) * GAP * 2,
  };
};

/**
 * Which client a window shows, remembered per app. A client that is gone
 * falls back to the first one there is, without forgetting the choice, so
 * the window goes back to it when it returns.
 */
function useSelectedClient(appId, clients) {
  const storage = `client_${appId}`;
  const [chosen, setChosen] = useState(() => {
    try {
      return Number(localStorage.getItem(storage)) || null;
    } catch {
      return null;
    }
  });

  const select = useCallback(
    (client) => {
      setChosen(client);
      try {
        localStorage.setItem(storage, String(client));
      } catch {
        /* private mode */
      }
    },
    [storage],
  );

  const ids = clients.map((c) => c.client);
  return [ids.includes(chosen) ? chosen : (ids[0] ?? null), select];
}

/** Running as the in-game overlay (electron.js --overlay). */
const OVERLAY = new URLSearchParams(window.location.search).get("overlay") === "1";

/**
 * One app's window, insulated from the others.
 *
 * Every incoming message replaces the whole states object, so without this
 * every window reconciles whenever any plugin says anything. The dungeon map
 * sends a frame at the game's frame rate, which meant the item assistant —
 * several hundred elements — re-rendered sixty times a second for news that
 * had nothing to do with it. Measured at 41fps with it open, 160fps without.
 *
 * `patch` keeps the other apps' slices by identity, so a memo here holds for
 * every app but the one the message was for.
 */
const AppSlot = memo(function AppSlot({
  config,
  connected,
  appStates,
  clients,
  focused,
  send,
  push,
  hide,
  raise,
  initialPos,
  z,
}) {
  const [client, selectClient] = useSelectedClient(config.id, clients);

  // Bringing a client to the front shows its tab. Clicking another tab still
  // works; the next focus change decides again.
  useEffect(() => {
    if (focused != null && clients.some((c) => c.client === focused)) {
      selectClient(focused);
    }
  }, [focused, clients, selectClient]);

  const key = config.multiClient && client != null ? String(client) : ALL;

  // Rebuilt only when this window's own record or the shared one changes.
  const own = appStates[key];
  const shared = appStates[ALL];
  const state = useMemo(
    () => viewState(config, { [ALL]: shared, [key]: own }, key),
    [config, key, own, shared],
  );

  const session = useMemo(
    () => ({
      connected,
      state,
      clients,
      client,
      selectClient,
      send: (msg) => send(config.id, key, msg),
      push: (partial) => push(config.id, key, partial),
    }),
    [connected, state, clients, client, selectClient, send, push, config.id, key],
  );

  const onMinimise = useCallback(() => hide(config.id), [hide, config.id]);
  const onRaise = useCallback(() => raise(config.id), [raise, config.id]);

  return (
    <AppWindow
      config={config}
      session={session}
      initialPos={initialPos}
      z={z}
      onRaise={onRaise}
      onMinimise={onMinimise}
    />
  );
});

export default function App() {
  const { connections, clients, windows, focused, states, send, push } =
    useAppSessions(APP_CONFIGS);

  // The overlay sits on the client in front, and hides when none is.
  const game = focused != null ? windows[String(focused)] : null;
  const gameBounds = game?.bounds;
  useEffect(() => {
    if (!OVERLAY) return;
    window.electronAPI?.setGameWindow?.(
      gameBounds ? { visible: true, bounds: gameBounds } : { visible: false, bounds: null },
    );
  }, [gameBounds]);

  // Each app's clients, held by identity until the hub's list changes.
  const appClients = useMemo(
    () =>
      Object.fromEntries(
        APP_CONFIGS.map((c) => [
          c.id,
          clients.filter((client) => client.apps?.includes(c.id)),
        ]),
      ),
    [clients],
  );
  const { isShown, hide, toggle } = useShownApps();
  const { theme, set: setTheme, reset: resetTheme } = useTheme();
  const [options, setOptions] = useState(false);

  // Which window is in front. Windows stacked in declaration order before,
  // so the one you were dragging could sit under one you had not touched.
  // Front-most is last; anything never touched keeps the base layer.
  const [stack, setStack] = useState([]);

  const raise = useCallback((id) => {
    setStack((order) =>
      order[order.length - 1] === id ? order : [...order.filter((x) => x !== id), id],
    );
  }, []);

  // Held by identity, or every window's props change on every render.
  const positions = useMemo(() => APP_CONFIGS.map((_, i) => firstPos(i)), []);

  return (
    <>
      <Launcher
        apps={APP_CONFIGS}
        connections={connections}
        isShown={isShown}
        onToggle={toggle}
        optionsOpen={options}
        onOptions={() => setOptions((v) => !v)}
      />

      {options && (
        <SettingsWindow
          theme={theme}
          onChange={setTheme}
          onReset={resetTheme}
          onClose={() => setOptions(false)}
        />
      )}

      {APP_CONFIGS.map((config, i) => {
        if (!connections[config.id] || !isShown(config.id)) return null;

        return (
          <AppSlot
            key={config.id}
            config={config}
            connected={connections[config.id]}
            appStates={states[config.id]}
            clients={appClients[config.id]}
            focused={focused}
            send={send}
            push={push}
            hide={hide}
            raise={raise}
            initialPos={positions[i]}
            z={10 + stack.indexOf(config.id) + 1}
          />
        );
      })}
    </>
  );
}
