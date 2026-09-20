/* Painted text against the hidden text behind it, in the real browser.

   Every drawn string is a .pxt box carrying the mask, with a transparent
   .pxt__text inside it holding the real characters. If those two are not the
   same width the caret and the selection drift, and the difference per
   character says which way and by how much. */
(() => {
  const out = { dpr: window.devicePixelRatio };

  out.fonts = [...document.fonts].map((f) => `${f.family} ${f.status}`);

  const probe = (family, px, text) => {
    const el = document.createElement("span");
    el.style.cssText =
      "position:fixed;left:-9999px;top:0;white-space:pre;font-size:" +
      px +
      "px;font-family:" +
      family;
    el.textContent = text;
    document.body.appendChild(el);
    const w = el.getBoundingClientRect().width;
    el.remove();
    return Math.round(w * 1000) / 1000;
  };

  const run = "sssssssssss"; // 11 of one glyph: adv 6 in verdana-13, so 66
  out.sample = run;
  out.metricsFont13 = probe('"pxm-verdana-13r",monospace', 13, run);
  out.verdana13 = probe('"verdana",sans-serif', 13, run);
  out.verdana10_5 = probe('"verdana",sans-serif', 10.5, run);

  out.strings = [...document.querySelectorAll(".pxt")]
    .filter((el) => el.textContent.trim().length > 3)
    .slice(0, 6)
    .map((el) => {
      const inner = el.querySelector(".pxt__text");
      const cs = inner ? getComputedStyle(inner) : null;
      const painted = el.getBoundingClientRect().width;
      const hidden = inner ? inner.getBoundingClientRect().width : null;
      const n = el.textContent.length;
      return {
        text: el.textContent.slice(0, 24),
        n,
        painted: Math.round(painted * 100) / 100,
        hidden: hidden == null ? null : Math.round(hidden * 100) / 100,
        driftPerChar:
          hidden == null ? null : Math.round(((hidden - painted) / n) * 1000) / 1000,
        maskSize: el.style.maskSize || el.style.webkitMaskSize,
        font: cs ? `${cs.fontSize} ${cs.fontFamily}` : null,
      };
    });

  const field = document.querySelector(".pxi__field");
  if (field) {
    const cs = getComputedStyle(field);
    out.field = {
      value: field.value,
      font: `${cs.fontSize} ${cs.fontFamily}`,
      width: Math.round(field.getBoundingClientRect().width * 100) / 100,
    };
  }

  return out;
})();
