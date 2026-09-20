# Mali's AO Toolkit

An overlay for *Anarchy Online*. A launcher puck sits on top of the game, and
each connected plugin gets a small window: a mission roller, an item
assistant. Everything is drawn in a generated pixel font so the text stays
sharp at overlay sizes.

It runs as an Electron desktop app, and in a browser during development.

---

## Running it

```bash
npm install
npm run mock       # stand-in backends, so the UI works with no game running
npm start          # http://localhost:3000
```

`npm run mock` serves the two things the UI talks to (see **Backends** below)
with synthetic data. It is not a simulator — it produces the shapes the front
end reads and nothing more — but it is enough to build and look at every
panel without the game.

For the desktop shell:

```bash
npm run electron:dev     # CRA dev server + Electron pointed at it
npm run electron:build   # production build, then electron-builder into dist/
```

## Tests, lint and build

```bash
npm run test:ci    # the whole suite, once
npm test           # watch mode
npm run build      # production build; also runs ESLint
```

ESLint runs as part of the build (`eslintConfig: react-app` in
`package.json`). `CI=true npm run build` treats warnings as errors, and is
the check worth running before a commit — it should be clean.

---

## How it is put together

```
src/index.js          mounts App and the stylesheets
  App.jsx             the launcher puck, and one window per connected app
    shell/            the puck, and which apps are currently shown
    AppWindow.jsx     one app's window: frame, tabs, panels
    hooks/            sockets, window frames, search, item resolution
  apps/               one folder per app — see apps/README.md
    defineApp.jsx     the app contract
    roller/           Mission Roller   (plugin on :7069)
    item-assistant/   Item Assistant   (plugin on :7068)
  items/              shared item row, tooltip and their data hooks
  ui/                 PHOSPHOR: the UI kit — see ui/README.md
  packages/pixel-text bitmap text the browser cannot antialias
  lib/                item database client, cache, formatter, game data
```

Data flows one way. `useAppSessions` owns one WebSocket per app and turns
incoming messages into state through the app's own `messages` map; the shell
hands each panel that state, and a panel changes things by calling `set`
(a setting, mirrored to the plugin) or `send` (a raw message).

**Adding an app** is a folder with a `config.jsx` in it — the registry
discovers it, there is nothing to register.
[`apps/README.md`](src/apps/README.md) is the walkthrough and
[`apps/TEMPLATE.jsx`](src/apps/TEMPLATE.jsx) is a working app to copy.

### Backends

| | | |
| --- | --- | --- |
| `ws://localhost:7069/ws` | Mission Roller plugin | messages, both ways |
| `ws://localhost:7068/ws` | Item Assistant plugin | messages, both ways |
| `http://localhost:7068` | Item Assistant plugin | inventory, over HTTP |
| `http://localhost:7070` | AOItemQueryService | the shared item database |

A plugin that is not running is the normal case — the game is not always up —
so a window waits rather than erroring, and the socket retries every 2s.
Requests to the item database raise a named `ItemDbError` that callers are
expected to catch.

---

## Things worth knowing before editing

**Text is drawn, not typeset.** Chromium on Windows antialiases every glyph
it rasterises and offers no way to stop it, so text goes through `PixelText`,
which paints a mask built from a bitmap atlas. A raw string in JSX renders as
ordinary DOM text and will look soft next to everything else. See
[`packages/pixel-text/README.md`](src/packages/pixel-text/README.md).

**Whole pixels, everywhere.** A window at `x = 10.5` puts every glyph inside
it on a half pixel. Positions are rounded once, at the point they are
computed — the launcher's radial layout, the tooltip's placement, the
slider's knob.

**Build for 320px.** The windows sit over the game; anything wider is a
bonus. The window sets `container-type: inline-size`, so `@container`
queries respond to the window rather than the viewport.

**Rebuild state, never mutate it.** Assigning into `settings.rollList` and
then calling `set` passes the same reference, React sees no change, and the
panel redraws only when something else happens to re-render it.

**Split live values from committed ones.** `Slider` and `NumberInput` fire
`onChange` continuously and `onCommit` once. Push to the plugin from
`onCommit`, or one drag sends a hundred `updateConfig` messages.

**Declare transient state.** State that came from a one-off message, or that
mirrors something only the plugin knows, goes in `transient` so it is not
persisted. Without it a `missionHit` is replayed from storage on the next
load and the roll list decrements for a mission that was never rolled.

**Read through the cache.** `lib/itemCache.js` caches templates, names and
icons by id and coalesces requests in flight. Call `membersOf`, `namesOf` and
`iconsOf` rather than the `lib/db.js` equivalents, or the same icon is
fetched once per row.

---

## Tooling notes

`tools/` holds the font pipeline — `build-pixel-font.py` reads the monochrome
bitmap strikes out of TerminusTTF and re-emits each as a font whose glyphs are
literal rectangles; `build-pixel-atlas.py` renders the sheets in
`packages/pixel-text/atlas/`. Neither runs as part of a build; the generated
files are committed.

`tools/mock-backends.js` needs `ws`, which is currently only present as a
transitive dependency. If `npm run mock` ever fails to resolve it, install it
as a dev dependency.

Terminus Font is © Dimitar Zhekov, SIL Open Font License 1.1.
