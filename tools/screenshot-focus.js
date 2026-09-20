/* Focus each interactive control in turn and report what the ring resolves to. */
(() => {
  const targets = [
    [".tabs__tab", "tab"],
    [".ph-panel__head--clickable", "collapsible panel head"],
    [".ph-btn", "button"],
    [".ph-toggle", "toggle"],
    [".ph-search__clear", "search clear"],
    [".pxs__trigger", "select trigger"],
    [".lch__puck", "launcher puck"],
    [".header-min", "minimise"],
    [".ph-seg__item", "segmented item"],
    [".flt-tag", "filter tag"],
  ];

  const out = [];

  for (const [selector, label] of targets) {
    const el = document.querySelector(selector);
    if (!el) {
      out.push({ label, present: false });
      continue;
    }

    try {
      el.focus({ focusVisible: true });
    } catch {
      el.focus();
    }

    const cs = getComputedStyle(el);
    out.push({
      label,
      present: true,
      focused: document.activeElement === el,
      focusVisible: el.matches(":focus-visible"),
      outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
      offset: cs.outlineOffset,
      tabIndex: el.tabIndex,
      role: el.getAttribute("role"),
      ariaExpanded: el.getAttribute("aria-expanded"),
    });

    el.blur();
  }

  return out;
})();
