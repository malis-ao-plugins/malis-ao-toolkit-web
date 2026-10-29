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

function traceOverlay(event, details = {}) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[overlay] ${event}`, details);
  }
}

// ── URLs ─────────────────────────────────────────────────────────────────────

function getAppUrl(appId) {
  // loadURL in both cases: file:// with a query string is not loadFile's job.
  const url =
    process.env.NODE_ENV === "development"
      ? new URL("http://localhost:3000/")
      : pathToFileURL(path.join(__dirname, "build", "index.html"));

  if (appId) url.searchParams.set("app", appId);

  return url.toString();
}

// ── window creation ──────────────────────────────────────────────────────────

/**
 * A toolkit window. With `followsGame` it is the main one: an ordinary window
 * that moves over the game whenever an injected client is in front (see
 * followGame). It is transparent from the start, because a window cannot be
 * made transparent later; the page paints its own background while it is an
 * ordinary window.
 */
function createWindow(appId = null, width = 720, height = 634, { followsGame = false } = {}) {
  const win = new BrowserWindow({
    width,
    height,
    frame: false,
    thickFrame: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "avatar.ico"),

    ...(followsGame
      ? {
          transparent: true,
          backgroundColor: "#00000000",
          hasShadow: false,
        }
      : {}),

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      // The page has to answer while minimised: it is what tells this
      // process the game came to the front, and it acknowledges the switch.
      ...(followsGame ? { backgroundThrottling: false } : {}),
    },
  });

  win.setMenu(null);
  win.setMenuBarVisibility(false);

  if (followsGame) followGame(win);

  if (hasFlag("--devtools")) {
    win.webContents.once("did-finish-load", () => {
      win.webContents.openDevTools({ mode: "detach" });
    });
  }

  win.loadURL(getAppUrl(appId)).catch((error) => {
    console.error("Failed to load Mali's AO Toolkit window:", error);
  });

  return win;
}

// ── following the game ───────────────────────────────────────────────────────

/**
 * Where the window goes comes from the game, not from watching the desktop.
 *
 * Every injected client reports its window through the toolkit hub (AOSharp
 * Core's GameWindow): whether it is in front, whether it is minimised, and its
 * game area in physical screen pixels. The page picks the client in front and
 * forwards it here as { visible, bounds }. Nothing polls.
 *
 * A client in front turns the window into the overlay: over the game, on top,
 * out of the taskbar, letting the mouse through except where the UI is (the
 * hit test in Launcher.jsx), and taking no keyboard focus unless typing into
 * it is switched on in the options. None in front puts it back where it was,
 * minimised, so it does not land on top of whatever was switched to.
 *
 * Going over the game waits for the page to say it has turned transparent;
 * stretched over the screen first, its window background would cover it.
 */
function followGame(win) {
  let mode = "window"; // "window" | "entering" | "overlay"
  let game = { visible: false, bounds: null };
  let normalBounds = null;
  let lastBounds = null;
  let enterTimer = null;
  let blurTimer = null;

  win.overlayActive = () => mode === "overlay";
  win.overlayDirectInput = false;
  win.overlayDirectInputRequestedUntil = 0;

  // Typing into the overlay takes focus from the game, which then reports
  // itself as not in front. The overlay stays up while it has focus, and for
  // a moment after a text field asked for it, before focus has moved.
  const holdingFocus = () =>
    win.isFocused() || Date.now() < win.overlayDirectInputRequestedUntil;

  function enter() {
    normalBounds = win.getNormalBounds();
    mode = "entering";
    traceOverlay("going over the game");

    win.setSkipTaskbar(true);
    win.setResizable(false);
    win.setFocusable(win.overlayDirectInput);
    win.setIgnoreMouseEvents(true, { forward: true });
    win.webContents.send("overlay:mode", true);

    // In case the page never answers: better a flash than no overlay.
    enterTimer = setTimeout(entered, 500);
  }

  function entered() {
    if (mode !== "entering") return;
    clearTimeout(enterTimer);
    mode = "overlay";
    lastBounds = null;
    place();
  }

  function leave() {
    clearTimeout(enterTimer);
    mode = "window";
    lastBounds = null;
    traceOverlay("back to a window: no client in front");

    win.hide();
    win.setAlwaysOnTop(false);
    win.setIgnoreMouseEvents(false);
    win.setFocusable(true);
    win.setResizable(true);
    win.setSkipTaskbar(false);
    if (normalBounds) win.setBounds(normalBounds);
    win.webContents.send("overlay:mode", false);
    win.minimize();
  }

  function place() {
    if (win.isDestroyed()) return;

    const showing = game.visible && game.bounds;

    if (mode === "window") {
      if (showing) enter();
      return;
    }

    if (!showing) {
      if (mode === "overlay" && holdingFocus()) return;
      leave();
      return;
    }

    if (mode === "entering") return;

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

    // Shown before it is sized: a minimised window takes no bounds.
    if (!win.isVisible() || win.isMinimized()) {
      traceOverlay("shown over the client in front", bounds);
      win.showInactive();
    }

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

    win.setAlwaysOnTop(true, "screen-saver");
  }

  win.overlayPlace = (next) => {
    game = next;
    place();
  };

  win.overlayApplied = (on) => {
    if (on) entered();
  };

  win.overlaySetDirectInput = (on) => {
    win.overlayDirectInput = on;
    if (mode !== "window") win.setFocusable(on);
  };

  // Focus leaving the overlay for something other than the game: nothing
  // will report a change, so look again once focus has settled.
  win.on("blur", () => {
    if (mode !== "overlay") return;
    clearTimeout(blurTimer);
    blurTimer = setTimeout(place, 300);
  });

  win.on("closed", () => {
    clearTimeout(blurTimer);
    clearTimeout(enterTimer);
  });
}

// ── lifecycle ─────────────────────────────────────────────────────────────────

/** Track per-app windows so we focus instead of duplicating */
const appWindows = new Map(); // appId → BrowserWindow

/** The window that follows the game. */
let mainWindow = null;

// One toolkit at a time. A second copy would share this one's profile and
// fight it for the caches, and both would follow the game. Launching it again
// brings this one forward instead, unless it is over the game already.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.overlayActive()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(ready);
}

function ready() {
  mainWindow = createWindow(null, 720, 634, { followsGame: true });

  // ── IPC: the overlay ──────────────────────────────────────────────────────

  const overlayOf = (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win && !win.isDestroyed() && win.overlayPlace ? win : null;
  };

  ipcMain.on("overlay:set-mouse-passthrough", (event, passthrough) => {
    const win = overlayOf(event);
    if (!win?.overlayActive()) return;
    win.setIgnoreMouseEvents(Boolean(passthrough), { forward: true });
  });

  ipcMain.on("overlay:game-window", (event, game) => {
    overlayOf(event)?.overlayPlace({
      visible: Boolean(game?.visible),
      bounds: game?.bounds ?? null,
    });
  });

  ipcMain.on("overlay:mode-applied", (event, on) => {
    overlayOf(event)?.overlayApplied(Boolean(on));
  });

  ipcMain.on("overlay:set-direct-input", (event, on) => {
    overlayOf(event)?.overlaySetDirectInput(Boolean(on));
  });

  ipcMain.on("overlay:focus-direct-input", (event) => {
    const win = overlayOf(event);
    if (!win?.overlayActive() || !win.overlayDirectInput) return;

    win.overlayDirectInputRequestedUntil = Date.now() + 1200;
    win.setIgnoreMouseEvents(false, { forward: true });
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
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
