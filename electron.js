const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

// ── rendering ────────────────────────────────────────────────────────────────

// Turn ClearType off for this process.
//
// The UI's text is drawn from bitmap atlases (see src/pixelfont), so it is
// already immune to this. The handful of characters that do go through the
// font stack — a panel's caret, the number field's nudge buttons — are not.
// ClearType filters every edge across the R/G/B stripes, so even a correctly
// aligned one-pixel stem comes out with a blue edge down one side and a red
// edge down the other.
//
// CSS cannot switch it off — `-webkit-font-smoothing` is macOS-only in Blink
// and is ignored on Windows. This switch is the supported lever. With
// greyscale coverage of a grid-aligned rectangle being exactly 0 or 1, the
// result is hard pixels, not soft grey.
app.commandLine.appendSwitch("disable-lcd-text");

// ── helpers ──────────────────────────────────────────────────────────────────

function getAppUrl(appId) {
  const base =
    process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : `file://${path.join(__dirname, "build/index.html")}`;
  return appId ? `${base}?app=${appId}` : base;
}

function createWindow(appId = null, width = 720, height = 634) {
  const win = new BrowserWindow({
    width,
    height,
    frame: false,
    icon: path.join(__dirname, "build", "avatar.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // loadURL in both cases: file:// with a query string is not loadFile's job.
  win.loadURL(getAppUrl(appId));

  return win;
}

// ── lifecycle ─────────────────────────────────────────────────────────────────

/** Track per-app windows so we focus instead of duplicating */
const appWindows = new Map(); // appId → BrowserWindow

app.whenReady().then(() => {
  createWindow(); // the "all apps" hub window

  // ── IPC: open (or focus) a single-app window ─────────────────────────────
  ipcMain.on(
    "open-app-window",
    (_event, { appId, width = 720, height = 634 }) => {
      const existing = appWindows.get(appId);
      if (existing && !existing.isDestroyed()) {
        existing.focus();
        return;
      }
      const win = createWindow(appId, width, height);
      appWindows.set(appId, win);
      win.on("closed", () => appWindows.delete(appId));
    },
  );
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
