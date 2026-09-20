/**
 * String -> mask image.
 *
 * The glyphs are composed onto an offscreen canvas and handed back as a data
 * URL, which the component uses as a CSS mask. Masking rather than drawing a
 * visible canvas is what lets colour stay in CSS: the element paints
 * `currentColor` through the mask, so :hover, theme swaps and inherited colour
 * all keep working without React knowing anything about them.
 *
 * Integer upscaling is baked in here rather than done with `mask-size`, so the
 * mask is always consumed 1:1 and never resampled by the compositor.
 */

const cache = new Map();
const MAX_CACHE = 2000;

export function maskFor(text, atlas, scale = 1) {
  const { meta, index, image } = atlas;
  const key = `${meta.size}|${meta.weight}|${scale}|${text}`;

  const hit = cache.get(key);
  if (hit) return hit;

  const { cellW, cellH, cols } = meta;
  const width = Math.max(1, text.length * cellW * scale);
  const height = cellH * scale;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  for (let i = 0; i < text.length; i++) {
    const cell = index.get(text[i]);
    if (cell === undefined) continue; // space or unsupported: leave transparent

    const sx = (cell % cols) * cellW;
    const sy = Math.floor(cell / cols) * cellH;

    ctx.drawImage(
      image,
      sx,
      sy,
      cellW,
      cellH,
      i * cellW * scale,
      0,
      cellW * scale,
      cellH * scale,
    );
  }

  const result = { url: canvas.toDataURL("image/png"), width, height };

  // Labels repeat heavily, so the cache stays small; the bound is only there
  // to stop a pathological case (e.g. a live counter) growing without limit.
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(key, result);

  return result;
}

const reported = new Set();

/**
 * True when every character has a cell, i.e. the atlas can render this string.
 *
 * A gap sends the string to the DOM fallback, which is exactly the blurry
 * path this package exists to avoid — and it is invisible unless you happen
 * to be looking at that label. An em dash in the item names cost an afternoon
 * for precisely this reason, so misses are announced once each in
 * development. Extend RANGES in tools/build-pixel-atlas.py and rebuild.
 */
export function canRender(text, atlas) {
  let ok = true;

  for (const ch of text) {
    if (ch === " ") continue;
    if (atlas.index.has(ch)) continue;

    ok = false;
    if (process.env.NODE_ENV !== "production") {
      const key = `${atlas.meta.size}:${ch}`;
      if (!reported.has(key)) {
        reported.add(key);
        console.warn(
          `[pixel-text] no glyph for ${JSON.stringify(ch)} ` +
            `(U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}) ` +
            `in the ${atlas.meta.size}px atlas — falling back to DOM text. ` +
            `Add its range in tools/build-pixel-atlas.py.`,
        );
      }
    }
  }

  return ok;
}
