/*
 * Runs inside the page before a capture: show the Dungeon Map on its own,
 * wide enough for the stage to grow, then reload so the shell picks it up.
 */
(() => {
  localStorage.setItem(
    "windowFrame_app_7071",
    JSON.stringify({ x: 24, y: 24, width: 640, height: 700 }),
  );
  localStorage.setItem("shownApps", JSON.stringify({ app_7071: true }));
  localStorage.setItem("launcherPos", JSON.stringify({ x: 720, y: 24 }));
  localStorage.setItem(
    "appState_app_7071",
    JSON.stringify({ settings: { follow: true, showDoors: true, showSpawns: true, showDynels: true, showChests: true, showTerminals: false } }),
  );
  location.reload();
  return "dungeon map window set";
})();
