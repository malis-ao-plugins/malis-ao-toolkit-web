
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  /**
   * Open or focus a dedicated window for one app.
   * @param {string} appId
   * @param {number} width
   * @param {number} height
   */
  openAppWindow: (appId, width, height) =>
    ipcRenderer.send("open-app-window", {
      appId,
      width,
      height,
    }),

  /**
   * Request an overlay window from the Electron main process.
   * @param {string} appId
   * @param {number} width
   * @param {number} height
   */
  openOverlayWindow: (appId, width, height) =>
    ipcRenderer.send("open-overlay-window", {
      appId,
      width,
      height,
    }),
});
