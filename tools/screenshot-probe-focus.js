/* What is focused right now, and what ring does it resolve to? */
(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { focused: "nothing" };
  const cs = getComputedStyle(el);
  return {
    tag: el.tagName.toLowerCase(),
    cls: el.className,
    role: el.getAttribute("role"),
    focusVisible: el.matches(":focus-visible"),
    outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
    offset: cs.outlineOffset,
  };
})();
