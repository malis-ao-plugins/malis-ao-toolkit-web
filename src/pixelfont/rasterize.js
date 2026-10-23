/**
 * rasterize - build an atlas in the browser, from a font the system has.
 *
 * export_font.py is still the better road and remains the default one: it
 * asks GDI for 1bpp masks, which is what Anarchy Online itself does, so the
 * glyphs come back already hinted onto the pixel grid. Nothing here can
 * reach GDI. What it can do is ask the browser to draw a glyph and then
 * throw away the greys.
 *
 * How good that is depends on one setting on the machine:
 *
 *   Windows font smoothing OFF - the rasteriser returns aliased glyphs
 *   already, so thresholding takes nothing away and the result is close to
 *   an exported atlas.
 *
 *   Font smoothing ON - the outlines are not grid-fitted, so cutting the
 *   greys at a threshold gives hard edges on soft shapes: uneven stems and
 *   the odd dropout at small sizes.
 *
 * So: use this to try a face, and export the one you settle on. `toJSON`
 * hands back exactly what export_font.py writes, so an atlas made here can
 * be saved and dropped into fonts/ like any other.
 *
 * The output is a pixelfont-1 atlas, the same shape PixelFont already
 * consumes - see README.md for the format.
 */

/** The scratch cell AO rasterises into. Glyphs are clipped to it. */
const CELL = 64;

export const CHARSETS = {
  ascii: range(0x20, 0x7f),
  latin1: [...range(0x20, 0x7f), ...range(0xa0, 0x100)],
};

function range(from, to) {
  return Array.from({ length: to - from }, (_, i) => from + i);
}

const fontString = (px, face, bold, italic) =>
  `${italic ? "italic " : ""}${bold ? "700 " : "400 "}${px}px "${face}"`;

/**
 * The CSS size whose cell height is the one asked for.
 *
 * `--size` is a cell height in pixels, not a point size, because that is
 * what CreateFontA takes and what the game's own launcher number becomes.
 * CSS font-size is an em size instead, and the relationship between the two
 * is the font's business, so it is searched for rather than calculated.
 *
 * Returns the largest size that does not overshoot, which is what GDI's
 * mapper does when no size lands exactly.
 */
function fitToCell(ctx, face, bold, italic, cell) {
  let best = { px: 1, height: 0, ascent: 1, descent: 0 };

  for (let px = 1; px <= cell * 2; px++) {
    ctx.font = fontString(px, face, bold, italic);
    const m = ctx.measureText("Hg");
    const ascent = Math.ceil(m.fontBoundingBoxAscent);
    const descent = Math.ceil(m.fontBoundingBoxDescent);
    const height = ascent + descent;

    if (height > cell) break;
    best = { px, height, ascent, descent };
    if (height === cell) break;
  }

  return best;
}

/**
 * One glyph, as a run of rows.
 *
 * Ink is a CLEAR bit: the cell starts as all ones and GDI draws black on
 * white, so this inverts to match rather than inventing its own convention.
 * A pixel counts as ink once it is at least `threshold` opaque - the whole
 * point being that there is no in between in the result.
 */
function glyphRows(ctx, canvas, ch, advance, height, ascent, threshold) {
  const w = Math.min(CELL, Math.max(1, advance * 2));
  const h = Math.min(CELL, height);

  ctx.clearRect(0, 0, CELL, CELL);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(ch, 0, ascent);

  const { data } = ctx.getImageData(0, 0, w, h);
  const stride = Math.ceil(w / 8);
  const rows = [];

  for (let y = 0; y < h; y++) {
    const bytes = new Uint8Array(stride).fill(0xff);
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha >= threshold) bytes[x >> 3] &= ~(1 << (7 - (x & 7)));
    }
    rows.push(
      [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""),
    );
  }

  return { w, h, rows };
}

/**
 * Rasterise an installed face into an atlas.
 *
 *   rasterizeFont({ face: "Tahoma", size: 13 })
 *   rasterizeFont({ face: "Consolas", size: 16, bold: true, chars: "ascii" })
 *
 * `size` is a cell height in pixels. `chars` takes "ascii", "latin1", or a
 * literal string; space is always included, because without it every space
 * renders as nothing and words run together.
 */
export function rasterizeFont({
  face,
  size,
  bold = false,
  italic = false,
  chars = "latin1",
  threshold = 128,
} = {}) {
  if (!face) throw new Error("pixelfont: rasterizeFont needs a face");
  if (!size) throw new Error("pixelfont: rasterizeFont needs a cell height");

  const codepoints =
    CHARSETS[chars] ??
    [...new Set([...String(chars)].map((c) => c.codePointAt(0)).concat(0x20))]
      .sort((a, b) => a - b);

  const canvas = document.createElement("canvas");
  canvas.width = CELL;
  canvas.height = CELL;
  // Read back often and never composited: the hint is worth giving.
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const fit = fitToCell(ctx, face, bold, italic, size);
  ctx.font = fontString(fit.px, face, bold, italic);

  const glyphs = {};
  const clipped = [];

  for (const cp of codepoints) {
    // Tab folds to space, the same way GetGlyph does.
    const ch = String.fromCodePoint(cp === 9 ? 32 : cp);
    const advance = Math.max(0, Math.round(ctx.measureText(ch).width));

    if (advance * 2 > CELL || fit.height > CELL) clipped.push(cp);

    const { w, h, rows } = glyphRows(
      ctx,
      canvas,
      ch,
      advance,
      fit.height,
      fit.ascent,
      threshold,
    );

    glyphs[String(cp)] = { w, h, adv: advance, rows };
  }

  return {
    format: "pixelfont-1",
    face,
    size,
    bold,
    italic,
    tmHeight: fit.height,
    ascent: fit.ascent,
    descent: fit.descent,
    // GDI reports overhang for synthesised styles; a browser does not, and
    // the advance it gives already accounts for the shape.
    overhang: 0,
    cell: CELL,
    // Recorded so a caller can say the size was not usable, the way the
    // exporter's "glyphs clipped" note does.
    clipped,
    glyphs,
    // Not from GDI, and a caller may want to say so.
    source: "canvas",
  };
}

/**
 * The faces this machine has, if the browser will say.
 *
 * Local Font Access is permission-gated and only offered over https or on
 * localhost; anywhere it is missing this answers null rather than throwing,
 * and a caller can fall back to asking for a name.
 */
export async function listLocalFonts() {
  if (typeof window === "undefined" || !window.queryLocalFonts) return null;
  try {
    const fonts = await window.queryLocalFonts();
    return [...new Set(fonts.map((f) => f.family))].sort((a, b) =>
      a.localeCompare(b),
    );
  } catch {
    return null;
  }
}
