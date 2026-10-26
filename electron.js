const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

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

// ── command-line helpers ─────────────────────────────────────────────────────

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getFlagValue(name, fallback = null) {
  const prefix = `${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function getNumberFlag(name, fallback) {
  const value = Number(getFlagValue(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function traceOverlay(event, details = {}) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[overlay] ${event}`, details);
  }
}

// ── URLs ─────────────────────────────────────────────────────────────────────

function getAppUrl(appId, { overlay = false, directInputEnabled = false } = {}) {
  // loadURL in both cases: file:// with a query string is not loadFile's job.
  const url =
    process.env.NODE_ENV === "development"
      ? new URL("http://localhost:3000/")
      : pathToFileURL(path.join(__dirname, "build", "index.html"));

  if (appId) url.searchParams.set("app", appId);
  if (overlay) url.searchParams.set("overlay", "1");
  if (directInputEnabled) url.searchParams.set("directInputEnabled", "1");

  return url.toString();
}

// ── window creation ──────────────────────────────────────────────────────────

/**
 * An ordinary toolkit window, or with `overlay` the in-game overlay: a
 * transparent, always-on-top window that lets the mouse through to the game
 * except where the toolkit's own UI is (see the hit test in Launcher.jsx).
 *
 * With `directInput` the overlay can take keyboard focus, so its text fields
 * can be typed into; without it the overlay never takes focus from the game.
 */
function createWindow(
  appId = null,
  width = 720,
  height = 634,
  { overlay = false, directInput = false } = {},
) {
  const win = new BrowserWindow({
    width,
    height,
    frame: false,
    thickFrame: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "avatar.ico"),

    ...(overlay
      ? {
          transparent: true,
          backgroundColor: "#00000000",
          alwaysOnTop: true,
          skipTaskbar: true,
          hasShadow: false,
          focusable: directInput,
          resizable: false,
          movable: false,
          show: false,
        }
      : {}),

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.isAoOverlay = overlay;
  win.overlayDirectInputEnabled = overlay && directInput;
  win.overlayDirectInputRequestedUntil = 0;
  win.setMenu(null);
  win.setMenuBarVisibility(false);

  if (overlay) {
    // Above the game, including a borderless full-screen one.
    win.setAlwaysOnTop(true, "screen-saver");
    // Pass mouse input through to the game underneath.
    win.setIgnoreMouseEvents(true, { forward: true });
    trackGameWindow(win);
  }

  if (hasFlag("--devtools")) {
    win.webContents.once("did-finish-load", () => {
      win.webContents.openDevTools({ mode: "detach" });
    });
  }

  win
    .loadURL(getAppUrl(appId, { overlay, directInputEnabled: win.overlayDirectInputEnabled }))
    .catch((error) => {
      console.error("Failed to load Mali's AO Toolkit window:", error);
    });

  return win;
}

// ── overlay placement ────────────────────────────────────────────────────────

/**
 * Where the overlay goes comes from the game, not from watching the desktop.
 *
 * Every injected client reports its window through the toolkit hub (AOSharp
 * Core's GameWindow): whether it is in front, whether it is minimised, and its
 * game area in physical screen pixels. The page picks the client in front and
 * forwards it here as { visible, bounds }. Nothing polls.
 */
function trackGameWindow(win) {
  let ready = false;
  let game = { visible: false, bounds: null };
  let lastBounds = null;
  let blurTimer = null;

  win.once("ready-to-show", () => {
    ready = true;
    place();
  });

  // Typing into the overlay takes focus from the game, which then reports
  // itself as not in front. The overlay stays up while it has focus, and for
  // a moment after a text field asked for it, before focus has moved.
  const holdingFocus = () =>
    win.isFocused() || Date.now() < win.overlayDirectInputRequestedUntil;

  function place() {
    if (win.isDestroyed() || !ready) return;

    if (!game.visible || !game.bounds) {
      if (holdingFocus()) return;
      if (win.isVisible()) {
        traceOverlay("hidden: no client in front");
        win.hide();
      }
      return;
    }

    // BrowserWindow bounds are in DIPs; the game reports physical pixels.
    const physical = {
      x: Math.round(game.bounds.x),
      y: Math.round(game.bounds.y),
      width: Math.round(game.bounds.width),
      height: Math.round(game.bounds.height),
    };
    const dip =
      process.platform === "win32"
        ? screen.screenToDipRect(null, physical)
        : physical;
    const bounds = {
      x: Math.round(dip.x),
      y: Math.round(dip.y),
      width: Math.round(dip.width),
      height: Math.round(dip.height),
    };

    if (
      !lastBounds ||
      lastBounds.x !== bounds.x ||
      lastBounds.y !== bounds.y ||
      lastBounds.width !== bounds.width ||
      lastBounds.height !== bounds.height
    ) {
      win.setBounds(bounds);
      lastBounds = bounds;
    }

    if (!win.isVisible()) {
      traceOverlay("shown over the client in front", bounds);
      win.showInactive();
    }
    win.setAlwaysOnTop(true, "screen-saver");
  }

  win.overlayPlace = (next) => {
    game = next;
    place();
  };

  // Focus leaving the overlay for something other than the game: nothing
  // will report a change, so look again once focus has settled.
  win.on("blur", () => {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(place, 300);
  });

  win.on("closed", () => clearTimeout(blurTimer));
}

// ── lifecycle ─────────────────────────────────────────────────────────────────

/** Track per-app windows so we focus instead of duplicating */
const appWindows = new Map(); // appId → BrowserWindow

app.whenReady().then(() => {
  if (hasFlag("--overlay")) {
    createWindow(
      getFlagValue("--overlay-tool"),
      getNumberFlag("--overlay-width", 720),
      getNumberFlag("--overlay-height", 634),
      { overlay: true, directInput: hasFlag("--overlay-direct-input") },
    );
  } else {
    createWindow(); // the "all apps" hub window
  }

  // ── IPC: the overlay ──────────────────────────────────────────────────────

  const overlayOf = (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win && !win.isDestroyed() && win.isAoOverlay ? win : null;
  };

  ipcMain.on("overlay:set-mouse-passthrough", (event, passthrough) => {
    overlayOf(event)?.setIgnoreMouseEvents(Boolean(passthrough), { forward: true });
  });

  ipcMain.on("overlay:game-window", (event, game) => {
    overlayOf(event)?.overlayPlace?.({
      visible: Boolean(game?.visible),
      bounds: game?.bounds ?? null,
    });
  });

  ipcMain.on("overlay:focus-direct-input", (event) => {
    const win = overlayOf(event);
    if (!win?.overlayDirectInputEnabled) return;

    win.overlayDirectInputRequestedUntil = Date.now() + 1200;
    win.setIgnoreMouseEvents(false, { forward: true });
    if (!win.isVisible()) win.showInactive();
    win.focus();
    traceOverlay("direct input focus requested", { focused: win.isFocused() });
  });

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
