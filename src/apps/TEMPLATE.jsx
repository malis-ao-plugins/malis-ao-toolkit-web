/**
 * Starting point for a new app. Copy this file to:
 *
 *     src/apps/<your-app>/config.jsx
 *
 * and it appears in the hub — the registry discovers any `config.jsx` one
 * level under src/apps/, so there is nothing to register. It will show up as
 * soon as something is listening on its port.
 *
 * This file itself is never mounted: it is not in a folder of its own.
 */

import { defineApp } from "./defineApp";
import { Button, Empty, List, ListRow, PixelText, Row, Stack, Stat, Toggle } from "../ui";

/* ── Panels ────────────────────────────────────────────────────────────────
 *
 * Every panel gets the same props:
 *
 *   settings      persisted, and mirrored to the plugin on every change
 *   set(p)        merge into settings — persists and sends `updateConfig`
 *   state         message results and transient flags
 *   setState(p)   merge into state — persisted locally, never sent
 *   send(msg)     raw message to the plugin
 *
 * Panels are ordinary components. Use hooks freely; the shell mounts and
 * unmounts them as tabs change, so per-panel state belongs in the panel.
 */

function ThingsPanel({ state, send }) {
  const things = state.things ?? [];

  if (!things.length) return <Empty>Nothing yet</Empty>;

  return (
    <List className="tpl-list">
      {things.map((thing) => (
        <ListRow key={thing.id}>
          <PixelText className="ph-listrow__name">{thing.name}</PixelText>
          <Button
            size="sm"
            onClick={() => send({ type: "use", id: thing.id })}
          >
            Use
          </Button>
        </ListRow>
      ))}
    </List>
  );
}

function OptionsPanel({ settings, set }) {
  return (
    <Stack gap={1}>
      <Toggle
        block
        label="Do the thing"
        on={!!settings.enabled}
        onChange={(v) => set({ enabled: v })}
      />
      <Row between>
        <Stat k="Seen" v={String(settings.seen ?? 0)} num />
        <Button size="sm" onClick={() => set({ seen: 0 })}>
          Reset
        </Button>
      </Row>
    </Stack>
  );
}

/** Optional. Sits in the title bar, gets the same props. */
function Controls({ state, setState, send }) {
  const running = !!state.running;
  return (
    <Button
      variant={running ? "danger" : "primary"}
      onClick={() => {
        send({ type: running ? "stop" : "start" });
        setState({ running: !running });
      }}
    >
      {running ? "Stop" : "Start"}
    </Button>
  );
}

/* ── The app ─────────────────────────────────────────────────────────────── */

export default defineApp({
  // Port the plugin's WebSocket listens on. Also the default storage key.
  port: 7100,
  name: "Template",

  // Persisted and sent to the plugin as `updateConfig` whenever `set` runs.
  settings: {
    enabled: true,
    seen: 0,
  },

  // Persisted locally only. Message handlers write here.
  state: {
    running: false,
    things: [],
  },

  // Incoming message type -> partial state. Anything not listed is ignored.
  messages: {
    thingList: (d) => ({ things: d.things }),
    thingSeen: (d) => ({ lastSeen: d.thing }),
  },

  header: Controls,

  // Optional: shape raw state into something panels want, once per render.
  // derive: (state) => ({ enabledCount: ... }),

  // `title` may be a string or a function of the same props the panel gets,
  // which is how a live count ends up in the header. `fixed` means the panel
  // cannot be collapsed — use it for the one panel that is the app's point.
  panels: {
    things: {
      title: ({ state }) => `Things · ${state.things?.length ?? 0}`,
      fixed: true,
      component: ThingsPanel,
    },
    options: {
      title: "Options",
      component: OptionsPanel,
    },
  },

  // Tabs reference panels by key. The first tab is the default.
  tabs: [
    { id: "tab-main", label: "Main", panels: ["things"] },
    { id: "tab-cfg", label: "Config", panels: ["options"] },
  ],
});
