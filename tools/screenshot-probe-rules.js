/*
 * Does a :focus-visible rule actually target each control?
 *
 * Independent of whether the browser currently considers focus visible: it
 * strips the pseudo-class off every focus rule in the loaded stylesheets and
 * asks the element whether the remaining selector matches it.
 */
(() => {
  const rules = [...document.styleSheets].flatMap((sheet) => {
    try {
      return [...sheet.cssRules];
    } catch {
      return [];
    }
  });

  const focusSelectors = rules
    .filter((r) => r.selectorText && r.selectorText.includes(":focus-visible"))
    .flatMap((r) =>
      r.selectorText
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.includes(":focus-visible"))
        .map((s) => ({
          base: s.replace(":focus-visible", ""),
          outline: r.style.outline || r.style.outlineWidth || "(none)",
          offset: r.style.outlineOffset || "(none)",
        })),
    );

  const targets = [
    [".tabs__tab", "tab"],
    [".ph-panel__head--clickable", "collapsible panel head"],
    [".ph-btn", "button"],
    [".pxs__trigger", "select trigger"],
    [".lch__puck", "launcher puck"],
    [".header-min", "minimise"],
    [".ph-search__clear", "search clear"],
  ];

  const covered = targets.map(([selector, label]) => {
    const el = document.querySelector(selector);
    if (!el) return { label, present: false };
    const hit = focusSelectors.find((f) => {
      try {
        return el.matches(f.base);
      } catch {
        return false;
      }
    });
    return {
      label,
      present: true,
      ruled: !!hit,
      outline: hit ? hit.outline : null,
      offset: hit ? hit.offset : null,
    };
  });

  return { focusRuleCount: focusSelectors.length, covered };
})();
