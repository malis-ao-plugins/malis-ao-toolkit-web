/* Open the launcher ring and pick the Interface tile, so the options window
   is on screen to be looked at. */
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fire = (el, type) =>
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));

  const puck = document.querySelector(".lch");
  if (!puck) return { ok: false, why: "no launcher" };

  for (const type of ["pointerover", "pointerenter", "pointermove"]) fire(puck, type);
  await wait(700);

  const tiles = [...document.querySelectorAll(".lch__tile")];
  const tile = tiles.find((b) => (b.title || "").startsWith("Interface options"));
  if (!tile) return { ok: false, why: "no tile", saw: tiles.map((b) => b.title) };

  tile.click();
  await wait(900);

  // Every other window out of the way: the options window opens behind them
  // and the whole point is to look at it.
  const settings = document.querySelector(".set__hint")?.closest(".app");
  for (const win of document.querySelectorAll(".app")) {
    if (win !== settings) win.style.display = "none";
  }
  if (settings) {
    settings.style.left = "40px";
    settings.style.top = "20px";
    settings.style.height = "820px";
    settings.style.width = "260px";
  }
  await wait(400);
  return { ok: true, open: !!settings };
})();
