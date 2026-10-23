# pixelfont

1-bit bitmap text for the web. No antialiasing, no colour fringing, no dependencies,
no build step.

## Why it draws its own text

You cannot get guaranteed bilevel text out of CSS. Every `@font-face` is run through
OpenType Sanitizer, which strips embedded bitmap strikes (`EBDT`/`EBLC`) — so a font
carrying hand-made pixel bitmaps loses them on the way into the browser. Strikes survive
only for fonts installed on the system and referenced with `local()`, which is not
something you can ship.

So the only reliable route is to rasterise the glyphs ahead of time and blit them
yourself. That is what this does.

## Three halves, now

Two ways to get an atlas, and one library that draws with either.



**`export_font.py`** rasterises an installed Windows font into an atlas. Glyphs come out
of GDI as 1bpp masks — a monochrome target physically cannot hold a grey level, so
antialiasing is impossible rather than merely disabled.

```
python export_font.py --face verdana --size 13
python export_font.py --face verdana --size 13 --bold
python export_font.py --face "Lucida Console" --size 16 --chars ascii
```

`--size` is a **cell height in pixels**, not points. `--chars` takes `ascii`, `latin1`, or
a literal string. Atlases land in `pixelfont/fonts/` as one JSON per face/size/style.

**`rasterize.js`** does the same job in the browser, for a face the system already has,
so a font can be tried without going back to Python.

```js
import { rasterizeFont, registerFont, PixelFont } from "./pixelfont/index.js";

const atlas = rasterizeFont({ face: "Tahoma", size: 13 });
registerFont("tahoma-13", PixelFont.fromJSON(atlas));
```

It returns exactly what the exporter writes, so an atlas made this way can be saved
into `fonts/` like any other.

It cannot reach GDI, though, and that is the whole difference. It asks the browser to
draw each glyph and then throws the greys away, and how good that is depends on one
setting on the machine:

| Windows font smoothing | Result |
| --- | --- |
| **off** | The rasteriser returns aliased glyphs already. Thresholding takes nothing away, and the atlas comes out close to an exported one. |
| **on** | Outlines are not grid-fitted, so cutting the greys gives hard edges on soft shapes - uneven stems, the odd dropout at small sizes. |

So: rasterise to try a face, export the one you settle on.

`listLocalFonts()` returns the families the machine has, or null where the browser
will not say - Local Font Access is permission-gated and wants https or localhost.

**The ES module** loads an atlas and draws with it. Plain DOM and plain modules, so it
works unchanged in vanilla JS, React, Vue or anything else.

## Use

ES modules need a server; `file://` will not do. Anything works — `python -m http.server`,
Vite, whatever the host project already uses.

```js
import { loadFont } from "./pixelfont/index.js";

await loadFont("chat", "./pixelfont/fonts/verdana-13.json");
```

```html
<pixel-text font="chat" ink="#ffdd55" scale="2">Hello</pixel-text>
<pixel-input font="chat" ink="#ffdd55" scale="2"></pixel-input>
```

`scale` must be a whole number. `ink` is any hex colour.

### Imperative

```js
import { getFont } from "./pixelfont/index.js";

const font = getFont("chat");

font.measure("hello");                     // width in px: the sum of advances
font.height;                               // cell height
const { canvas } = font.render("hello", { ink: "#fff", scale: 2 });
font.draw(ctx, "hello", x, y, { ink: "#fff", scale: 2 });   // into a canvas you own
```

`font.compose(text)` returns `{ w, h, pen, mask, pens, missing }` if you want the raw
1-bit mask — `pens` holds the pen x at every string index, which is what caret placement
and hit-testing need.

## `<pixel-input>`

A real `<input>` with `color: transparent` and `caret-color: transparent` sits invisibly on
top of the canvas. It owns the string, the selection, the keyboard, the clipboard, undo and
IME; the canvas owns every visible pixel.

The hidden input lays out in a different font, so everything positional is taken over:
caret placement, click-to-position, drag-select and double-click word select all work off
the atlas's own advances. It fires `input` and `change`, and exposes `.value` and `.focus()`,
so it behaves like a form control.

### Known gaps

- **IME composition does not preview.** Text appears once it lands in `value`, so composing
  Japanese, Chinese or Korean is blind.
- **Not form-associated.** No `name`, `disabled`, `readonly`, `maxlength` or `placeholder`, and
  it will not submit with a `<form>`. Use the `input` event and `.value`.
- **Touch drag selects rather than scrolls**, because `pointerdown` is intercepted to place the
  caret. Fine on desktop, wrong on a phone.
- **The caret blink re-encodes the whole string's `ImageData`** every 530ms. Imperceptible for a
  chat line, wasteful for a very long one.

## Two things that will bite you

**Device pixel ratio.** At 125% or 150% Windows scaling, or browser zoom off 100%, one CSS
pixel is not one device pixel, and drawing at fractional device coordinates makes the canvas
antialias the edges — exactly the artifact this exists to avoid. Every canvas here snaps to
a whole number of device pixels (`deviceScale()`), so the effective zoom may differ slightly
from the `scale` you asked for. That trade is deliberate: square, hard pixels beat an exact
multiplier.

**Never CSS-scale the canvas.** A `max-width: 100%` inherited from a global stylesheet will
resample it and undo all of this. Put the canvas in an `overflow-x: auto` container instead.

## Metrics font

`metrics-font.js` builds a real TrueType font out of an atlas. Every glyph in
it is empty; all it carries is advance widths.

That is for the hidden text. A page that paints pixelfont glyphs keeps the
real string in the DOM underneath, transparent, so selecting drags over text
and the clipboard gets text — and in a field, so the browser still owns the
caret, the keyboard and the IME. The browser lays that string out in whatever
font it was told to use, and if those advances are not the atlas' advances,
the caret and the selection drift off the painted glyphs.

Scaling an installed face to match gets close and no closer. The atlas'
advances are whole pixels, rounded once at export; a vector face's are not.
Pick the size where a paragraph comes out the same width and a run of one
repeated letter still walks away from the text — for that one letter the
rounding never averages out. There is no size that fixes it.

```js
import { installMetricsFont } from "./metrics-font.js";

const family = await installMetricsFont(font);   // null if the browser refuses
if (family) {
  el.style.fontFamily = `"${family}", monospace`;
  el.style.fontSize = `${font.size}px`;          // the atlas size, exactly
}
```

Units per em is the atlas' cell height times 64 and each advance is its pixel
advance times 64, so at `font-size: <cell height>px` every advance resolves to
a whole pixel. latin1 comes to under 2 KB and needs no network.

`installMetricsFont` answers `null` rather than throwing if the sanitiser
refuses the font, so a caller can fall back to whatever it was doing before.
`metricsFontData(font)` hands back the raw bytes if you want to write one out.

## Atlas format

```jsonc
{
  "format": "pixelfont-1",
  "face": "verdana", "size": 13, "bold": false,
  "tmHeight": 13, "ascent": 11, "descent": 2, "overhang": 0,
  "cell": 64,            // the 64x64 scratch bitmap glyphs are rasterised into
  "clipped": [],         // codepoints that hit that limit
  "glyphs": {
    "65": { "w": 16, "h": 13, "adv": 8, "rows": ["0000", "..."] }
  }
}
```

Rows are hex, one per scanline, stride `(w + 7) / 8`, MSB first. **Ink is a clear bit** —
GDI draws black on white into a 1bpp target, so a `0` is ink and a `1` is background.

`w` is twice the advance. Glyph bitmaps overlap their neighbours on purpose; that headroom
carries overhang. Compositing must therefore write ink only, never copy a rectangle, or each
glyph erases the tail of the one before it.

Glyphs larger than 64×64 are clipped by the rasteriser — the export warns when it happens.
