/**
 * Atlas registry.
 *
 * Static imports so the bundler fingerprints and inlines them — the sheets are
 * 1.4-2.7KB each, well under the usual inline threshold, so in practice they
 * cost no extra requests.
 */
import png12r from "./atlas/terminus-12-400.png";
import png12b from "./atlas/terminus-12-700.png";
import png16r from "./atlas/terminus-16-400.png";
import png16b from "./atlas/terminus-16-700.png";
import png24r from "./atlas/terminus-24-400.png";
import png24b from "./atlas/terminus-24-700.png";

import meta12r from "./atlas/terminus-12-400.json";
import meta12b from "./atlas/terminus-12-700.json";
import meta16r from "./atlas/terminus-16-400.json";
import meta16b from "./atlas/terminus-16-700.json";
import meta24r from "./atlas/terminus-24-400.json";
import meta24b from "./atlas/terminus-24-700.json";

export const ATLASES = {
  "12-400": { url: png12r, meta: meta12r },
  "12-700": { url: png12b, meta: meta12b },
  "16-400": { url: png16r, meta: meta16r },
  "16-700": { url: png16b, meta: meta16b },
  "24-400": { url: png24r, meta: meta24r },
  "24-700": { url: png24b, meta: meta24b },
};

export const SIZES = [12, 16, 24];
export const WEIGHTS = [400, 700];

/** Nearest supported size/weight, so callers can pass anything reasonable. */
export function atlasKey(size, weight) {
  const s = SIZES.includes(size)
    ? size
    : SIZES.reduce((a, b) => (Math.abs(b - size) < Math.abs(a - size) ? b : a));
  const w = weight >= 600 ? 700 : 400;
  return `${s}-${w}`;
}
