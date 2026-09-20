const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  /**
   * Ask the main process to open (or focus) a dedicated window for one app.
   * @param {string} appId   - The app's id (e.g. "app_7069")
   * @param {number} width   - Preferred window width  (falls back to 720)
   * @param {number} height  - Preferred window height (falls back to 634)
   */
  openAppWindow: (appId, width, height) =>
    ipcRenderer.send("open-app-window", { appId, width, height }),
});
