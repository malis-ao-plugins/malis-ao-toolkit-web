
const { app, BrowserWindow, ipcMain, screen } = require("electron");
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

function traceOverlayInput(event, details = {}) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[overlay-input] ${event}`, details);
  }
}

function setOverlayTopmostLevel(win, level) {
  if (
    !win ||
    win.isDestroyed() ||
    !win.overlayDirectInputEnabled ||
    (win.overlayTopmostLevel === level && win.isAlwaysOnTop())
  ) {
    return;
  }

  win.setAlwaysOnTop(true, level);
  win.overlayTopmostLevel = level;
}

function nativeWindowId(win) {
  if (!win || win.isDestroyed() || process.platform !== "win32") return null;

  try {
    const handle = win.getNativeWindowHandle();
    return handle.length >= 8
      ? Number(handle.readBigUInt64LE(0))
      : handle.readUInt32LE(0);
  } catch {
    return null;
  }
}

function isOverlayWindowActive(win, active) {
  const activeId = Number(active?.id);
  if (!Number.isFinite(activeId)) return false;
  return nativeWindowId(win) === activeId;
}

// ── URLs ─────────────────────────────────────────────────────────────────────

function getAppUrl(
  appId,
  {
    overlay = false,
    directInputEnabled = false,
  } = {},
) {
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

  if (directInputEnabled) {
    url.searchParams.set("directInputEnabled", "1");
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
  const overlayDirectInputEnabled = overlay;
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
          focusable: overlayDirectInputEnabled,
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
  win.overlayDirectInputEnabled = overlayDirectInputEnabled;
  win.overlayDirectInputActive = false;
  win.overlayDirectInputRequestedUntil = 0;
  win.overlayDirectInputClosedAt = 0;
  win.setMenu(null);
  win.setMenuBarVisibility(false);
  win.overlayTopmostLevel = overlay
    ? overlayDirectInputEnabled
      ? "screen-saver"
      : "floating"
    : null;
  win.overlayNativeWindowId = nativeWindowId(win);
  if (overlay) {
    if (overlayDirectInputEnabled) {
      traceOverlayInput("direct input enabled", {
        focusable: true,
      });
    }
    win.on("always-on-top-changed", (_event, alwaysOnTop) => {
      traceOverlayInput("overlay topmost changed", {
        alwaysOnTop,
        level: win.overlayTopmostLevel,
      });
    });
    if (overlayDirectInputEnabled) {
      win.on("focus", () => {
        win.overlayDirectInputActive = true;
        win.overlayDirectInputRequestedUntil = 0;
        win.overlayDirectInputClosedAt = 0;
        setOverlayTopmostLevel(win, "screen-saver");
        traceOverlayInput("direct input window focused", {
          visible: win.isVisible(),
          alwaysOnTop: win.isAlwaysOnTop(),
        });
      });
      win.on("blur", () => {
        win.overlayDirectInputActive = false;
        win.overlayDirectInputRequestedUntil = 0;
        win.overlayDirectInputClosedAt = Date.now();
        // Keep the overlay above the game while focus returns to it. Tracking
        // hides it on the next poll if another app remains foreground.
        setOverlayTopmostLevel(win, "screen-saver");
        traceOverlayInput("direct input window blurred", {
          visible: win.isVisible(),
          alwaysOnTop: win.isAlwaysOnTop(),
        });
      });
    }
  }
  if (overlay) {
    if (overlayDirectInputEnabled) {
      win.setAlwaysOnTop(true, "screen-saver");
    }
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

  win.loadURL(
    getAppUrl(appId, {
      overlay,
      directInputEnabled: win.overlayDirectInputEnabled,
    }),
  ).catch((error) => {
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
  let lastForegroundKey = null;

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

    // Foreground-window queries can briefly return nothing while Windows
    // switches to or away from the Start menu. Keep the last overlay state.
    if (!active) return;

    const foregroundKey = [
      active.id ?? "",
      active.owner?.processId ?? "",
      active.owner?.path ?? "",
      active.title ?? "",
    ].join("|");
    if (foregroundKey !== lastForegroundKey) {
      lastForegroundKey = foregroundKey;
      traceOverlayInput("tracking foreground changed", {
        activeId: active.id ?? null,
        activeTitle: active.title ?? null,
        activeProcessId: active.owner?.processId ?? null,
        activeProcessPath: active.owner?.path ?? null,
        isAnarchyOnline: isAnarchyOnline(active),
        overlayVisible: win.isVisible(),
        overlayFocused: win.isFocused(),
      });
    }

    // A missing active-window result is not evidence that AO was closed or
    // backgrounded. Keep the last placement until the OS reports a window.
    // Deliberately hide the overlay when AO isn't the foreground application.
    if (!isAnarchyOnline(active)) {
      const directInputTransition =
        win.overlayDirectInputEnabled &&
        (win.overlayDirectInputActive ||
          Date.now() < win.overlayDirectInputRequestedUntil);
      if (
        isOverlayWindowActive(win, active) ||
        directInputTransition
      ) {
        if (!win.isVisible()) win.showInactive();
        setOverlayTopmostLevel(win, "screen-saver");
        return;
      }

      if (win.isVisible()) {
        traceOverlayInput("overlay hidden by tracking", {
          activeId: active?.id ?? null,
          activeTitle: active?.title ?? null,
          activeProcessId: active?.owner?.processId ?? null,
          activeProcessPath: active?.owner?.path ?? null,
          overlayWindowId: win.overlayNativeWindowId,
          directInputActive: win.overlayDirectInputActive,
          directInputRequestedUntil: win.overlayDirectInputRequestedUntil,
          directInputClosedAt: win.overlayDirectInputClosedAt,
          alwaysOnTop: win.isAlwaysOnTop(),
        });
        win.hide();
      }
      setOverlayTopmostLevel(
        win,
        "screen-saver",
      );

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

    const screenBounds = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    // get-windows reports native screen coordinates on Windows (physical
    // pixels), while BrowserWindow bounds and renderer client rects use DIPs.
    // Convert native screen pixels to Electron's DIP coordinates before sizing.
    const bounds =
      process.platform === "win32"
        ? screen.screenToDipRect(null, screenBounds)
        : screenBounds;
    bounds.x = Math.round(bounds.x);
    bounds.y = Math.round(bounds.y);
    bounds.width = Math.round(bounds.width);
    bounds.height = Math.round(bounds.height);

    if (!sameBounds(lastBounds, bounds)) {
      win.setBounds(bounds);
      lastBounds = bounds;
    }

    if (win.overlayDirectInputEnabled) {
      setOverlayTopmostLevel(win, "screen-saver");
    }

    // Don't show an empty/uninitialised renderer.
    if (ready && !win.isVisible()) {
      traceOverlayInput("overlay shown for Anarchy Online", {
        bounds,
        alwaysOnTop: win.isAlwaysOnTop(),
      });
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

  ipcMain.on("overlay:focus-direct-input", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (
      !win ||
      win.isDestroyed() ||
      !win.isAoOverlay ||
      !win.overlayDirectInputEnabled
    ) {
      return;
    }

    win.overlayDirectInputActive = win.isFocused();
    win.overlayDirectInputRequestedUntil = Date.now() + 1200;
    win.overlayDirectInputClosedAt = 0;
    win.setIgnoreMouseEvents(false, { forward: true });
    setOverlayTopmostLevel(win, "screen-saver");
    if (!win.isVisible()) win.showInactive();
    win.focus();
    traceOverlayInput("direct input focus requested", {
      visible: win.isVisible(),
      focused: win.isFocused(),
      alwaysOnTop: win.isAlwaysOnTop(),
    });
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
