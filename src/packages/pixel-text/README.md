# @mali/pixel-text

Bitmap text for React that the browser **cannot** antialias.

```jsx
import { PixelText } from "../../packages/pixel-text";

<PixelText size={12}>ACCEPT</PixelText>
<PixelText size={16} weight={700} maxCh={30}>{mission.name}</PixelText>
```

Colour comes from CSS — the element paints `currentColor` through a mask, so
`color`, `:hover` and theme swaps all work exactly as they would for real text.

---

## Why this exists

Chromium on Windows decides whether to antialias text from the **system**
font-smoothing setting. From [`ui/gfx/font_render_params_win.cc`](https://github.com/chromium/chromium/blob/main/ui/gfx/font_render_params_win.cc):

```cpp
if (SystemParametersInfo(SPI_GETFONTSMOOTHING, 0, &enabled, 0) && enabled)
  params_->antialiasing = true;
```

There is no command-line switch and no CSS property that overrides it. All of
these were tried and measured:

| Attempt | Result |
| --- | --- |
| `-webkit-font-smoothing: none` | No effect — macOS-only in Blink. `auto` / `none` / `antialiased` render byte-identically. |
| `--disable-lcd-text` | Removes the *colour* only. A one-pixel stem still renders `93/228/93` across three pixels. |
| `gasp` table without `DOGRAY` | No effect — Skia reads `gasp` but never lets it disable antialiasing. |
| A grid-exact generated font | Necessary, but not sufficient — a correct outline still goes through the same filter. |

And it is not a browser-only problem: Electron, Tauri (WebView2), NW.js and CEF
are all Chromium, so packaging does not escape it.

**Images are not text.** `image-rendering: pixelated` is nearest-neighbour by
specification, and a mask consumed at its natural size is not resampled at all.
So a glyph that arrives as pixels stays as pixels — on any engine, on any
machine, with nothing for the user to configure.

---

## What you give up

- **Automatic line wrapping.** Strings render on one line. Wrap by splitting.
- **CSS `text-overflow: ellipsis`.** Use `maxCh`, or `fitToWidth` — which with
  a monospaced face is plain arithmetic and needs no layout pass.
- **Selection highlight.** The text is still in the DOM (clipped), so
  find-in-page, copy-paste and screen readers work; the blue selection box does
  not appear over the glyphs.

Anything the atlas cannot render — an unlisted character, or before the sheet
has decoded — falls back to ordinary DOM text automatically. Softer, never
missing.

---

## API

| Export | Purpose |
| --- | --- |
| `<PixelText>` | `size` (12/16/24, nearest wins) · `weight` (400/700) · `scale` (integer upscale) · `maxCh` · `as` · plus any DOM props |
| `preloadPixelFonts()` | Warm every sheet at start-up to avoid a first-paint fallback flash |
| `measure(text, size, weight?, scale?)` | Rendered width in px |
| `cellWidth(size)` / `cellHeight(size)` | 6/8/12 and 12/16/24 |
| `charsThatFit(px, size)` | How many characters fit a width |
| `fit(text, maxCh)` / `fitToWidth(text, px, size)` | Truncate with an ellipsis |
| `useAtlas(size, weight)` | The loaded atlas, or null |

Sizes are **12, 16 and 24** only, in regular and bold. A bitmap face is correct
at the size it was drawn for; `scale` gives whole multiples of those.

---

## Regenerating the atlases

```
python tools/build-pixel-atlas.py
```

Reads the `EBDT`/`EBLC` strikes out of `src/ui/fonts/TerminusTTFWindows-*.ttf`
and writes `atlas/terminus-<size>-<weight>.{png,json}`. Sheets are 1.4–2.7KB
each. Edit `CHARS` in that script to extend coverage.

Terminus Font is © Dimitar Zhekov, SIL Open Font License 1.1.

---

## Lifting it out

Self-contained: `atlas/`, six source files and this README. It depends only on
React. To publish it properly, move the folder out of `src/packages/`, keep
`tools/build-pixel-atlas.py` and `tools/terminus_strikes.py` alongside it, and
add a bundler step — it currently relies on the host bundler to resolve the
`.png` and `.json` imports in `atlases.js`.
