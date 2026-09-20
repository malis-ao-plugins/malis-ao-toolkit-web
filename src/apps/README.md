# Building an app

An app is one folder with a `config.jsx` in it. The registry discovers any
`config.jsx` one level under `src/apps/`, so there is nothing to register and
no shared list to edit.

```
src/apps/my-app/
  config.jsx        the declaration — what it is, what it shows
  MyPanel.jsx       a panel component
  useMyData.js      data fetching, kept out of the view
  my-app.css        anything the kit has no opinion about
```

Copy [`TEMPLATE.jsx`](./TEMPLATE.jsx) into `src/apps/<name>/config.jsx` and
start deleting. It is a complete working app.

---

## The declaration

```jsx
export default defineApp({
  port: 7100,               // the plugin's WebSocket port; also the storage key
  name: "Mission Roller",
  vendor: "Mali's",         // optional, shown only when the window is wide

  settings: { … },          // persisted AND mirrored to the plugin
  state: { … },             // persisted locally only
  transient: ["rolling"],   // state that must NOT survive a reload

  messages: {               // incoming type -> partial state
    missionResults: (d) => ({ missions: d.missions }),
  },

  header: Controls,         // optional component for the title bar
  derive: (state) => ({…}), // optional, shape state once per render

  panels: {
    missions: { title: "Missions", fixed: true, component: MissionsPanel },
  },
  tabs: [
    { id: "tab-roll", label: "Roll", panels: ["missions"] },
  ],
});
```

`defineApp` validates this in development. A tab naming a panel that does not
exist, a panel with no component, two apps on one port — each is a console
error naming the app, rather than a blank window.

---

## What a panel gets

Every panel and the header receive the same five things. There is no context
to import and no store to wire up.

| Prop | |
| --- | --- |
| `settings` | Persisted, and sent to the plugin as `updateConfig` on every change |
| `set(partial)` | Merge into settings. Persists and sends. |
| `state` | Message results and transient flags, plus anything `derive` added |
| `setState(partial)` | Merge into state. Persisted locally, never sent. |
| `send(msg)` | Raw message to the plugin |

Panels are ordinary components — use hooks freely. The shell mounts and
unmounts them as tabs change, so panel-local state belongs in the panel, not
in `state`.

**`settings` vs `state`:** if the plugin needs to know it, it is a setting. If
it came *from* the plugin, or it only matters to the window, it is state. The
roll list is a setting; the rolled missions are state.

**`transient`:** state that would be wrong if it came back. A one-off event
from the plugin, or a flag that mirrors something only the plugin knows.
Transient keys are never written to storage and are reset to their declared
default on load — in both directions, so a key that an older build persisted
stops being replayed as soon as it is declared.

The roller declares `rolling` and `lastHit`. Without it, `missionHit` was
saved with the rest of the state and consumed again on every reload, so the
roll list decremented for a mission that was never rolled; and a window
reloaded mid-roll showed Stop for a roller that had stopped.

---

## Two rules worth knowing

**Rebuild, never mutate.** `set` merges a *new* object. Assigning into
`settings.rollList` and then calling `set` passes the same reference, React
sees no change, and the panel only redraws when something else happens to
re-render it. That bug was in the roller for a long time and looked like a
race.

**Split live from committed.** Controls that drag — `Slider`, `NumberInput` —
fire `onChange` continuously and `onCommit` once. Hold the live value in
panel state and call `set` from `onCommit`, or one drag sends a hundred
`updateConfig` messages down the socket.

```jsx
const [drag, setDrag] = useState(null);

<Slider
  value={drag?.key === s.key ? drag.value : settings[s.key]}
  onChange={(v) => setDrag({ key: s.key, value: v })}
  onCommit={(v) => { setDrag(null); set({ [s.key]: v }); }}
/>
```

---

## Layout

Build for **320px wide** and treat anything more as a bonus — the windows are
meant to sit over the game. See [`src/ui/README.md`](../ui/README.md) for the
kit, the tokens and the pixel-grid rules, and
[`src/pixelfont/README.md`](../pixelfont/README.md) for
why text is drawn from an atlas rather than by the font.

The window sets `container-type: inline-size`, so `@container` queries respond
to the window rather than the viewport — which is what you want when several
windows of different widths share the canvas. The Item Assistant drops its
`In`, `Location` and `Char` columns that way rather than squeezing them.

All text goes through the kit's components or `PixelText`. A raw string in
JSX renders as ordinary DOM text, which the browser will antialias.

---

## Data

Keep fetching out of the view. `useInventory.js` in the Item Assistant is the
shape to copy: three named stages, each with its own effect, returning plain
data. The panel then has no effects at all.

The shared item database client is `src/lib/db.js` (port 7070, names, icons,
stats). A plugin's own HTTP endpoints belong in the app folder — see
`item-assistant/inventoryDb.js`.

---

## Checklist

- [ ] Folder with `config.jsx`, default-exporting `defineApp(…)`
- [ ] Port matches the plugin
- [ ] Every tab's panel keys exist in `panels`
- [ ] `set` for anything the plugin needs; `setState` for the rest
- [ ] `transient` for events and for anything mirroring plugin-only state
- [ ] Drag controls commit on release, not on move
- [ ] Readable at 320px
- [ ] No raw strings in JSX — use `PixelText` or a kit component
