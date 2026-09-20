/* Wipe every remembered window position, so the capture shows a fresh install. */
(() => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("windowFrame_") || key === "shownApps" || key === "launcherPos") {
      localStorage.removeItem(key);
    }
  }
  location.reload();
  return "cleared, reloading";
})();
