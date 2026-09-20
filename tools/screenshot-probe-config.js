(async () => {
  const tabs = [...document.querySelectorAll(".tabs__tab")];
  const cfg = tabs.find((t) => t.textContent.trim().toUpperCase().includes("CONFIG"));
  if (!cfg) return { error: "no config tab", saw: tabs.map((t) => t.textContent.trim()) };
  cfg.click();
  await new Promise((r) => setTimeout(r, 600));
  const rails = [...document.querySelectorAll(".ph-slider__track")].map((t) => {
    const r = t.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right) };
  });
  return { rails, allSameLeft: new Set(rails.map((r) => r.left)).size === 1,
           allSameRight: new Set(rails.map((r) => r.right)).size === 1 };
})();
