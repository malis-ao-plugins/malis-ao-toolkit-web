import { useState } from "react";
import { APP_CONFIGS } from "./apps.config";
import { useAppSessions } from "./hooks/useAppSessions";
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

export default function App() {
  const { connections, states, send, push } = useAppSessions(APP_CONFIGS);
  const { isShown, hide, toggle } = useShownApps();
  const { theme, set: setTheme, reset: resetTheme } = useTheme();
  const [options, setOptions] = useState(false);

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
