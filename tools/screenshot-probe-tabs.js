/* Time a switch to the Config tab, and count what it builds. */
(async () => {
  const win = [...document.querySelectorAll(".app")].find((a) =>
    a.textContent.includes("MISSION ROLLER") ||
    a.querySelector(".header-title")?.getAttribute("aria-label") === "MISSION ROLLER",
  ) || document.querySelectorAll(".app")[1] || document.querySelector(".app");
  if (!win) return { error: "no window" };

  const tabs = [...win.querySelectorAll(".tabs__tab")];
  const label = (t) => t.textContent.trim().toUpperCase();
  const roll = tabs.find((t) => label(t).includes("ROLL"));
  const config = tabs.find((t) => label(t).includes("CONFIG"));
  if (!config || !roll) return { error: "tabs not found", saw: tabs.map(label) };

  const twoFrames = () =>
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const count = () => ({
    nodes: win.querySelectorAll("*").length,
    pixelText: win.querySelectorAll(".pxt").length,
    numberInputs: win.querySelectorAll(".ph-num-input").length,
    canvases: win.querySelectorAll("canvas").length,
  });

  // Warm: make sure both tabs have been rendered once already.
  config.click();
  await twoFrames();
  roll.click();
  await twoFrames();

  const runs = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    config.click();
    await twoFrames();
    runs.push(Math.round(performance.now() - t0));

    const back = performance.now();
    roll.click();
    await twoFrames();
    runs.push(-Math.round(performance.now() - back));
  }

  config.click();
  await twoFrames();
  const onConfig = count();

  roll.click();
  await twoFrames();
  const onRoll = count();

  return {
    toConfigMs: runs.filter((n) => n > 0),
    toRollMs: runs.filter((n) => n < 0).map(Math.abs),
    onConfig,
    onRoll,
  };
})();
