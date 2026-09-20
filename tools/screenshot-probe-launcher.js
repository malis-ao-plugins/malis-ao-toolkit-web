/* Open the launcher by hover and check the ring is centred on the puck. */
(async () => {
  const lch = document.querySelector(".lch");
  if (!lch) return { error: "no launcher" };

  // React emulates pointerenter from pointerover, which does bubble.
  lch.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 700));

  const puck = lch.querySelector(".lch__puck").getBoundingClientRect();
  const cx = puck.left + puck.width / 2;
  const cy = puck.top + puck.height / 2;

  const tiles = [...lch.querySelectorAll(".lch__tile")].map((t) => {
    const r = t.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    return {
      label: t.textContent.trim(),
      dx: Math.round(dx),
      dy: Math.round(dy),
      distanceFromPuckCentre: Math.round(Math.hypot(dx, dy)),
    };
  });

  // The hover area that keeps the ring open.
  const ring = lch.querySelector(".lch__ring");
  const ringBox = ring ? ring.getBoundingClientRect() : null;

  return {
    open: tiles.length > 0,
    puckCentre: { x: Math.round(cx), y: Math.round(cy) },
    ringOriginOffset: ringBox
      ? { dx: Math.round(ringBox.left - cx), dy: Math.round(ringBox.top - cy) }
      : null,
    tiles,
  };
})();
