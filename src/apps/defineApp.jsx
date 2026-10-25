/**
 * The app contract.
 *
 * An app is a declaration: what it connects to, what it stores, what messages
 * it understands, and which panels it shows. `defineApp` turns that into the
 * shape the window shell consumes, so nothing in an app file has to know how
 * the shell works.
 *
 * Every panel receives the same props, and they are the only four things an
 * app ever needs:
 *
 *   settings   persisted, and mirrored to the plugin on every change
 *   set(p)     merge into settings — persists and sends `updateConfig`
 *   state      everything else: message results, transient flags
 *   setState(p) merge into state — persisted locally, never sent
 *   send(msg)  raw message to the plugin
 *
 * `transient` names the state keys that must not outlive the session: a
 * one-off event from the plugin, or a flag that mirrors something only the
 * plugin knows. They are never written to storage and are reset to their
 * declared default on load.
 *
 * See apps/README.md for the walkthrough and apps/TEMPLATE.jsx to copy.
 */

const dev = process.env.NODE_ENV !== "production";

export function defineApp(spec) {
  const {
    id,
    port,
    name,
    vendor = "Mali's",
    windowTitle,
    settings: defaultSettings = {},
    state: defaultState = {},
    transient = [],
    messages = {},
    header: Header,
    derive,
    panels = {},
    tabs = [],
  } = spec;

  if (dev) validate(spec, panels, tabs);

  const appId = id ?? `app_${port}`;
  const meta = { id: appId, port, name, vendor };

  /** Build the props every panel and the header share. */
  function bind(ctx) {
    const { settings = {}, send, pushConfig, sectionOpen, ...state } = ctx;
    return {
      settings,
      set: (partial) => pushConfig({ settings: { ...settings, ...partial } }),
      state,
      setState: (partial) => pushConfig(partial),
      send,
      app: meta,
      sectionOpen,
    };
  }

  return {
    id: appId,
    port,
    // The shell splits the title so the vendor can be dropped when narrow.
    name1: vendor,
    name2: name,
    label: vendor ? `${vendor} ${name}` : name,
    windowTitle,

    initialState: () => ({ settings: defaultSettings, ...defaultState }),

    // State the shell must not persist. A `missionHit` replayed from storage
    // on the next load would decrement the roll list for a mission that was
    // never rolled; a persisted `rolling: true` would show Stop for a roller
    // that is not running.
    transientKeys: transient,

    // A handler returns the state to merge, or a function of the current
    // state that returns it.
    handleMessage: (data) => {
      const handler = messages[data?.type];
      if (!handler) return null;
      return handler(data) ?? null;
    },

    deriveData: derive,

    defaultTabs: tabs.map((t) => ({
      id: t.id,
      label: t.label,
      sections: t.panels,
    })),
    defaultActiveTab: tabs[0]?.id,

    // Only the app's own state reaches the header. Spreading the shell's
    // props in as well put `connected` and `activeState` inside what a
    // header component reads as `state`.
    HeaderControls: Header
      ? function BoundHeader({ connected, activeState, send, pushConfig }) {
          const bound = bind({ ...activeState, send, pushConfig });
          return <Header {...bound} connected={connected} />;
        }
      : undefined,

    renderSection: (key, ctx) => {
      const panel = panels[key];
      if (!panel) return null;

      const props = bind(ctx);
      const Panel = panel.component;
      const title =
        typeof panel.title === "function" ? panel.title(props) : panel.title;

      return {
        title: title ?? key,
        // A fixed panel is one the app always wants visible — the shell still
        // lets it be dragged out, it just cannot be collapsed away.
        collapsible: !panel.fixed,
        open: panel.fixed ? true : (props.sectionOpen?.[key] ?? true),
        // A filling panel takes whatever height its tab has rather than
        // sitting at its content's height with dead space under it. The panel
        // says so itself; the shell used to work it out from what was inside,
        // which broke the moment a list was empty.
        fill: !!panel.fill,
        content: <Panel {...props} />,
      };
    },
  };
}

/**
 * Catch the mistakes that otherwise surface as a blank window: a tab naming a
 * panel that does not exist, a panel with no component, two apps on one port.
 */
function validate(spec, panels, tabs) {
  const where = spec.name ?? spec.id ?? "app";

  if (!spec.port) console.error(`[${where}] no port — it cannot connect.`);
  if (!tabs.length) console.error(`[${where}] no tabs — nothing will render.`);

  for (const key of spec.transient ?? []) {
    if (key === "settings") {
      console.error(`[${where}] "settings" cannot be transient.`);
    }
  }

  for (const [key, panel] of Object.entries(panels)) {
    if (!panel?.component) {
      console.error(`[${where}] panel "${key}" has no component.`);
    }
  }

  const known = new Set(Object.keys(panels));
  const used = new Set();

  for (const tab of tabs) {
    if (!tab.id) console.error(`[${where}] a tab has no id.`);
    for (const key of tab.panels ?? []) {
      used.add(key);
      if (!known.has(key)) {
        console.error(
          `[${where}] tab "${tab.id}" lists panel "${key}", which is not defined.`,
        );
      }
    }
  }

  for (const key of known) {
    if (!used.has(key)) {
      console.warn(
        `[${where}] panel "${key}" is defined but no tab shows it.`,
      );
    }
  }
}

export default defineApp;
