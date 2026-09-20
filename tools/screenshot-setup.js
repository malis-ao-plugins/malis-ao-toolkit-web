/*
 * Runs inside the page before a capture.
 *
 * Puts the two windows side by side and wide enough that the Item Assistant
 * shows every column, then reloads so the shell picks the frames up. The
 * shell reads these keys on mount, so they have to be in place first.
 */
(() => {
  const frames = {
    windowFrame_app_7068: { x: 24, y: 24, width: 700, height: 560 },
    windowFrame_app_7069: { x: 748, y: 24, width: 420, height: 760 },
  };

  for (const [key, value] of Object.entries(frames)) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  localStorage.setItem(
    "shownApps",
    JSON.stringify({ app_7068: true, app_7069: true }),
  );
  localStorage.setItem("launcherPos", JSON.stringify({ x: 1180, y: 24 }));

  location.reload();
  return "frames set, reloading";
})();
