
const { contextBridge, ipcRenderer } = require("electron");

const subscribe = (channel, callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

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

  setOverlayMousePassthrough: (passthrough) =>
  ipcRenderer.send("overlay:set-mouse-passthrough", passthrough),
  openOverlayInputProxy: (field) =>
    ipcRenderer.send("overlay-input-proxy:open", field),
  updateOverlayInputProxyPosition: (position) =>
    ipcRenderer.send("overlay-input-proxy:position", position),
  updateOverlayInputProxy: (update) =>
    ipcRenderer.send("overlay-input-proxy:update", update),
  closeOverlayInputProxy: () =>
    ipcRenderer.send("overlay-input-proxy:close"),
  onOverlayInputProxyChange: (callback) =>
    subscribe("overlay-input-proxy:change", callback),
  onOverlayInputProxyClosed: (callback) =>
    subscribe("overlay-input-proxy:closed", callback),
  onOverlayInputProxyInit: (callback) =>
    subscribe("overlay-input-proxy:init", callback),
  onOverlayInputProxyUpdate: (callback) =>
    subscribe("overlay-input-proxy:update", callback),
  readyOverlayInputProxy: () =>
    ipcRenderer.send("overlay-input-proxy:ready"),
  reportOverlayInputProxyFocus: () =>
    ipcRenderer.send("overlay-input-proxy:focused"),
  sendOverlayInputProxyChange: (change) =>
    ipcRenderer.send("overlay-input-proxy:change", change),
  finishOverlayInputProxy: (result) =>
    ipcRenderer.send("overlay-input-proxy:finish", result),
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
