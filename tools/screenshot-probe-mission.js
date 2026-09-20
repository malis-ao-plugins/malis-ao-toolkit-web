/* How much room does a mission name actually have? */
(() => {
  const card = document.querySelector(".rl-mission");
  if (!card) return { error: "no mission card" };
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
  };
  const id = card.querySelector(".rl-mission__id");
  const name = card.querySelector(".rl-mission__name");
  const zone = card.querySelector(".rl-mission__zone");
  const meta = card.querySelector(".rl-mission__meta");
  return {
    window: Math.round(card.closest(".app").getBoundingClientRect().width),
    card: box(card),
    id: box(id),
    name: box(name),
    nameText: name?.textContent,
    zone: box(zone),
    meta: box(meta),
    overflowPx: name && id ? Math.round(name.getBoundingClientRect().right - id.getBoundingClientRect().right) : null,
  };
})();
