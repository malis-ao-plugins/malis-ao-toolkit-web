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

## The text is drawn, not typeset

Every visible string goes through `PixelText`, which paints glyphs from an
atlas in [`src/pixelfont`](../pixelfont/README.md) — a junction to the shared
aowebui folder. Those atlases are rasterised out of Windows' own font
machinery at a fixed pixel height, so they are the shapes the game itself
draws.

**Do not edit anything under `src/pixelfont`.** It is shared with other
projects and is not tracked by this repository. If an atlas is missing a
character or a size, ask for it — give the face, the style, and the cell
height in pixels.

This is not a flourish. A browser will not give you guaranteed bilevel text:

- Every `@font-face` is run through OpenType Sanitizer, which strips the
  embedded bitmap strikes (`EBDT`/`EBLC`) a pixel font carries. A font with
  hand-made pixel bitmaps loses them on the way into the browser.
- Chromium then antialiases the outlines from the *system* font-smoothing
  setting, which nothing in CSS or in the font can override.

So the glyphs are rasterised ahead of time and blitted. The kit paints them
through a **CSS mask** over `currentColor` rather than into a canvas, which
is the one thing it does differently from aowebui's own `<pixel-text>`
element: about forty rules in this file colour text on hover, on active, on
selection, and a canvas cannot see any of them. The composing and the
device-pixel snapping are still pixelfont's.

The real string stays in the DOM underneath, transparent, so selecting drags
over real text and the clipboard gets text.

The app also ships `--disable-lcd-text` in `electron.js`. It no longer
matters for the drawn text, only for the handful of characters that still go
through the font stack.

### The atlases, and the ones that are missing

| Step | Atlas | Notes |
| --- | --- | --- |
| `--fs-12` | `verdana-13` | the base size |
| bold | `verdana-bold-13` | |
| `--fs-16` | `verdana-16` | |
| `--fs-24` | `verdana-bold-20` | nearest that exists, and bold |

`fontFor(size, weight)` resolves a request to the nearest atlas, matching
weight first so a bold request stays bold. Exact coverage of the kit's own
scale would want **verdana-bold-16** and a **verdana-24** pair.

The atlases are latin1 (U+0020–U+00FF). A character outside that draws
nothing at all and logs a warning once — which is why the kit uses `...`
rather than `…`, `-` rather than `–`, and a CSS border triangle rather than
`▼`. A wider `--chars` export would let those come back.

## The three rules

Break any of these and the text goes blurry. That is the whole reason the kit
exists.

**1. A size always travels with its family.** An atlas is exact only at the
pixel height it was exported at, so the steps are the atlases that exist —
**13, 16, 20 bold**. `PixelText` resolves whatever you ask for to the nearest
one. For DOM text, use the `.t12` / `.t16` / `.t24` helpers, or set `--fs-*`
and `--ff-*` together. Never set a size in `rem`, `em` or `%`.

**1b. Measure, never count characters.** The faces are proportional. A
string's width is the sum of its advances, so `measure(text, size)` and
`fitToWidth(text, px, size)` from `ui/fonts.js` are how anything gets a fixed
box or an ellipsis. The kit used to be monospaced and counted cells; nothing
should any more.

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
| Type | `--ff-12` `--ff-16` `--ff-24` with `--fs-12`/`--lh-12`, `--fs-16`/`--lh-16`, `--fs-24`/`--lh-24`. These style DOM text only — drawn text takes its face from the atlas. |
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
  **302px** of usable width. How many characters that is depends on the
  characters: the face is proportional, so measure with `measure()` rather
  than assuming.
- AO icon art is 48x48, which is what `--icon` is. Only whole divisors of it
  resample cleanly, so `--icon-sm` is 24px and `ItemIcon` offers 48/24/16.
  Six small `Slot`s plus 4px gaps come to 164px.
- `Toggle` and `Button` are 20px tall; two rows of controls plus a panel head
  is 60px.
- `ch` is still a fair unit for a column of digits — it is the advance of
  "0" in the same face at the same size — but it is only a proxy for
  anything else. Note that a `width` in a stylesheet cannot size a
  `PixelText` at all: it carries an inline width, so use `flex-basis`.
- Prefer stacked `Panel`s over side-by-side columns. Below ~360px there is no
  honest two-column layout, and squeezing one in is what makes text wrap into
  a single character per line.
- Give scroll regions an explicit height and let them scroll. Vertical
  scrolling is fine; horizontal scrolling is not.
