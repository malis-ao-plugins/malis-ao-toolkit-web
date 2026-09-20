import { APP_CONFIGS } from "./apps.config";
import { useAppSessions } from "./hooks/useAppSessions";
import { useShownApps } from "./shell/useShownApps";
import { Launcher } from "./shell/Launcher";
import AppWindow from "./AppWindow";

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

// Offset each first-time window so a fresh install does not stack them.
const firstPos = (index) => ({ x: 48 + index * 28, y: 72 + index * 28 });

export default function App() {
  const { connections, states, send, push } = useAppSessions(APP_CONFIGS);
  const { isShown, hide, toggle } = useShownApps();

  return (
    <>
      <Launcher
        apps={APP_CONFIGS}
        connections={connections}
        isShown={isShown}
        onToggle={toggle}
      />

      {APP_CONFIGS.map((config, i) => {
        if (!connections[config.id] || !isShown(config.id)) return null;

        return (
          <AppWindow
            key={config.id}
            config={config}
            initialPos={firstPos(i)}
            onMinimise={() => hide(config.id)}
            session={{
              connected: connections[config.id],
              state: states[config.id] ?? {},
              send: (msg) => send(config.id, msg),
              push: (partial) => push(config.id, partial),
            }}
          />
        );
      })}
    </>
  );
}
