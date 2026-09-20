import { PixelFont, registerFont, getFont } from "../pixelfont/index.js";

import verdana13 from "../pixelfont/fonts/verdana-13.json";
import verdanaBold13 from "../pixelfont/fonts/verdana-bold-13.json";
import verdana16 from "../pixelfont/fonts/verdana-16.json";
import verdanaBold20 from "../pixelfont/fonts/verdana-bold-20.json";

/**
 * The faces the kit draws with.
 *
 * These come from `src/pixelfont`, which is a junction to the shared
 * aowebui folder — the atlases are rasterised out of Windows' own font
 * machinery, which is what makes them match the game exactly. Nothing in
 * that folder may be edited from here; a new atlas has to be asked for.
 *
 * The atlases are imported rather than fetched, so the bundler carries them
 * and there is no load order to get wrong: a face is ready before the first
 * render, and no component has to cope with text arriving later.
 *
 * ── The scale is no longer monospaced ─────────────────────────────────────
 *
 * The kit's old faces were generated monospaced, which is why so much of it
 * measured in characters — `width: 4ch`, `maxCh`, "50 characters at 320px".
 * Verdana is proportional, so a string's width is the sum of its advances
 * and nothing else. Anything that needs a fixed box measures the string; see
 * `measure` below.
 *
 * ── Sizes ────────────────────────────────────────────────────────────────
 *
 * The kit asks for 12, 16 and 24; the atlases that exist are 13, 16 and 20.
 * A size is a cell height in pixels, and an atlas is exact only at its own
 * height, so each request resolves to the nearest one rather than scaling
 * something to fit. Exact coverage would want verdana-bold-16 and a
 * verdana-24 pair, which have to be exported on the machine that owns the
 * shared folder.
 */

const FACES = [
  { name: "ui-13", atlas: verdana13, size: 13, bold: false },
  { name: "ui-13-bold", atlas: verdanaBold13, size: 13, bold: true },
  { name: "ui-16", atlas: verdana16, size: 16, bold: false },
  { name: "ui-20-bold", atlas: verdanaBold20, size: 20, bold: true },
];

for (const face of FACES) {
  registerFont(face.name, PixelFont.fromJSON(face.atlas));
}

/** Anything at or above this is drawn bold. */
const BOLD_AT = 600;

/**
 * The registered face closest to a requested size and weight.
 *
 * Weight is matched first and size second: a bold request that has to shift
 * a step in size still reads as bold, where the reverse would quietly drop
 * the emphasis.
 */
export function fontFor(size = 13, weight = 400) {
  const wantBold = weight >= BOLD_AT;
  const pool = FACES.filter((f) => f.bold === wantBold);
  const candidates = pool.length ? pool : FACES;

  const best = candidates.reduce((a, b) =>
    Math.abs(b.size - size) < Math.abs(a.size - size) ? b : a,
  );

  return getFont(best.name);
}

/** Width in CSS pixels of a string, as the kit would draw it. */
export function measure(text, size, weight) {
  return fontFor(size, weight).measure(String(text ?? ""));
}

/** Cell height in CSS pixels at a given step. */
export function lineHeight(size, weight) {
  return fontFor(size, weight).height;
}

/**
 * Truncate to a pixel width, spending the tail on an ellipsis.
 *
 * The old kit could count characters, because every glyph was the same
 * width. This has to measure as it goes.
 */
export function fitToWidth(text, px, size, weight) {
  const font = fontFor(size, weight);
  const source = String(text ?? "");
  if (px == null || font.measure(source) <= px) return source;

  const ellipsis = "...";
  const budget = px - font.measure(ellipsis);
  if (budget <= 0) return ellipsis;

  let width = 0;
  let cut = 0;
  for (const ch of source) {
    const w = font.measure(ch);
    if (width + w > budget) break;
    width += w;
    cut += ch.length;
  }

  return source.slice(0, cut) + ellipsis;
}
