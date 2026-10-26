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

`npm run mock` stands in for all three backends the UI talks to (see
**Backends** below) with synthetic data. It is not a simulator — it produces
the shapes the front end reads and nothing more — but it is enough to build
and look at every panel without the game.

For the desktop shell:

```bash
npm run electron:dev     # CRA dev server + Electron pointed at it
npm run electron:build   # production build, then electron-builder into dist/
```

Testing the overlay with the game running:

```
npm start
npx cross-env NODE_ENV=development electron . --overlay
```

The overlay sits on whichever injected client is in front and hides when none is. Add `--overlay-direct-input` to be able to type into its text fields; without it the overlay never takes keyboard focus from the game.

## Tests, lint and build

```bash
npm run test:ci    # the whole suite, once
npm test           # watch mode
npm run build      # production build; also runs ESLint
npm run shot       # render the running app to tools/shot.png
```

`npm run shot` drives the app in Electron and writes a PNG, so a visual
change can be looked at instead of reasoned about. It reads
`tools/screenshot.json`: which URL, what size, an optional setup script run
in the page first (`screenshot-setup.js` places the windows,
`screenshot-firstrun.js` wipes them to show a fresh install), keys to press,
and an optional probe script whose return value is logged — which is how the
inventory columns and the focus rings were checked.

ESLint runs as part of the build (`eslintConfig: react-app` in
`package.json`). `CI=true npm run build` treats warnings as errors, and is
the check worth running before a commit — it should be clean.

## The page in game

Users don't run any of this. The toolkit plugins serve a finished build of
the page on `http://localhost:7067` while any of them is injected. That build
lives in `plugin/www`, inside a small C# library in `plugin/` that the plugins
list as a dependency; see `plugin/README.md`.

`npm run plugins` builds the page and copies it into `plugin/www`. A push to
`main` that touches the page's source does the same in CI and commits the
result (`.github/workflows/publish-page.yml`), so `plugin/www` is never older
than `src/`. Don't edit `plugin/www` by hand.

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
    dungeon-map/      Dungeon Map      (plugin on :7071)
  items/              shared item row, tooltip and their data hooks
  ui/                 PHOSPHOR: the UI kit — see ui/README.md
  pixelfont/          copied in from aowebui — see "The font" below
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
| `ws://localhost:7071/ws` | Dungeon Map plugin | the dungeon, then position updates |
| `http://localhost:7070` | AOItemQueryService | the shared item database |

All four have a stand-in in `npm run mock`.

A plugin that is not running is the normal case — the game is not always up —
so a window waits rather than erroring, and the socket retries every 2s.
Requests to the item database raise a named `ItemDbError` that callers are
expected to catch.

**Known gap.** The finder's **Flags** panel cannot work yet. The front end
builds and sends `canBits` / `itemBits` correctly, but the running
AOItemQueryService ignores both — a search with every bit set returns the
same rows as one with none (checked against the live service on 2026-09-20).
`modFilter`, `statFilter` and `reqFilter` were checked the same way and do
filter. The panel stays inert until the service implements the two fields.

`npm run mock` cannot bind 7070 while the real service is running; stop one
or the other.

---

## Things worth knowing before editing

**Text is drawn, not typeset.** Chromium on Windows antialiases every glyph
it rasterises and offers no way to stop it, so text goes through `PixelText`,
which paints a mask built from a bitmap atlas. A raw string in JSX renders as
ordinary DOM text and will look soft next to everything else. See
[`src/ui/README.md`](src/ui/README.md).

**The atlases are latin1.** A character outside U+0020–U+00FF draws nothing
at all. That is why the UI writes `...` rather than an ellipsis character and
`-` rather than an en dash, and why the select's caret is a CSS triangle.

**Measure, do not count characters.** The face is proportional. A string's
width is the sum of its advances, so use `measure()` and `fitToWidth()` from
`src/ui/fonts.js` rather than assuming a character count.

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

**A PixelText cannot be sized by `width`.** It carries an inline width from
the mask it built, and an inline style beats a stylesheet rule, so
`width: 10ch` in a class is ignored and `text-align` has no text to act on.
Use `flex-basis` for the box and `mask-position` for the alignment.

---

## The font

`src/pixelfont` is a copy of `pixelfont` from `aowebui`, a private repo
shared with other projects. It is committed here so a fresh clone builds
without access to it. Don't edit it in place: change it in `aowebui`, then
copy the folder over again.

If an atlas is missing a character or a size, ask for it — give the face, the
style, and the cell height in pixels, which is not a point size. The
workbench that produces the atlases, and the research behind how the game
renders text, live in `aowebui`.

Wanted, and not yet exported: **verdana-bold-16** and a **verdana-24** pair,
which would cover the kit's scale exactly; and a wider `--chars` set than
latin1, which would bring back the ellipsis, the en dash and the caret
triangles.

## Tooling notes

`tools/mock-backends.js` needs `ws`, which is currently only present as a
transitive dependency. If `npm run mock` ever fails to resolve it, install it
as a dev dependency.
