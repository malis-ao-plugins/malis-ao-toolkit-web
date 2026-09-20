# PHOSPHOR

The shared UI kit for AO Toolkit apps. Built compact-first: the reference
target is a **320px-wide overlay** sitting on top of the game client. Anything
wider is treated as a bonus, never a requirement.

```jsx
import { Panel, Button, Toggle, Slider } from "../../ui";
```

One import pulls in `ui.css`, which carries the font face, the tokens and all
component styles. There is nothing else to wire up.

---

## The fonts are generated

`tools/build-pixel-font.py` reads the monochrome bitmap strikes out of
TerminusTTF and re-emits each one as a font whose glyphs are literal
rectangles, with `unitsPerEm` set to an exact multiple of that strike's pixel
size. Run it after changing which sizes the kit offers:

```
python tools/build-pixel-font.py
```

This is not a flourish. Shipping TerminusTTF as-is does not work in a browser
on Windows:

- `-webkit-font-smoothing: none` is a **macOS-only** property in Blink. On
  Windows it is parsed and ignored, so it cannot turn ClearType off.
- Chromium rasterises through DirectWrite, which ignores monochrome embedded
  bitmaps — so it draws Terminus' *outlines* instead.
- Those outlines are not grid-aligned: `unitsPerEm` is 1000 against strikes at
  12/14/16/…px, and the coordinate GCD is 1. At every size except 20px a glyph
  edge lands mid-pixel, and ClearType smears that edge across the RGB
  subpixels. That is the blue fringing.

Rebuilt as rectangles on an exact grid there is nothing left to antialias:
every device pixel is wholly inside a rectangle or wholly outside it, so
greyscale coverage is 0 or 1 and the glyph is hard-edged.

**Geometry is only half of it — the other half is not ours to control.**

Chromium on Windows antialiases text from the *system* font-smoothing setting.
Nothing in CSS or in the font can override it. All three of the obvious levers
were tried and measured on this machine:

| Lever | Result |
| --- | --- |
| `-webkit-font-smoothing: none` | **No effect.** macOS-only in Blink. Rendering `auto` / `none` / `antialiased` came out byte-identical. |
| `--disable-lcd-text` (Chrome/Electron switch) | Removes the *colour* only. A one-pixel stem still renders `93/228/93` across three pixels — greyscale, but filtered. |
| `gasp` table without `DOGRAY` | **No effect.** Skia reads `gasp` but never lets it disable antialiasing. |
| Windows font smoothing **off** | **Binary.** 0 partial pixels at 12, 16 and 24px. |

So the app ships with `--disable-lcd-text` in `electron.js` (it costs nothing
and kills the colour fringing), and true one-bit output additionally requires
**Windows font smoothing to be off** — Settings → Performance Options → untick
"Smooth edges of screen fonts", or `HKCU\Control Panel\Desktop\FontSmoothing`.
That is a machine-wide choice affecting every application, so it is the user's
to make, not the app's.

With smoothing off there is a second payoff: aliased rendering snaps glyphs to
whole pixels, so text centred in an odd-width box stops landing on a half pixel
and rule 3 below stops being load-bearing.

## The three rules

Break any of these and the text goes blurry. That is the whole reason the kit
exists.

**1. A size always travels with its family.** Each generated face is correct at
exactly one size (and whole multiples of it). There are three — **12, 16, 24** —
and setting `--fs-16` without `--ff-16` gets you the 12px face stretched to
16px, which is precisely the problem this kit was built to avoid. Use the
`.t12` / `.t16` / `.t24` helpers, or set both custom properties together. Never
set a size in `rem`, `em` or `%`, and never invent a step.

**2. Every length is a whole multiple of `--u` (4px).** Use `--u` … `--u8`, or
the `ph-gap-*` classes. No `padding: 0.75em`, no `calc()` that can land on a
half pixel.

**3. Never transform a text-bearing element.** No `scale()`, no `rotate()`, no
fractional `translate()`, no `zoom` on a subtree. To move something, set an
integer `left`/`top`. To reveal something, animate height or opacity. The
`Slider` knob is positioned by a measured integer `left` for exactly this
reason — a percentage would put it on a half pixel and smear the bar. A glyph
drawn at x=10.5 is blurred no matter how exact the font is.

Put `className="ph"` on your app's outermost element; everything below it
inherits the base family and size.

---

## Tokens

All tokens live on `:root` in `ui.css`. Use the variable, never the literal.

| Group | Tokens |
| --- | --- |
| Grid | `--u` `--u2` `--u3` `--u4` `--u5` `--u6` `--u8` |
| Type | `--ff-12` `--ff-16` `--ff-24` with `--fs-12`/`--lh-12`, `--fs-16`/`--lh-16`, `--fs-24`/`--lh-24` |
| Cells | `--cell-12` (6px) `--cell-16` (8px) `--cell-24` (12px) — the glyph width at each step |
| Controls | `--ctl-h` `--ctl-h-sm` `--ctl-h-lg` `--icon` `--icon-sm` |
| Surfaces | `--c-bg-0` … `--c-bg-4`, `--c-window`, `--c-panel`, `--c-line`, `--c-line-hi` |
| Text | `--c-fg` `--c-fg-hi` `--c-fg-dim` `--c-fg-mute` |
| Accents | `--c-accent` (amber, interaction) `--c-info` (cyan, data) `--c-good` `--c-warn` `--c-bad` `--c-hot` |

Colour has one job each: **amber** means "you can act on this, or it is
currently active", **cyan** means "this is a number the game gave us",
red/green/yellow are semantic only. Everything else is greyscale so the game
behind an overlay stays readable.

### Skins

Two attributes on the app root retune the kit without touching components:

```jsx
<div className="ph" data-skin="overlay" data-density="comfortable">
```

- `data-skin="overlay"` — translucent window and panel surfaces so the game
  reads through.
- `data-density="comfortable"` — taller controls and larger icons for a
  full-size window. Type sizes are untouched; only spacing grows.

---

## Components

| Component | Notes |
| --- | --- |
| `Panel` | Titled container. `collapsible` + `open` + `onToggle`, or pass `onHeadMouseDown` to use the head as a drag handle. `flush` removes body padding for lists. |
| `Button` | `variant`: `default` `primary` `danger` `ghost`. `size`: `sm` `md` `lg`. `block` fills the row. |
| `Toggle` | On/off. A hard 8px box, not a sliding switch — a knob animating across a track cannot land on whole pixels. |
| `Segmented` | Mutually exclusive choice, fills its container. `items: [{value,label}]`. |
| `SearchInput` | Text filter with clear button, optional `count` and trailing `right` control. |
| `NumberInput` | Integer field. Drag horizontally to scrub (one step per 4px), click to type, `−`/`+` to nudge. `onChange` is live, `onCommit` fires once on release/blur/Enter. |
| `Slider` | Value picker with optional end captions. Same `onChange`/`onCommit` split. |
| `Stack` / `Row` | Flex helpers. `gap` is in grid units, so `gap={2}` is 8px. |
| `Stat` | Label/value pair. `num` tints the value cyan. |
| `Badge` | Small pill. `tone`: `default` `accent` `info`. |
| `Slot` | Fixed icon cell, dashed when empty. `size`: `md` `sm`. |
| `List` / `ListRow` | Scroll region and its rows. |
| `Collapse` | Height-only reveal. |
| `Empty` | Centred placeholder line. |
| `Divider` | 1px rule. |

### The onChange / onCommit split

`NumberInput` and `Slider` both separate the two. `onChange` fires on every
movement so the UI tracks the pointer; `onCommit` fires once when the
interaction ends. Push local state from `onChange` and send to the socket from
`onCommit`, or a single drag will emit a hundred `updateConfig` messages.

---

## Working at 320px

- A `Panel` body at default density costs 8px of padding each side, leaving
  **302px** of usable width — **50 characters** of Px12, or 37 of Px16.
- AO icon art is 48x48, which is what `--icon` is. Only whole divisors of it
  resample cleanly, so `--icon-sm` is 24px and `ItemIcon` offers 48/24/16.
  Six small `Slot`s plus 4px gaps come to 164px.
- `Toggle` and `Button` are 20px tall; two rows of controls plus a panel head
  is 60px.
- Size boxes in `ch` where you can. With a monospaced face 1ch is exactly one
  cell, so `width: 4ch` is 24px at Px12 and never lands mid-glyph.
- Prefer stacked `Panel`s over side-by-side columns. Below ~360px there is no
  honest two-column layout, and squeezing one in is what makes text wrap into
  a single character per line.
- Give scroll regions an explicit height and let them scroll. Vertical
  scrolling is fine; horizontal scrolling is not.
