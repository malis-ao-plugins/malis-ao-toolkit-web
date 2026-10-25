import {
  PixelFont,
  registerFont,
  getFont,
  rasterizeFont,
  installMetricsFont,
  metricsFontFamily,
} from "../pixelfont/index.js";

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

export const DEFAULT_FAMILY = "verdana";

/** Families, in the order they are offered. Grows when one is rasterised. */
export const families = () =>
  [...new Set(FACES.map((f) => f.family))].sort((a, b) => a.localeCompare(b));

/* ── Faces made here ───────────────────────────────────────────────────────

   The exported atlases come out of GDI, which is what the game uses and
   what makes them right. These come out of the browser: it draws each glyph
   and the greys are thrown away. With Windows font smoothing off that costs
   almost nothing; with it on the shapes were never grid-fitted and it
   shows. Good enough to try a face, not the way to settle on one.

   They are kept rather than rebuilt on every load, because rasterising four
   steps of latin1 is a second of work nobody should pay for at startup. */

const CUSTOM_KEY = "uiCustomFaces";

/** Two sizes and two weights, matching the coverage Verdana ships with. */
const STEPS = [
  { size: 13, bold: false },
  { size: 16, bold: false },
  { size: 13, bold: true },
  { size: 20, bold: true },
];

/** Enough to try a few without filling local storage with bitmaps. */
const MAX_CUSTOM = 3;

const nameFor = (atlas) =>
  [
    String(atlas.face).toLowerCase().replace(/\s+/g, "-"),
    atlas.size,
    atlas.bold ? "bold" : null,
    "canvas",
  ]
    .filter(Boolean)
    .join("-");

function register(atlas) {
  const name = nameFor(atlas);
  registerFont(name, PixelFont.fromJSON(atlas));
  if (!FACES.some((f) => f.name === name)) {
    FACES.push({
      name,
      family: atlas.face,
      size: atlas.size,
      bold: !!atlas.bold,
    });
  }
}

function loadCustom() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveCustom(entries) {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(entries));
  } catch {
    // Out of room, or private mode. The face still works this session.
  }
}

let custom = loadCustom();
for (const entry of custom) entry.atlases.forEach(register);

/** The families made here rather than exported, newest last. */
export const customFamilies = () => custom.map((entry) => entry.family);

/**
 * Rasterise a face the system has, at the steps the kit asks for.
 *
 * Synchronous and not fast — four atlases of latin1, each glyph drawn and
 * read back — so a caller should say it is working before calling.
 */
export function addRasterizedFamily(face) {
  const name = String(face ?? "").trim();
  if (!name) return null;

  const atlases = STEPS.map((step) =>
    rasterizeFont({ face: name, size: step.size, bold: step.bold }),
  );

  // A face the system does not have still rasterises: the browser quietly
  // substitutes one, and every glyph comes back as the fallback. Nothing in
  // the result says so, so there is nothing to check here — the preview is
  // what tells you.
  atlases.forEach(register);

  custom = [
    ...custom.filter((entry) => entry.family !== atlases[0].face),
    { family: atlases[0].face, atlases },
  ].slice(-MAX_CUSTOM);

  saveCustom(custom);
  notify();
  return atlases[0].face;
}

export function removeRasterizedFamily(family) {
  custom = custom.filter((entry) => entry.family !== family);
  saveCustom(custom);

  for (let i = FACES.length - 1; i >= 0; i--) {
    if (FACES[i].family === family && FACES[i].name.endsWith("-canvas")) {
      FACES.splice(i, 1);
    }
  }

  if (currentFamily() === family) family_ = DEFAULT_FAMILY;
  notify();
}

/* ── The chosen family ────────────────────────────────────────
   Module state rather than a context: the face is a property of the whole
   app, every component wants it, and a provider would only be one more
   thing every app had to remember to mount. */

let family_ = DEFAULT_FAMILY;
const listeners = new Set();

const notify = () => {
  for (const listener of listeners) listener();
};

export const currentFamily = () => family_;

export function setFamily(next) {
  if (!next || next === family_ || !families().includes(next)) return;
  family_ = next;
  notify();
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

  const inFamily = FACES.filter((f) => f.family === family_);
  const pool = inFamily.length ? inFamily : FACES;

  const weighted = pool.filter((f) => f.bold === wantBold);
  const candidates = weighted.length ? weighted : pool;

  const best = candidates.reduce((a, b) =>
    Math.abs(b.size - size) < Math.abs(a.size - size) ? b : a,
  );

  return getFont(best.name);
}

/** Registry key for the face selected by `fontFor`. */
export function fontKeyFor(size = 13, weight = 400) {
  const font = fontFor(size, weight);
  return FACES.find(
    (face) =>
      face.family === font.name &&
      face.size === font.size &&
      face.bold === !!font.atlas.bold,
  )?.name;
}

/* ── Lining the real text up with the drawn text ───────────────────────────

   Every drawn string has an invisible real one behind it, so that selecting
   drags over text and the clipboard gets text. For the selection to cover
   what it looks like it covers, that real text has to advance at the same
   rate as the atlas.

   It was laid out at `font-size: <the atlas's size>px`, which is wrong by a
   whole unit: an atlas size is a cell height, the number CreateFontA takes,
   while CSS font-size is an em size. Verdana's cell at 13px CSS is around 16,
   so the real glyphs ran wider than the drawn ones and the gap grew with
   every character — by the end of a long value the caret sat a dozen pixels
   past the text.

   The two are the same typeface, so their advances are proportional and the
   ratio is all that is needed. It is measured once per face against a long
   sample, which averages out the per-glyph rounding in the atlas. */

/**
 * The face to lay the hidden text out in, once the browser has taken it.
 *
 * A font built from the atlas, carrying its advances and no outlines at all
 * — see pixelfont/metrics-font.js. At `font-size: <the atlas size>px` every
 * advance resolves to the whole pixel the atlas drew, so the caret and the
 * selection cannot drift however long the string runs.
 *
 * Answers null until it is registered, and null for good if the browser's
 * sanitiser refuses it; either way the caller falls back to cssSizeFor
 * below, which was the whole of the answer before this and is still most of
 * it. Registering is one small async step per face, and the family
 * listeners are what tells the drawn text to lay itself out again.
 */
const metrics = new Map();

export function metricsFamily(size = 13, weight = 400) {
  const font = fontFor(size, weight);
  const family = metricsFontFamily(font);

  const state = metrics.get(family);
  if (state !== undefined) return state ? family : null;

  metrics.set(family, false);
  installMetricsFont(font).then((installed) => {
    if (!installed) return;
    metrics.set(family, true);
    notify();
  });

  return null;
}

/** Install the atlas-matched CSS face in another renderer process. */
export function installMetricsFontByName(name) {
  const font = getFont(name);
  return font ? installMetricsFont(font) : Promise.resolve(null);
}

const SAMPLE =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,-";

const cssSizes = new Map();

/**
 * The CSS font-size at which the installed face advances like the atlas.
 *
 * Falls back to the atlas size where there is no canvas to measure with —
 * under the test runner, and anywhere a context is refused.
 */
export function cssSizeFor(size = 13, weight = 400) {
  const font = fontFor(size, weight);
  const key = `${font.name}|${font.size}|${font.atlas.bold ? "b" : "r"}`;

  const hit = cssSizes.get(key);
  if (hit !== undefined) return hit;

  let px = font.size;

  try {
    const ctx = document.createElement("canvas").getContext("2d");
    // Probed large and scaled down: at a plausible size the browser's own
    // rounding is a meaningful share of the answer.
    const probe = 400;
    ctx.font = `${font.atlas.bold ? 700 : 400} ${probe}px "${font.name}", sans-serif`;

    const real = ctx.measureText(SAMPLE).width;
    const drawn = font.measure(SAMPLE);
    if (real > 0 && drawn > 0) px = Math.round((drawn / real) * probe * 100) / 100;
  } catch {
    // No canvas. The atlas size is the best guess left.
  }

  cssSizes.set(key, px);
  return px;
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
