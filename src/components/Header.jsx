import "./header.css";
import { PixelText } from "../ui";

/**
 * Window title bar, and the handle the window is dragged by.
 *
 * At the 320px overlay target there is no room for a vendor name, a full app
 * name and the word "Connected", so the link state is a single square with the
 * detail in its tooltip and the app name is the only text that survives.
 *
 * The app-switcher hamburger that used to live here is gone: a window hosts
 * exactly one app now, and the launcher is how you get to the others.
 */
export default function Header({
  connected,
  activeConf,
  activeState,
  send,
  pushConfig,
  onMinimise,
}) {
  return (
    <div className="header">
      <PixelText upper className="header-title" title={activeConf?.label}>
        {activeConf?.name2 ?? "Toolkit"}
      </PixelText>

      <div
        className={`conn-dot${connected ? " conn-dot--on" : ""}`}
        title={connected ? "Connected to the plugin" : "Waiting for the plugin"}
      />

      {activeConf?.HeaderControls && (
        <activeConf.HeaderControls
          connected={connected}
          activeState={activeState}
          send={send}
          pushConfig={pushConfig}
        />
      )}

      {/* Minimise, not close: the window goes away, its position and tabs do
          not. Bring it back from the launcher. */}
      <button
        type="button"
        className="header-min"
        title="Minimise to the launcher"
        aria-label="Minimise"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onMinimise}
      >
        <span className="header-min__bar" />
      </button>
    </div>
  );
}
