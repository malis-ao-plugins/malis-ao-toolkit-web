/* Put the roller on the Config tab, wide enough to read. */
(() => {
  localStorage.setItem("windowFrame_app_7069", JSON.stringify({ x: 24, y: 24, width: 340, height: 700 }));
  localStorage.setItem("shownApps", JSON.stringify({ app_7068: false, app_7069: true }));
  localStorage.setItem("launcherPos", JSON.stringify({ x: 1180, y: 700 }));
  location.reload();
  return "set";
})();
