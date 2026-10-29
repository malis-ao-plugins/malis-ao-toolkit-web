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

  /** Overlay: let the mouse through to the game (true) or take it (false). */
  setOverlayMousePassthrough: (passthrough) =>
    ipcRenderer.send("overlay:set-mouse-passthrough", passthrough),

  /** Overlay: a text field was pressed; take keyboard focus from the game. */
  focusOverlayDirectInput: () => ipcRenderer.send("overlay:focus-direct-input"),

  /**
   * Overlay: the game client in front, or none.
   * @param {{ visible: boolean, bounds: ?{x:number,y:number,width:number,height:number} }} game
   *   bounds in physical screen pixels, as the client reports them
   */
  setGameWindow: (game) => ipcRenderer.send("overlay:game-window", game),

  /** Overlay: whether it may take keyboard focus for its text fields. */
  setOverlayDirectInput: (on) => ipcRenderer.send("overlay:set-direct-input", on),

  /**
   * The window has moved over the game (true) or back (false).
   * @param {(on: boolean) => void} listener
   */
  onOverlayMode: (listener) =>
    ipcRenderer.on("overlay:mode", (_event, on) => listener(on)),

  /** The page now looks the part, and the window may be placed. */
  overlayModeApplied: (on) => ipcRenderer.send("overlay:mode-applied", on),
});
