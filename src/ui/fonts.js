import { PixelFont, registerFont, getFont } from "../pixelfont/index.js";

import lucidaConsole16 from "../pixelfont/fonts/lucida-console-16.json";
import tahoma14 from "../pixelfont/fonts/tahoma-14.json";
import verdana13 from "../pixelfont/fonts/verdana-13.json";
import verdana16 from "../pixelfont/fonts/verdana-16.json";
import verdanaBold13 from "../pixelfont/fonts/verdana-bold-13.json";
import verdanaBold20 from "../pixelfont/fonts/verdana-bold-20.json";

/**
 * The faces the kit draws with.
 *
 * These come from `src/pixelfont`, which is a junction to the shared
 * aowebui folder — the atlases are rasterised out of Windows' own font
 * machinery, which is what makes them match the game exactly. Nothing in
 * that folder may be edited from here; a new atlas has to be asked for.
 *
 * Every atlas is listed below and registered at load. They are bundled
 * rather than fetched, so there is no load order to get wrong: a face is
 * ready before the first render, and no component has to cope with text
 * arriving late.
 *
 * Listed by hand rather than discovered: require.context would find them,
 * but it is a bundler feature and does not exist under the test runner, and
 * a face the tests cannot load is not worth the line it saves. Everything
 * else about a face — its family, size and weight — is read from the atlas
 * itself, so a new one is one import and one entry.
 *
 * ── The scale is not monospaced ─────────────────────────────────
 *
 * The kit's old faces were generated monospaced, which is why so much of it
 * measured in characters — `width: 4ch`, `maxCh`, "50 characters at 320px".
 * These are proportional, so a string's width is the sum of its advances and
 * nothing else. Anything needing a fixed box measures the string; see
 * `measure` and `fitToWidth` below.
 *
 * ── Sizes ────────────────────────────────────────────────
 *
 * An atlas is exact only at the pixel height it was exported at, so a
 * request resolves to the nearest one in the chosen family rather than
 * scaling something to fit. A family with a single size renders everything
 * at that size — it works, but the hierarchy flattens. Verdana is the only
 * family with a range so far; Tahoma and Lucida Console would each want a
 * second and third size exported to read properly.
 */

const ATLASES = {
  "lucida-console-16": lucidaConsole16,
  "tahoma-14": tahoma14,
  "verdana-13": verdana13,
  "verdana-16": verdana16,
  "verdana-bold-13": verdanaBold13,
  "verdana-bold-20": verdanaBold20,
};

const FACES = Object.entries(ATLASES).map(([name, atlas]) => {
  registerFont(name, PixelFont.fromJSON(atlas));
  return { name, family: atlas.face, size: atlas.size, bold: !!atlas.bold };
});

/** Families, in the order they are offered. */
export const FAMILIES = [...new Set(FACES.map((f) => f.family))].sort((a, b) =>
  a.localeCompare(b),
);

export const DEFAULT_FAMILY = FAMILIES.includes("verdana")
  ? "verdana"
  : FAMILIES[0];

/* ── The chosen family ────────────────────────────────────────
   Module state rather than a context: the face is a property of the whole
   app, every component wants it, and a provider would only be one more
   thing every app had to remember to mount. */

let family = DEFAULT_FAMILY;
const listeners = new Set();

export const currentFamily = () => family;

export function setFamily(next) {
  if (!next || next === family || !FAMILIES.includes(next)) return;
  family = next;
  for (const listener of listeners) listener();
}

/** Called when the family changes, so drawn text can be rebuilt. */
export function onFamilyChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Anything at or above this is drawn bold. */
const BOLD_AT = 600;

/**
 * The registered face closest to a requested size and weight.
 *
 * Family first, then weight, then size: a bold request that has to shift a
 * step in size still reads as bold, where the reverse would quietly drop the
 * emphasis.
 */
export function fontFor(size = 13, weight = 400) {
  const wantBold = weight >= BOLD_AT;

  const inFamily = FACES.filter((f) => f.family === family);
  const pool = inFamily.length ? inFamily : FACES;

  const weighted = pool.filter((f) => f.bold === wantBold);
  const candidates = weighted.length ? weighted : pool;

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
 * Break text into lines that each fit a pixel width.
 *
 * PixelText draws one mask per string and cannot wrap — a mask has no line
 * boxes for the browser to break. So anything that runs to more than a line
 * has to be broken up here and drawn a line at a time.
 *
 * A word longer than the width is left to overrun rather than being cut in
 * half; there are none in the game's own text, and a hyphen in the wrong
 * place reads worse than a wide line.
 */
export function wrapToWidth(text, px, size, weight) {
  const font = fontFor(size, weight);
  const words = String(text ?? "").split(/\s+/).filter(Boolean);

  const lines = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.measure(candidate) > px) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line);
  return lines;
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
