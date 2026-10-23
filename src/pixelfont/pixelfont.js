/**
 * pixelfont - 1-bit bitmap text for the web, with no antialiasing anywhere.
 *
 * Browsers will not render bilevel text for you: every @font-face goes through
 * OpenType Sanitizer, which strips embedded bitmap strikes (EBDT/EBLC). So the
 * only way to get guaranteed hard-edged pixels is to draw them yourself, which
 * is what this does.
 *
 * Atlases are produced by export_font.py. Zero dependencies, ES module.
 */

/** Ink is a CLEAR bit: GDI draws black-on-white into a 1bpp target. */
function decodeGlyph(g) {
  const mask = new Uint8Array(g.w * g.h);
  for (let y = 0; y < g.h; y++) {
    const row = g.rows[y];
    for (let x = 0; x < g.w; x++) {
      const byte = parseInt(row.substr((x >> 3) * 2, 2), 16);
      if (!(byte & (1 << (7 - (x & 7))))) mask[y * g.w + x] = 1;
    }
  }
  return mask;
}

function parseInk(ink) {
  if (Array.isArray(ink)) return ink;
  const h = ink.replace("#", "");
  const n = h.length === 3
    ? h.split("").map(c => c + c).join("")
    : h.slice(0, 6);
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

/**
 * Snap to a whole number of DEVICE pixels.
 *
 * At a fractional devicePixelRatio (Windows display scaling at 125% or 150%,
 * or browser zoom off 100%) one CSS pixel is not one device pixel, and drawing
 * at fractional device coordinates makes the canvas antialias the edges - the
 * exact artifact this library exists to avoid.
 */
export function deviceScale(scale = 1) {
  const dpr = window.devicePixelRatio || 1;
  return { s: Math.max(1, Math.round(scale * dpr)), dpr };
}

/**
 * Browser zoom changes devicePixelRatio, which changes every canvas's correct
 * size. Without this, canvases keep the dimensions they were given at the old
 * ratio and only snap to the right ones the next time something happens to
 * re-render them - which looks like the element resizing when you click it.
 */
const dprListeners = new Set();
let dprMedia = null;
let dprPending = false;

function onDprChange() {
  watchDpr();
  if (dprPending) return;
  dprPending = true;
  requestAnimationFrame(() => {
    dprPending = false;
    for (const cb of dprListeners) {
      try { cb(); } catch (e) { console.error("pixelfont: dpr listener failed", e); }
    }
  });
}

function watchDpr() {
  if (dprMedia) dprMedia.removeEventListener("change", onDprChange);
  dprMedia = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  dprMedia.addEventListener("change", onDprChange, { once: true });
}

export function onDeviceScaleChange(cb) {
  if (!dprListeners.size) {
    watchDpr();
    // Zoom also fires resize, and catches ratios matchMedia rounds past.
    window.addEventListener("resize", onDprChange);
  }
  dprListeners.add(cb);
  return () => {
    dprListeners.delete(cb);
    if (!dprListeners.size) {
      window.removeEventListener("resize", onDprChange);
      if (dprMedia) { dprMedia.removeEventListener("change", onDprChange); dprMedia = null; }
    }
  };
}

export class PixelFont {
  constructor(atlas) {
    if (!atlas || atlas.format !== "pixelfont-1") {
      throw new Error("pixelfont: not a pixelfont-1 atlas");
    }
    this.atlas = atlas;
    this.glyphs = new Map();
    for (const cp in atlas.glyphs) {
      const g = atlas.glyphs[cp];
      this.glyphs.set(Number(cp), { w: g.w, h: g.h, adv: g.adv, mask: decodeGlyph(g) });
    }
  }

  static async load(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`pixelfont: cannot load ${url} (${res.status})`);
    return new PixelFont(await res.json());
  }

  static fromJSON(obj) { return new PixelFont(obj); }

  get name()    { return this.atlas.face; }
  get size()    { return this.atlas.size; }
  get height()  { return this.atlas.tmHeight; }
  get ascent()  { return this.atlas.ascent; }

  glyph(cp) {
    return this.glyphs.get(cp === 9 ? 32 : cp);   // GetGlyph folds tab to space
  }

  /** Width in pixels: the sum of advances, nothing else. */
  measure(text) {
    let pen = 0;
    for (let i = 0; i < text.length; i++) {
      const g = this.glyph(text.charCodeAt(i));
      if (g) pen += g.adv;
    }
    return pen;
  }

  /**
   * Compose a string into a flat 1-bit mask.
   *
   * Glyph bitmaps are twice the advance wide, so consecutive glyphs overlap on
   * purpose - that headroom carries overhang. Writes are ink-only, never a
   * rectangle copy, or each glyph would erase its neighbour's tail.
   *
   * `pens` holds the pen x at every string index, which is what caret and
   * hit-testing need.
   */
  compose(text, { pad = 8 } = {}) {
    const items = [];
    const missing = new Set();
    const pens = [0];
    let pen = 0;

    for (let i = 0; i < text.length; i++) {
      const g = this.glyph(text.charCodeAt(i));
      if (g) { items.push([pen, g]); pen += g.adv; }
      else { missing.add(text[i]); }
      pens.push(pen);
    }

    const h = this.height;
    const w = Math.max(1, pen + pad);
    const mask = new Uint8Array(w * h);
    for (const [x0, g] of items) {
      const rows = Math.min(g.h, h);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < g.w; x++) {
          const xx = x0 + x;
          if (xx >= w) break;
          if (g.mask[y * g.w + x]) mask[y * w + xx] = 1;
        }
      }
    }
    return { w, h, pen, mask, pens, missing: [...missing] };
  }

  /**
   * A composed mask as an ImageData. Every pixel is fully opaque or fully
   * absent - never a blend.
   *
   * `selection` is { a, b, bg, ink } over string indices. Selected columns swap
   * to a second pair of colours rather than having a translucent bar laid over
   * them: alpha-compositing a highlight would turn the selected run into
   * intermediate values, which is precisely what this library exists to avoid.
   */
  toImageData(comp, ink = "#ffffff", selection = null) {
    const base = parseInk(ink);
    let sx0 = -1, sx1 = -1, selBg = null, selInk = null;
    if (selection && selection.b > selection.a) {
      sx0 = comp.pens[selection.a] ?? 0;
      sx1 = comp.pens[selection.b] ?? 0;
      selBg = parseInk(selection.bg || "#2f5d8f");
      selInk = parseInk(selection.ink || "#ffffff");
    }

    const img = new ImageData(comp.w, comp.h);
    for (let y = 0; y < comp.h; y++) {
      for (let x = 0; x < comp.w; x++) {
        const i = y * comp.w + x;
        const on = comp.mask[i];
        const inSel = sx1 > sx0 && x >= sx0 && x < sx1;
        const c = inSel ? (on ? selInk : selBg) : (on ? base : null);
        if (c) {
          img.data[i * 4] = c[0];
          img.data[i * 4 + 1] = c[1];
          img.data[i * 4 + 2] = c[2];
          img.data[i * 4 + 3] = 255;
        }
      }
    }
    return img;
  }

  /**
   * Render text into a canvas sized exactly for it, snapped to device pixels.
   * Returns { canvas, comp, s, dpr } - `comp.pens` is there for caret maths.
   */
  render(text, { ink = "#ffffff", scale = 1, canvas, pad = 8, overlay, selection } = {}) {
    const comp = typeof text === "string" ? this.compose(text, { pad }) : text;
    const { s, dpr } = deviceScale(scale);

    const src = document.createElement("canvas");
    src.width = comp.w;
    src.height = comp.h;
    src.getContext("2d").putImageData(this.toImageData(comp, ink, selection), 0, 0);

    const out = canvas || document.createElement("canvas");
    out.width = comp.w * s;
    out.height = comp.h * s;
    out.style.width = (comp.w * s / dpr) + "px";
    out.style.height = (comp.h * s / dpr) + "px";
    out.style.imageRendering = "pixelated";

    const ctx = out.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 0, comp.w, comp.h, 0, 0, comp.w * s, comp.h * s);

    if (overlay) overlay(ctx, s, comp);
    return { canvas: out, comp, s, dpr };
  }

  /**
   * Draw into an existing 2D context at (x, y) in CSS pixels.
   * `scale` must be a whole number here - the caller owns the transform, so
   * this cannot snap for you.
   */
  draw(ctx, text, x, y, { ink = "#ffffff", scale = 1 } = {}) {
    const comp = typeof text === "string" ? this.compose(text, { pad: 0 }) : text;
    const src = document.createElement("canvas");
    src.width = comp.w;
    src.height = comp.h;
    src.getContext("2d").putImageData(this.toImageData(comp, ink), 0, 0);

    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, comp.w, comp.h,
                  Math.round(x), Math.round(y), comp.w * scale, comp.h * scale);
    ctx.imageSmoothingEnabled = prev;
    return comp;
  }
}

/* ---- a tiny registry, so elements can refer to fonts by name ---- */

const registry = new Map();

export function registerFont(name, font) {
  registry.set(name, font);
  window.dispatchEvent(new CustomEvent("pixelfont:registered", { detail: { name } }));
  return font;
}

export async function loadFont(name, url) {
  return registerFont(name, await PixelFont.load(url));
}

export function getFont(name) {
  return registry.get(name);
}
