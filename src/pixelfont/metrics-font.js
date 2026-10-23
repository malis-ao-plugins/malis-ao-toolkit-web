/**
 * metrics-font - a web font that advances exactly like an atlas.
 *
 * Nothing here draws anything. Every glyph in the font this builds is empty;
 * all it carries is advance widths.
 *
 * That sounds pointless and is not. A page that paints pixelfont text keeps
 * the real string in the DOM underneath, transparent, so that selecting
 * drags over text and the clipboard gets text — and in a text field, so that
 * the browser still owns the caret, the keyboard and the IME. The browser
 * lays that hidden string out in whatever font it was told to use, and if
 * those advances are not the atlas' advances, the caret and the selection
 * drift off the painted glyphs.
 *
 * Scaling an installed face to match gets close and no closer. The atlas'
 * advances are whole pixels, rounded once at export; a vector face's are
 * not. Pick the size where a paragraph comes out the same width and a run of
 * one repeated letter still walks away from the text, because for that one
 * letter the rounding never averages out. There is no size that fixes it.
 *
 * So the browser is handed a font whose advances *are* the atlas' advances,
 * to the unit. Units per em is the atlas' cell height times 64 and each
 * advance is its pixel advance times 64, so at `font-size: <cell height>px`
 * every advance resolves to a whole pixel and the hidden text tracks the
 * painted text forever, at any length, for any face.
 *
 * A font with no outlines is also tiny — a couple of kilobytes for latin1 —
 * and needs no network.
 *
 *   const family = await installMetricsFont(font);
 *   el.style.fontFamily = `"${family}", monospace`;
 *   el.style.fontSize = `${font.size}px`;
 *
 * `installMetricsFont` answers null rather than throwing if the browser
 * refuses the font, so a caller can keep whatever it was doing before.
 */

/** Advance units per pixel. Also the em, times the cell height. */
const SCALE = 64;

class Writer {
  constructor() {
    this.out = [];
  }
  u8(v) {
    this.out.push(v & 0xff);
    return this;
  }
  u16(v) {
    return this.u8(v >> 8).u8(v);
  }
  i16(v) {
    return this.u16(v < 0 ? v + 0x10000 : v);
  }
  u32(v) {
    return this.u8(v >>> 24).u8(v >>> 16).u8(v >>> 8).u8(v);
  }
  tag(s) {
    for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i));
    return this;
  }
  utf16(s) {
    for (let i = 0; i < s.length; i++) this.u16(s.charCodeAt(i));
    return this;
  }
  zeros(n) {
    for (let i = 0; i < n; i++) this.u8(0);
    return this;
  }
  done() {
    return Uint8Array.from(this.out);
  }
}

const head = (upem) =>
  new Writer()
    .u32(0x00010000) // version
    .u32(0x00010000) // fontRevision
    .u32(0) // checkSumAdjustment - not verified by any browser
    .u32(0x5f0f3cf5) // magic
    .u16(0x0003) // baseline at y=0, left sidebearing at x=0
    .u16(upem)
    .u32(0)
    .u32(0) // created
    .u32(0)
    .u32(0) // modified
    .i16(0)
    .i16(0)
    .i16(0)
    .i16(0) // bounding box: every glyph is empty
    .u16(0) // macStyle
    .u16(8) // lowestRecPPEM
    .i16(2) // fontDirectionHint
    .i16(0) // indexToLocFormat: short offsets
    .i16(0) // glyphDataFormat
    .done();

const hhea = (ascent, descent, maxAdvance, count) =>
  new Writer()
    .u32(0x00010000)
    .i16(ascent)
    .i16(-descent)
    .i16(0) // lineGap
    .u16(maxAdvance)
    .i16(0)
    .i16(0)
    .i16(0) // min sidebearings, xMaxExtent
    .i16(1)
    .i16(0)
    .i16(0) // caret slope and offset: upright
    .i16(0)
    .i16(0)
    .i16(0)
    .i16(0) // reserved
    .i16(0) // metricDataFormat
    .u16(count) // one full metric per glyph
    .done();

const maxp = (count) => {
  const w = new Writer().u32(0x00010000).u16(count);
  // No points, no contours, no instructions: the outlines are all empty.
  w.u16(0).u16(0).u16(0).u16(0).u16(2).u16(0);
  w.u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);
  return w.done();
};

const hmtx = (advances) => {
  const w = new Writer();
  for (const advance of advances) w.u16(advance).i16(0);
  return w.done();
};

/**
 * Short format: offsets are halved, and every glyph after .notdef is empty.
 *
 * An empty glyph is one whose offset equals the next one's, so all of these
 * point at the end of .notdef and take up no bytes.
 */
const loca = (count) => {
  const w = new Writer().u16(0);
  for (let i = 0; i < count; i++) w.u16(NOTDEF.length / 2);
  return w.done();
};

/**
 * The one glyph with a description: zero contours and an empty box.
 *
 * A blank glyph, but present. glyf could be left empty outright, since
 * nothing has any outline - it only exists because a table of no length is
 * the kind of thing a sanitiser is entitled to throw away.
 */
const NOTDEF = new Writer().i16(0).i16(0).i16(0).i16(0).i16(0).done();

/**
 * Character to glyph, format 4.
 *
 * Glyph ids run in codepoint order from 1, so a run of consecutive
 * codepoints is a segment with one constant delta.
 */
const cmap = (codes) => {
  const segments = [];
  for (let i = 0; i < codes.length; i++) {
    const start = i;
    while (i + 1 < codes.length && codes[i + 1] === codes[i] + 1) i++;
    segments.push({ start: codes[start], end: codes[i], gid: start + 1 });
  }
  // The terminating segment every format 4 subtable must end with. Its delta
  // has to come out as 1, so that 0xffff maps to glyph 0 - a delta of 0 maps
  // it to glyph 0xffff, which is past the end of the font, and a sanitiser
  // throws the whole file out for it.
  segments.push({ start: 0xffff, end: 0xffff, gid: 0x10000 });

  const n = segments.length;
  const searchRange = 2 * 2 ** Math.floor(Math.log2(n));
  const sub = new Writer()
    .u16(4)
    .u16(16 + n * 8) // length
    .u16(0) // language
    .u16(n * 2)
    .u16(searchRange)
    .u16(Math.log2(searchRange / 2))
    .u16(n * 2 - searchRange);

  for (const s of segments) sub.u16(s.end);
  sub.u16(0); // reservedPad
  for (const s of segments) sub.u16(s.start);
  for (const s of segments) sub.u16((s.gid - s.start) & 0xffff); // idDelta
  for (let i = 0; i < n; i++) sub.u16(0); // idRangeOffset

  const table = sub.done();
  const w = new Writer()
    .u16(0) // version
    .u16(1) // one subtable
    .u16(3)
    .u16(1) // Windows, BMP
    .u32(12);
  for (const b of table) w.u8(b);
  return w.done();
};

const NAME_IDS = [1, 2, 3, 4, 5, 6];

const name = (family, style) => {
  const strings = {
    1: family,
    2: style,
    3: `${family} ${style}`,
    4: `${family} ${style}`,
    5: "Version 1.0",
    6: `${family}-${style}`.replace(/[^\x21-\x7e]|[[\](){}<>/%]/g, ""),
  };

  const w = new Writer().u16(0).u16(NAME_IDS.length).u16(6 + NAME_IDS.length * 12);

  let offset = 0;
  for (const id of NAME_IDS) {
    const bytes = strings[id].length * 2;
    w.u16(3).u16(1).u16(0x0409).u16(id).u16(bytes).u16(offset);
    offset += bytes;
  }
  for (const id of NAME_IDS) w.utf16(strings[id]);
  return w.done();
};

const post = () =>
  new Writer()
    .u32(0x00030000) // version 3.0: no glyph names
    .u32(0) // italicAngle
    .i16(0)
    .i16(0) // underline position and thickness
    .u32(0) // isFixedPitch
    .u32(0)
    .u32(0)
    .u32(0)
    .u32(0) // memory usage hints
    .done();

const os2 = ({ bold, ascent, descent, advances, first, last }) => {
  const average = Math.round(
    advances.reduce((a, b) => a + b, 0) / Math.max(1, advances.length),
  );

  const w = new Writer()
    .u16(4) // version
    .i16(average)
    .u16(bold ? 700 : 400)
    .u16(5) // medium width
    .u16(0) // installable
    .i16(0).i16(0).i16(0).i16(0) // subscript box
    .i16(0).i16(0).i16(0).i16(0) // superscript box
    .i16(0).i16(0) // strikeout
    .i16(0); // sFamilyClass
  w.zeros(10); // panose
  w.u32(3).u32(0).u32(0).u32(0); // Basic Latin and Latin-1 Supplement
  w.tag("PXMF");
  w.u16(bold ? 0x20 : 0x40); // fsSelection: BOLD or REGULAR
  w.u16(first).u16(Math.min(last, 0xffff));
  w.i16(ascent).i16(-descent).i16(0); // typographic metrics
  w.u16(ascent).u16(descent); // Windows metrics
  w.u32(1).u32(0); // code page: Latin 1
  w.i16(0).i16(0); // x-height, cap height: no outlines to measure
  w.u16(0).u16(32).u16(0); // default char, break char, max context
  return w.done();
};

const pad4 = (n) => (4 - (n % 4)) % 4;

const checksum = (bytes) => {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    sum =
      (sum +
        ((bytes[i] << 24) >>> 0) +
        ((bytes[i + 1] ?? 0) << 16) +
        ((bytes[i + 2] ?? 0) << 8) +
        (bytes[i + 3] ?? 0)) >>>
      0;
  }
  return sum;
};

/** Tables in the order a directory must list them: by tag, ASCII. */
function assemble(tables) {
  const n = tables.length;
  const searchRange = 16 * 2 ** Math.floor(Math.log2(n));

  const directory = new Writer()
    .u32(0x00010000)
    .u16(n)
    .u16(searchRange)
    .u16(Math.log2(searchRange / 16))
    .u16(n * 16 - searchRange);

  let offset = 12 + n * 16;
  for (const [tag, bytes] of tables) {
    directory.tag(tag).u32(checksum(bytes)).u32(offset).u32(bytes.length);
    offset += bytes.length + pad4(bytes.length);
  }

  const out = new Uint8Array(offset);
  out.set(directory.done(), 0);

  let at = 12 + n * 16;
  for (const [, bytes] of tables) {
    out.set(bytes, at);
    at += bytes.length + pad4(bytes.length);
  }
  return out;
}

/** A family name that is unique to one atlas and legal in CSS. */
export function metricsFontFamily(font) {
  const slug = String(font.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `pxm-${slug}-${font.size}${font.atlas.bold ? "b" : "r"}`;
}

/**
 * Build the font. Returns the raw TrueType bytes.
 *
 * Exported so it can be written to a file and inspected; the usual entry
 * point is `installMetricsFont`.
 */
export function metricsFontData(font) {
  const codes = [...font.glyphs.keys()].sort((a, b) => a - b);
  const upem = font.size * SCALE;

  // Glyph 0 is .notdef and carries the advance an unmapped character gets.
  const advances = [
    0,
    ...codes.map((cp) => (font.glyph(cp)?.adv ?? 0) * SCALE),
  ];
  const count = advances.length;

  return assemble([
    [
      "OS/2",
      os2({
        bold: !!font.atlas.bold,
        ascent: font.ascent * SCALE,
        descent: (font.height - font.ascent) * SCALE,
        advances,
        first: codes[0] ?? 32,
        last: codes[codes.length - 1] ?? 32,
      }),
    ],
    ["cmap", cmap(codes)],
    ["glyf", NOTDEF],
    ["head", head(upem)],
    [
      "hhea",
      hhea(
        font.ascent * SCALE,
        (font.height - font.ascent) * SCALE,
        Math.max(...advances),
        count,
      ),
    ],
    ["hmtx", hmtx(advances)],
    ["loca", loca(count)],
    ["maxp", maxp(count)],
    [
      "name",
      name(metricsFontFamily(font), font.atlas.bold ? "Bold" : "Regular"),
    ],
    ["post", post()],
  ]);
}

const installs = new Map();

/**
 * Register the font with the document, once per atlas.
 *
 * Resolves to the family name to ask for, or to null if the browser would
 * not take it — a caller that falls back to an installed face then keeps
 * whatever accuracy it had.
 */
export function installMetricsFont(font) {
  const family = metricsFontFamily(font);
  if (installs.has(family)) return installs.get(family);

  const done = (async () => {
    if (typeof document === "undefined" || !document.fonts) return null;
    if (typeof FontFace === "undefined") return null;
    try {
      const face = new FontFace(family, metricsFontData(font).buffer);
      await face.load();
      document.fonts.add(face);
      return family;
    } catch {
      // The sanitiser refused it. Nothing to do but say so.
      return null;
    }
  })();

  installs.set(family, done);
  return done;
}
