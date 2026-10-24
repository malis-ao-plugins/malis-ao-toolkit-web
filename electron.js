
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// ── rendering ────────────────────────────────────────────────────────────────

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

// ── URLs ─────────────────────────────────────────────────────────────────────

function getAppUrl(appId, { overlay = false } = {}) {
  const url =
    process.env.NODE_ENV === "development"
      ? new URL("http://localhost:3000/")
      : pathToFileURL(path.join(__dirname, "build", "index.html"));

  if (appId) {
    url.searchParams.set("app", appId);
  }

  if (overlay) {
    url.searchParams.set("overlay", "1");
  }

  return url.toString();
}

// ── window creation ──────────────────────────────────────────────────────────

function createWindow(
  appId = null,
  width = 720,
  height = 634,
  { overlay = false } = {},
) {
  const win = new BrowserWindow({
    width,
    height,
    frame: false,
    icon: path.join(__dirname, "build", "avatar.ico"),

    ...(overlay
      ? {
          transparent: true,
          backgroundColor: "#00000000",
          alwaysOnTop: true,
          skipTaskbar: true,
          hasShadow: false,
          focusable: false,
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
  if (overlay) {
    // Pass mouse input through to the game underneath.
    win.setIgnoreMouseEvents(true, { forward: true });
  }

  if (process.argv.includes("--devtools")) {
    win.webContents.once("did-finish-load", () => {
      win.webContents.openDevTools({
        mode: "detach",
      });
    });
  }

  win.loadURL(getAppUrl(appId, { overlay })).catch((error) => {
    console.error("Failed to load Mali's AO Toolkit window:", error);
  });

  return win;
}

// ── overlay tracking ─────────────────────────────────────────────────────────

function isAnarchyOnline(windowInfo) {
  if (!windowInfo?.owner) {
    return false;
  }

  const exePath = String(windowInfo.owner.path || "")
    .replace(/\//g, "\\")
    .toLowerCase();

  const name = String(windowInfo.owner.name || "").toLowerCase();

  return (
    exePath.endsWith("\\anarchyonline.exe") ||
    name === "anarchyonline.exe" ||
    name === "anarchy online"
  );
}

function sameBounds(a, b) {
  return (
    a &&
    b &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  );
}

async function startOverlayTracking(win) {
  let activeWindowSync;
  let timer = null;
  let disposed = false;
  let ready = false;
  let lastBounds = null;

  win.once("ready-to-show", () => {
    ready = true;
  });

  win.on("closed", () => {
    disposed = true;

    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  });

  try {
    // get-windows is ESM-only; dynamic import works from this CommonJS file.
    ({ activeWindowSync } = await import("get-windows"));
  } catch (error) {
    console.error("Could not load get-windows:", error);
    return;
  }

  if (disposed) {
    return;
  }

  timer = setInterval(() => {
    if (disposed || win.isDestroyed()) {
      return;
    }

    let active;

    try {
      active = activeWindowSync();
    } catch (error) {
      console.error("Could not detect foreground window:", error);
      win.hide();
      lastBounds = null;
      return;
    }

    // Deliberately hide the overlay when AO isn't the foreground application.
    if (!isAnarchyOnline(active)) {
      if (win.isVisible()) {
        win.hide();
      }

      lastBounds = null;
      return;
    }

    const rect = active.contentBounds || active.bounds;

    if (
      !rect ||
      !Number.isFinite(rect.x) ||
      !Number.isFinite(rect.y) ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      win.hide();
      lastBounds = null;
      return;
    }

    const bounds = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    if (!sameBounds(lastBounds, bounds)) {
      win.setBounds(bounds);
      lastBounds = bounds;
    }

    // Don't show an empty/uninitialised renderer.
    if (ready && !win.isVisible()) {
      win.showInactive();
    }
  }, 100);
}

// ── lifecycle ─────────────────────────────────────────────────────────────────

const appWindows = new Map();

app.whenReady().then(() => {
  const overlayMode = hasFlag("--overlay");

  if (overlayMode) {
    const appId = getFlagValue("--overlay-tool");
    const width = getNumberFlag("--overlay-width", 720);
    const height = getNumberFlag("--overlay-height", 634);

    const win = createWindow(appId, width, height, {
      overlay: true,
    });

    startOverlayTracking(win);
  } else {
    // Normal toolkit startup: preserve the existing hub.
    createWindow();
  }
  
  ipcMain.on("overlay:set-mouse-passthrough", (event, passthrough) => {
	const win = BrowserWindow.fromWebContents(event.sender);

	if (!win || win.isDestroyed() || !win.isAoOverlay) {
	  return;
	}

	win.setIgnoreMouseEvents(Boolean(passthrough), { forward: true });
  });
  
  // Preserve existing open/focus behaviour for individual app windows.
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

      win.on("closed", () => {
        appWindows.delete(appId);
      });
    },
  );
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
