import { ATLASES, atlasKey } from "./atlases";

/**
 * Layout helpers.
 *
 * A monospaced bitmap face makes this arithmetic rather than measurement: a
 * string is exactly `length x cellW` wide, so truncation and fitting are
 * decided without touching the DOM. This is the one place where dropping out
 * of the text engine makes life easier rather than harder — CSS ellipsis needs
 * a layout pass, and this does not.
 */

/** Glyph cell width in CSS pixels: 6 at 12px, 8 at 16px, 12 at 24px. */
export function cellWidth(size, weight = 400) {
  return ATLASES[atlasKey(size, weight)].meta.cellW;
}

/** Line box height: 12, 16 or 24. */
export function cellHeight(size, weight = 400) {
  return ATLASES[atlasKey(size, weight)].meta.cellH;
}

/** Rendered width of a string, in CSS pixels. */
export function measure(text, size, weight = 400, scale = 1) {
  return text.length * cellWidth(size, weight) * scale;
}

/** How many characters fit in a pixel width. */
export function charsThatFit(px, size, weight = 400, scale = 1) {
  return Math.max(0, Math.floor(px / (cellWidth(size, weight) * scale)));
}

/** Truncate to `maxCh` characters, spending the last one on an ellipsis. */
export function fit(text, maxCh) {
  if (!maxCh || text.length <= maxCh) return text;
  if (maxCh <= 1) return "…";
  return text.slice(0, maxCh - 1) + "…";
}

/** Truncate to a pixel width. */
export function fitToWidth(text, px, size, weight = 400, scale = 1) {
  return fit(text, charsThatFit(px, size, weight, scale));
}
