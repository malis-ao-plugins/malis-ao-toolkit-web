/* Anything drawn wider than the box it sits in, anywhere in the options
   window. A mask cannot wrap, so a string that does not truncate simply runs
   out of its container and over whatever is next to it. */
(() => {
  const win = document.querySelector(".set__hint")?.closest(".app");
  if (!win) return { ok: false };

  const out = [];
  for (const el of win.querySelectorAll(".pxt")) {
    const r = el.getBoundingClientRect();
    const parent = el.parentElement.getBoundingClientRect();
    const spill = Math.round(r.right - parent.right);
    if (spill > 0) {
      out.push({
        text: el.textContent.slice(0, 36),
        spill,
        cls: String(el.className).slice(0, 34),
        parent: String(el.parentElement.className).slice(0, 30),
      });
    }
  }
  return { width: Math.round(win.getBoundingClientRect().width), spills: out };
})();
