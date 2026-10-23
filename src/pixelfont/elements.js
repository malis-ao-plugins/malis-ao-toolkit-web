/**
 * pixelfont custom elements: <pixel-text> and <pixel-input>.
 *
 * Plain DOM, so they work unchanged in vanilla JS, React, Vue or anything else.
 * Both re-render when their font is registered, so you can put them in the
 * markup before the atlas has loaded.
 */

import { getFont, deviceScale, onDeviceScaleChange } from "./pixelfont.js";

const OBSERVED = ["font", "ink", "scale"];

/**
 * The hidden input is transparent, but a browser's default ::selection paints a
 * FORCED text colour for contrast, which beats `color: transparent` - so the
 * hidden glyphs appear the moment you select them. Inline styles cannot express
 * a pseudo-element, so this goes in a stylesheet, injected once.
 */
let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement("style");
  s.textContent =
    "pixel-input input::selection{background:transparent;color:transparent;" +
    "-webkit-text-fill-color:transparent}";
  (document.head || document.documentElement).appendChild(s);
}

/** Characters absent from an atlas draw nothing. Say so once, not every frame. */
const warned = new WeakSet();
function warnMissing(el, comp) {
  if (!comp?.missing?.length || warned.has(el)) return;
  warned.add(el);
  console.warn(
    `pixelfont: ${el.getAttribute("font")} has no glyph for ${comp.missing.join(" ")} ` +
    `- re-export with a wider --chars set`, el);
}

class PixelBase extends HTMLElement {
  static get observedAttributes() { return OBSERVED; }

  connectedCallback() {
    if (!this._wired) {
      this._wired = true;
      this._onFont = e => { if (e.detail.name === this.getAttribute("font")) this.render(); };
      window.addEventListener("pixelfont:registered", this._onFont);
    }
    this._unwatch ??= onDeviceScaleChange(() => this.render());
    this.render();
  }

  disconnectedCallback() {
    window.removeEventListener("pixelfont:registered", this._onFont);
    this._unwatch?.();
    this._unwatch = null;
  }

  attributeChangedCallback() { if (this.isConnected) this.render(); }

  get font()  { return getFont(this.getAttribute("font")); }
  get ink()   { return this.getAttribute("ink") || "#ffffff"; }
  get scale() { return Math.max(1, parseInt(this.getAttribute("scale") || "1", 10)); }
}

/**
 * <pixel-text font="chat" ink="#ffdd55" scale="2">Hello</pixel-text>
 *
 * Renders its own text content. Change textContent and it redraws.
 */
class PixelText extends PixelBase {
  connectedCallback() {
    if (!this._root) {
      // The canvas lives in a shadow root so the light DOM keeps holding the
      // source text: textContent stays truthful, updates to it are observable,
      // and :host can be overridden by the page's own CSS.
      this._root = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ":host{display:inline-block;line-height:0}";
      this._canvas = document.createElement("canvas");
      this._canvas.style.display = "block";
      this._root.append(style, this._canvas);
    }
    if (!this._obs) {
      this._obs = new MutationObserver(() => this.render());
      this._obs.observe(this, { childList: true, characterData: true, subtree: true });
    }
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._obs) { this._obs.disconnect(); this._obs = null; }
  }

  get text() { return this.textContent || ""; }
  set text(v) { this.textContent = v; }

  render() {
    const font = this.font;
    if (!font || !this._canvas) return;
    const text = this.text;
    const { comp } = font.render(text, {
      ink: this.ink, scale: this.scale, canvas: this._canvas, pad: 0,
    });
    warnMissing(this, comp);
    this.setAttribute("role", "img");
    this.setAttribute("aria-label", text);
  }
}

/**
 * <pixel-input font="chat" ink="#ffdd55" scale="2" value="hi"></pixel-input>
 *
 * A real <input> with transparent glyphs and a transparent caret sits on top of
 * a canvas we draw. The input owns the string, the selection, the keyboard, the
 * clipboard and IME; we own every visible pixel.
 *
 * Because the hidden input lays out in a completely different font, anything
 * positional has to be taken over: the caret, click-to-place, drag-select and
 * double-click word select all work off our own advances.
 */
class PixelInput extends PixelBase {
  static get observedAttributes() {
    return [...OBSERVED, "value", "selection-bg", "selection-ink"];
  }

  get selectionBg()  { return this.getAttribute("selection-bg") || "#2f5d8f"; }
  get selectionInk() { return this.getAttribute("selection-ink") || "#ffffff"; }

  /** Keep the value attribute and the real input in step, in both directions. */
  attributeChangedCallback(name, oldV, newV) {
    if (name === "value" && this._input && this._input.value !== (newV ?? "")) {
      this._input.value = newV ?? "";
    }
    if (this.isConnected) this.render();
  }

  connectedCallback() {
    if (!this._built) this._build();
    super.connectedCallback();
  }

  _build() {
    this._built = true;
    ensureStyles();
    this.style.display = "block";
    this.style.position = "relative";
    this.style.overflowX = "auto";

    this._inner = document.createElement("div");
    // max-content grows with the canvas, min-width fills the host when text is
    // short. Sizing it from JS in px made a fractional CSS width at fractional
    // dpr, which flickered the scrollbar in and out.
    this._inner.style.cssText = "position:relative;width:max-content;min-width:100%";

    this._canvas = document.createElement("canvas");
    this._canvas.style.display = "block";

    this._input = document.createElement("input");
    this._input.type = "text";
    this._input.spellcheck = false;
    this._input.autocomplete = "off";
    this._input.value = this.getAttribute("value") || "";
    // inset:0 alone stretches it to the positioned parent - no percentage sizes,
    // so nothing depends on _inner having a definite width or height.
    this._input.style.cssText =
      "position:absolute;inset:0;margin:0;padding:0;border:0;" +
      "outline:none;background:transparent;color:transparent;caret-color:transparent;" +
      "-webkit-text-fill-color:transparent;font:16px/1 monospace";

    this._inner.append(this._canvas, this._input);
    this.appendChild(this._inner);

    this._caretOn = true;
    this._anchor = null;
    this._dragging = false;
    this._comp = null;
    this._reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const bump = () => { this._caretOn = true; this.render(); };

    this._input.addEventListener("input", () => {
      this.setAttribute("value", this._input.value);
      this.dispatchEvent(new Event("input", { bubbles: true }));
      bump();
      this._revealCaret();                 // typing should follow the caret
    });
    this._input.addEventListener("change", () =>
      this.dispatchEvent(new Event("change", { bubbles: true })));
    ["click", "focus", "blur", "select"].forEach(e =>
      this._input.addEventListener(e, bump));

    const NAV = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);
    this._input.addEventListener("keyup", ev => {
      bump();
      if (NAV.has(ev.key)) this._revealCaret();
    });
    this._onSelChange = () => {
      if (document.activeElement === this._input) this.render();
    };
    document.addEventListener("selectionchange", this._onSelChange);

    this._inner.addEventListener("pointerdown", ev => {
      if (ev.button !== 0) return;
      ev.preventDefault();                 // the hidden font would place the caret wrong
      // preventScroll: the browser would otherwise scroll to the hidden input's
      // own caret, which sits nowhere near ours. A clicked position is already
      // visible by definition, so nothing here should move the scroller.
      const keep = this.scrollLeft;
      this._input.focus({ preventScroll: true });
      const i = this._indexAt(ev.clientX);
      if (ev.shiftKey && this._anchor !== null) this._applyRange(this._anchor, i);
      else { this._anchor = i; this._applyRange(i, i); }
      this.scrollLeft = keep;
      this._dragging = true;
      try { this._inner.setPointerCapture(ev.pointerId); } catch (e) { /* drag still works */ }
      bump();
    });

    this._inner.addEventListener("pointermove", ev => {
      if (!this._dragging || this._anchor === null) return;
      this._lastX = ev.clientX;
      const rect = this.getBoundingClientRect();
      if (ev.clientX > rect.right - 6 || ev.clientX < rect.left + 6) {
        this._autoScroll();
      } else {
        this._stopAutoScroll();
        this._applyRange(this._anchor, this._indexAt(ev.clientX));
        this.render();
      }
    });

    const endDrag = ev => {
      this._dragging = false;
      this._stopAutoScroll();
      try { this._inner.releasePointerCapture(ev.pointerId); } catch (e) { /* released */ }
    };
    this._inner.addEventListener("pointerup", endDrag);
    this._inner.addEventListener("pointercancel", endDrag);

    this._inner.addEventListener("dblclick", ev => {
      ev.preventDefault();
      const v = this._input.value;
      if (!v.length) return;
      const i = Math.min(this._indexAt(ev.clientX), v.length - 1);
      const WORD = /[A-Za-z0-9_À-ɏ]/;
      const cls = c => WORD.test(c) ? 1 : (c === " " ? 2 : 3);
      const k = cls(v[i]);
      let a = i, b = i;
      while (a > 0 && cls(v[a - 1]) === k) a--;
      while (b < v.length && cls(v[b]) === k) b++;
      this._anchor = a;
      this._applyRange(a, b);
      bump();
    });

    if (!this._reduce) {
      this._blink = setInterval(() => {
        if (document.activeElement !== this._input) return;
        this._caretOn = !this._caretOn;
        this.render();
      }, 530);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._blink) { clearInterval(this._blink); this._blink = null; }
    this._stopAutoScroll();
    if (this._onSelChange) {
      document.removeEventListener("selectionchange", this._onSelChange);
      this._onSelChange = null;
    }
  }

  get value() { return this._input ? this._input.value : (this.getAttribute("value") || ""); }
  set value(v) {
    if (!this._built) this._build();
    this._input.value = v;
    this.setAttribute("value", v);
    this.render();
  }

  focus() { this._input?.focus(); }

  /**
   * setSelectionRange makes the browser reveal the HIDDEN input's caret, which
   * sits nowhere near ours and yanks the scroll container with it. Pin the
   * scroll position across the call, then reveal our own caret deliberately.
   * Chrome can adjust again after layout, so pin once more next frame.
   */
  _applyRange(a, b, { reveal = false, pin = true } = {}) {
    const keep = this.scrollLeft;
    this._input.setSelectionRange(Math.min(a, b), Math.max(a, b),
                                  b < a ? "backward" : "forward");
    if (pin) this.scrollLeft = keep;
    requestAnimationFrame(() => {
      if (pin && !reveal && this.scrollLeft !== keep) this.scrollLeft = keep;
      if (reveal) this._revealCaret();
    });
  }

  /**
   * Drag past either edge and the field keeps scrolling and extending, the way
   * any text field does. The index is taken at the clamped edge, so whatever
   * scrolls into view under the pointer is what gets selected.
   */
  _autoScroll() {
    if (this._auto) return;
    const EDGE = 6;
    const step = () => {
      if (!this._dragging || this._anchor === null) { this._auto = null; return; }
      const rect = this.getBoundingClientRect();
      const x = this._lastX;
      let over = 0;
      if (x > rect.right - EDGE) over = x - (rect.right - EDGE);
      else if (x < rect.left + EDGE) over = x - (rect.left + EDGE);

      if (over !== 0) {
        const speed = Math.sign(over) * Math.min(40, Math.max(2, Math.abs(over) / 3));
        const before = this.scrollLeft;
        this.scrollLeft = before + speed;
        const edgeX = Math.min(Math.max(x, rect.left + EDGE), rect.right - EDGE);
        this._applyRange(this._anchor, this._indexAt(edgeX), { pin: false });
        this.render();
        if (this.scrollLeft === before) { this._auto = null; return; }   // hit the end
      }
      this._auto = requestAnimationFrame(step);
    };
    this._auto = requestAnimationFrame(step);
  }

  _stopAutoScroll() {
    if (this._auto) { cancelAnimationFrame(this._auto); this._auto = null; }
  }

  /** Scroll only when the caret is actually outside the visible strip. */
  _revealCaret() {
    if (!this._comp) return;
    const { s, dpr } = deviceScale(this.scale);
    const i = this._input.selectionStart ?? 0;
    const x = (this._comp.pens[i] ?? 0) * s / dpr;
    const margin = 8;
    const view = this.clientWidth;
    if (x - margin < this.scrollLeft) {
      this.scrollLeft = Math.max(0, x - margin);
    } else if (x + margin > this.scrollLeft + view) {
      this.scrollLeft = x + margin - view;
    }
  }

  _indexAt(clientX) {
    const pens = this._comp ? this._comp.pens : [0];
    const rect = this._canvas.getBoundingClientRect();
    const { s, dpr } = deviceScale(this.scale);
    const srcX = (clientX - rect.left) * dpr / s;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < pens.length; i++) {
      const d = Math.abs(pens[i] - srcX);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  render() {
    const font = this.font;
    if (!font || !this._built) return;

    const comp = font.compose(this._input.value, { pad: 4 });
    this._comp = comp;
    warnMissing(this, comp);

    const focused = document.activeElement === this._input;
    const a = Math.min(this._input.selectionStart ?? 0, this._input.selectionEnd ?? 0);
    const b = Math.max(this._input.selectionStart ?? 0, this._input.selectionEnd ?? 0);

    font.render(comp, {
      ink: this.ink,
      scale: this.scale,
      canvas: this._canvas,
      selection: b > a
        ? { a, b, bg: this.selectionBg, ink: this.selectionInk }
        : null,
      overlay: (ctx, s) => {
        if (b === a && focused && (this._caretOn || this._reduce)) {
          ctx.fillStyle = this.ink;
          ctx.fillRect((comp.pens[a] ?? 0) * s, 0, Math.max(1, s), comp.h * s);
        }
      },
    });
  }
}

if (!customElements.get("pixel-text")) customElements.define("pixel-text", PixelText);
if (!customElements.get("pixel-input")) customElements.define("pixel-input", PixelInput);

export { PixelText, PixelInput };
