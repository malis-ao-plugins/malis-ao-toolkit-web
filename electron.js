
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

function traceOverlayInputProxy(event, details = {}) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[overlay-input-proxy] ${event}`, details);
  }
}

function setOverlayInputProxyTopmostLevel(win, level) {
  if (
    !win ||
    win.isDestroyed() ||
    !win.overlayInputProxyEnabled ||
    win.overlayInputProxyTopmostLevel === level
  ) {
    return;
  }

  win.setAlwaysOnTop(true, level);
  win.overlayInputProxyTopmostLevel = level;
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

  const knownIds = [
    nativeWindowId(win),
    nativeWindowId(win.overlayInputProxy),
    win.overlayInputProxyLastNativeId,
  ];
  return knownIds.some((id) => id !== null && id === activeId);
}

// ── URLs ─────────────────────────────────────────────────────────────────────

function getAppUrl(
  appId,
  { overlay = false, inputProxyEnabled = false, inputProxy = false } = {},
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

  if (inputProxyEnabled) {
    url.searchParams.set("inputProxyEnabled", "1");
  }

  if (inputProxy) {
    url.searchParams.set("inputProxy", "1");
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
  win.setMenu(null);
  win.setMenuBarVisibility(false);
  win.overlayInputProxyEnabled = overlay && hasFlag("--overlay-input-proxy");
  win.overlayInputProxy = null;
  win.overlayInputProxyFieldId = null;
  win.overlayInputProxyLastNativeId = null;
  win.overlayInputProxyClosedAt = 0;
  win.overlayInputProxyTopmostLevel = overlay ? "floating" : null;
  win.overlayNativeWindowId = nativeWindowId(win);
  if (overlay) {
    win.on("always-on-top-changed", (_event, alwaysOnTop) => {
      traceOverlayInputProxy("overlay topmost changed", {
        alwaysOnTop,
        level: win.overlayInputProxyTopmostLevel,
      });
    });
    traceOverlayInputProxy(
      win.overlayInputProxyEnabled ? "enabled" : "disabled",
      { launchFlag: "--overlay-input-proxy" },
    );
  }
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

  win.loadURL(
    getAppUrl(appId, {
      overlay,
      inputProxyEnabled: win.overlayInputProxyEnabled,
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

function proxyWindowBounds(parent, rect) {
  if (
    !rect ||
    ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return null;
  }

  const parentBounds = parent.getBounds();
  return {
    x: Math.round(parentBounds.x + rect.left),
    y: Math.round(parentBounds.y + rect.top),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function positionOverlayInputProxy(parent, fieldId, rect) {
  const proxy = parent.overlayInputProxy;
  if (
    !proxy ||
    proxy.isDestroyed() ||
    fieldId !== parent.overlayInputProxyFieldId
  ) {
    return;
  }

  const bounds = proxyWindowBounds(parent, rect);
  if (!bounds) return;

  proxy.overlayInputProxyField = {
    ...proxy.overlayInputProxyField,
    rect,
  };
  if (!sameBounds(proxy.getBounds(), bounds)) {
    proxy.setBounds(bounds);
  }
}

function keepOverlayAboveInputProxy(parent, proxy) {
  if (!parent || parent.isDestroyed()) return;

  if (!parent.isVisible()) {
    parent.showInactive();
  }
  parent.overlayInputProxyUsed = true;
  setOverlayInputProxyTopmostLevel(parent, "screen-saver");

  // Raise once on focus. Repeating moveTop on every foreground poll makes the
  // overlay flash while the child owns keyboard focus.
  parent.moveTop();
  if (proxy && !proxy.isDestroyed()) {
    proxy.setAlwaysOnTop(true, "screen-saver");
    proxy.moveTop();
  }
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

    // Foreground-window queries can briefly return nothing while Windows
    // switches to or away from the Start menu. Keep the last overlay state.
    if (!active) return;

    // A missing active-window result is not evidence that AO was closed or
    // backgrounded. Keep the last placement until the OS reports a window.
    // Deliberately hide the overlay when AO isn't the foreground application.
    if (!isAnarchyOnline(active)) {
      const proxyVisible =
        win.overlayInputProxy &&
        !win.overlayInputProxy.isDestroyed() &&
        win.overlayInputProxy.isVisible();
      const proxyJustClosed =
        Date.now() - win.overlayInputProxyClosedAt < 500;
      if (
        isOverlayWindowActive(win, active) ||
        proxyVisible
      ) {
        if (!win.isVisible()) win.showInactive();
        setOverlayInputProxyTopmostLevel(win, "screen-saver");
        return;
      }

      // Give the foreground transition after proxy blur a short generic grace
      // period. This avoids treating a transient focus target as a permanent
      // app switch, without depending on its process name.
      if (proxyJustClosed) {
        setOverlayInputProxyTopmostLevel(win, "floating");
        return;
      }

      if (win.isVisible()) {
        traceOverlayInputProxy("overlay hidden by tracking", {
          activeId: active?.id ?? null,
          activeTitle: active?.title ?? null,
          activeProcessId: active?.owner?.processId ?? null,
          activeProcessPath: active?.owner?.path ?? null,
          overlayWindowId: win.overlayNativeWindowId,
          proxyWindowId: win.overlayInputProxyLastNativeId,
        });
        win.hide();
      }
      setOverlayInputProxyTopmostLevel(win, "floating");
      win.overlayInputProxyLastNativeId = null;
      win.overlayInputProxyClosedAt = 0;

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
    // Convert before sizing the overlay so proxy fields, which are positioned
    // from renderer CSS pixels, share the same coordinate space.
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
      if (win.overlayInputProxy) {
        positionOverlayInputProxy(
          win,
          win.overlayInputProxyFieldId,
          win.overlayInputProxy.overlayInputProxyField?.rect,
        );
      }
    }

    if (win.overlayInputProxyUsed) {
      setOverlayInputProxyTopmostLevel(win, "screen-saver");
    }

    // Don't show an empty/uninitialised renderer.
    if (ready && !win.isVisible()) {
      traceOverlayInputProxy("overlay shown for Anarchy Online", {
        bounds,
        alwaysOnTop: win.isAlwaysOnTop(),
      });
      win.showInactive();
      if (win.overlayInputProxyUsed) win.moveTop();
    }
  }, 100);
}

function closeOverlayInputProxy(parent, commit = true, reason = "requested") {
  const proxy = parent.overlayInputProxy;
  if (!proxy) return;

  const fieldId = parent.overlayInputProxyFieldId;
  parent.overlayInputProxyLastNativeId = nativeWindowId(proxy);
  parent.overlayInputProxyClosedAt = Date.now();
  traceOverlayInputProxy("closed", { fieldId, commit, reason });
  parent.overlayInputProxy = null;
  parent.overlayInputProxyFieldId = null;

  if (!proxy.isDestroyed()) {
    proxy.close();
  }

  if (!parent.isDestroyed()) {
    parent.webContents.send("overlay-input-proxy:closed", { fieldId, commit });
  }
}

function openOverlayInputProxy(parent, field) {
  const bounds = proxyWindowBounds(parent, field?.rect);
  if (!field?.id || !bounds) {
    traceOverlayInputProxy("invalid field geometry", {
      fieldId: field?.id,
      rect,
    });
    return;
  }

  if (parent.overlayInputProxy && !parent.overlayInputProxy.isDestroyed()) {
    const proxy = parent.overlayInputProxy;
    traceOverlayInputProxy("reusing child", { fieldId: field.id });
    parent.overlayInputProxyFieldId = field.id;
    proxy.overlayInputProxyField = field;
    proxy.overlayInputProxyValue = String(field.value ?? "");
    proxy.hasLoggedFirstTextChange = false;
    positionOverlayInputProxy(parent, field.id, field.rect);
    proxy.webContents.send("overlay-input-proxy:init", field);
    proxy.show();
    proxy.focus();
    return;
  }

  const proxy = new BrowserWindow({
    ...bounds,
    parent,
    frame: false,
    thickFrame: false,
    title: "",
    autoHideMenuBar: true,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    resizable: false,
    movable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  proxy.isAoTextInputProxy = true;
  proxy.setMenu(null);
  proxy.setMenuBarVisibility(false);
  proxy.overlayInputProxyNativeId = nativeWindowId(proxy);
  proxy.overlayInputProxyField = field;
  proxy.overlayInputProxyValue = String(field.value ?? "");
  parent.overlayInputProxy = proxy;
  parent.overlayInputProxyFieldId = field.id;
  proxy.hasLoggedFirstTextChange = false;

  traceOverlayInputProxy("created child", {
    fieldId: field.id,
    bounds,
    overlayWindowId: parent.overlayNativeWindowId,
    proxyWindowId: proxy.overlayInputProxyNativeId,
  });

  proxy.on("focus", () => {
    traceOverlayInputProxy("child focused", { fieldId: parent.overlayInputProxyFieldId });
    keepOverlayAboveInputProxy(parent, proxy);
    traceOverlayInputProxy("overlay raised for input", {
      visible: parent.isVisible(),
      alwaysOnTop: parent.isAlwaysOnTop(),
      bounds: parent.getBounds(),
      overlayWindowId: parent.overlayNativeWindowId,
      proxyWindowId: proxy.overlayInputProxyNativeId,
    });
  });

  proxy.on("blur", () => {
    traceOverlayInputProxy("child blurred", { fieldId: parent.overlayInputProxyFieldId });
    if (parent.overlayInputProxy === proxy) {
      closeOverlayInputProxy(parent, true, "child-blur");
    }
  });

  proxy.on("closed", () => {
    if (parent.overlayInputProxy === proxy) {
      parent.overlayInputProxy = null;
      parent.overlayInputProxyFieldId = null;
      if (!parent.isDestroyed()) {
        parent.webContents.send("overlay-input-proxy:closed", {
          fieldId: field.id,
          commit: true,
        });
      }
    }
  });

  proxy.webContents.once("did-finish-load", () => {
    if (proxy.isDestroyed()) return;
    proxy.show();
    proxy.focus();
    traceOverlayInputProxy("child shown", { fieldId: parent.overlayInputProxyFieldId });
  });

  proxy.loadURL(getAppUrl(null, { inputProxy: true })).catch((error) => {
    console.error("Could not load overlay text input proxy:", error);
    closeOverlayInputProxy(parent, false, "load-failure");
  });
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

  ipcMain.on("overlay-input-proxy:open", (event, field) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    if (
      !parent ||
      parent.isDestroyed() ||
      !parent.isAoOverlay ||
      !parent.overlayInputProxyEnabled
    ) {
      traceOverlayInputProxy("open rejected", {
        hasParent: !!parent,
        isOverlay: !!parent?.isAoOverlay,
        enabled: !!parent?.overlayInputProxyEnabled,
        fieldId: field?.id,
      });
      return;
    }

    traceOverlayInputProxy("open requested", { fieldId: field?.id });
    openOverlayInputProxy(parent, field);
  });

  ipcMain.on("overlay-input-proxy:update", (event, update) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const proxy = parent?.overlayInputProxy;
    if (
      !parent ||
      parent.isDestroyed() ||
      !proxy ||
      proxy.isDestroyed() ||
      update?.id !== parent.overlayInputProxyFieldId
    ) {
      return;
    }

    proxy.webContents.send("overlay-input-proxy:update", update);
  });

  ipcMain.on("overlay-input-proxy:position", (event, position) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    if (
      !parent ||
      parent.isDestroyed() ||
      !parent.isAoOverlay ||
      !parent.overlayInputProxyEnabled ||
      position?.id !== parent.overlayInputProxyFieldId
    ) {
      return;
    }

    positionOverlayInputProxy(parent, position.id, position.rect);
  });

  ipcMain.on("overlay-input-proxy:close", (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    if (
      parent &&
      !parent.isDestroyed() &&
      parent.isAoOverlay &&
      parent.overlayInputProxyEnabled
    ) {
      closeOverlayInputProxy(parent, true, "outside-click");
    }
  });

  ipcMain.on("overlay-input-proxy:change", (event, change) => {
    const proxy = BrowserWindow.fromWebContents(event.sender);
    if (!proxy?.isAoTextInputProxy || proxy.isDestroyed()) return;

    const parent = proxy.getParentWindow();
    if (
      parent &&
      !parent.isDestroyed() &&
      change?.id === parent.overlayInputProxyFieldId
    ) {
      if (
        !proxy.hasLoggedFirstTextChange &&
        String(change.value ?? "") !== proxy.overlayInputProxyValue
      ) {
        proxy.hasLoggedFirstTextChange = true;
        traceOverlayInputProxy("first text change received", {
          fieldId: change.id,
          valueLength: String(change.value ?? "").length,
        });
      }
      proxy.overlayInputProxyValue = String(change.value ?? "");
      parent.webContents.send("overlay-input-proxy:change", change);
    }
  });

  ipcMain.on("overlay-input-proxy:ready", (event) => {
    const proxy = BrowserWindow.fromWebContents(event.sender);
    if (!proxy?.isAoTextInputProxy || proxy.isDestroyed()) return;

    const parent = proxy.getParentWindow();
    if (
      parent &&
      !parent.isDestroyed() &&
      parent.overlayInputProxy === proxy &&
      proxy.overlayInputProxyField
    ) {
      traceOverlayInputProxy("child renderer ready", {
        fieldId: parent.overlayInputProxyFieldId,
      });
      proxy.webContents.send(
        "overlay-input-proxy:init",
        proxy.overlayInputProxyField,
      );
    }
  });

  ipcMain.on("overlay-input-proxy:focused", (event) => {
    const proxy = BrowserWindow.fromWebContents(event.sender);
    if (
      proxy?.isAoTextInputProxy &&
      !proxy.isDestroyed() &&
      proxy.getParentWindow()?.overlayInputProxy === proxy
    ) {
      traceOverlayInputProxy("input focused", {
        fieldId: proxy.getParentWindow().overlayInputProxyFieldId,
      });
    }
  });

  ipcMain.on("overlay-input-proxy:finish", (event, result) => {
    const proxy = BrowserWindow.fromWebContents(event.sender);
    if (!proxy?.isAoTextInputProxy || proxy.isDestroyed()) return;

    const parent = proxy.getParentWindow();
    if (
      parent &&
      !parent.isDestroyed() &&
      result?.id === parent.overlayInputProxyFieldId
    ) {
      closeOverlayInputProxy(parent, result.commit !== false, "enter-or-escape");
    }
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
