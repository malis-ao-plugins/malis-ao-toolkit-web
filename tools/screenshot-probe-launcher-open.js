/* Open the launcher and leave it open for the capture. */
(async () => {
  const lch = document.querySelector(".lch");
  if (!lch) return { error: "no launcher" };

  const fire = () => {
    for (const type of ["pointerover", "pointerenter", "mouseover"]) {
      lch.dispatchEvent(new PointerEvent(type, { bubbles: type !== "pointerenter" }));
    }
  };

  fire();
  await new Promise((r) => setTimeout(r, 300));
  fire();

  // Keep re-asserting the hover so nothing can close it before the capture.
  const hold = setInterval(fire, 120);
  setTimeout(() => clearInterval(hold), 4000);

  await new Promise((r) => setTimeout(r, 300));
  return { tiles: lch.querySelectorAll(".lch__tile").length };
})();
