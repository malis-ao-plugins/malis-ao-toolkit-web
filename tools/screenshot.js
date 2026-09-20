/* ============================================================================
   Render the running app to a PNG, so a change can be looked at rather than
   reasoned about.

   Electron is already a dev dependency, so this needs nothing new. It reads
   its settings from tools/screenshot.json rather than from the command line:
   Electron consumes stray argv entries itself, and a URL passed that way
   makes it exit without running the script at all.

     node tools/mock-backends.js          # or have the real plugins up
     npm start
     npm run shot

   screenshot.json:
     url          what to load
     out          PNG filename, written next to this file
     width/height window size
     wait         ms to wait after load, for sockets and atlases
     script       optional JS file in tools/, run in the page before capture;
                  its return value is logged. Use it to set up state — see
                  screenshot-setup.js, which places the windows and reloads.
     afterScript  ms to wait after that script
     keys         optional list of keys to press before capturing, as real
                  input events rather than synthetic ones — which is the only
                  way to reach :focus-visible, since the browser only counts
                  genuine keyboard interaction
     probe        optional JS file run after the keys, for measuring; its
                  return value is logged
     show         true to open a real, focused window — needed for anything
                  that depends on focus; the default captures offscreen
   ========================================================================= */

const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const DIR = __dirname;
const LOG = path.join(DIR, "screenshot.log");
const say = (m) => {
  try {
    fs.appendFileSync(LOG, m + "\n");
  } catch {}
};

fs.writeFileSync(LOG, "");

const cfg = JSON.parse(
  fs.readFileSync(path.join(DIR, "screenshot.json"), "utf8"),
);
say("config " + JSON.stringify(cfg));

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: cfg.width || 1280,
      height: cfg.height || 880,
      // :focus-visible only engages in a window the OS considers focused, so
      // anything checking focus has to ask for a real one.
      show: cfg.show === true,
      paintWhenInitiallyHidden: true,
      backgroundColor: "#000000",
    });

    win.webContents.on("did-fail-load", (_e, code, desc) =>
      say(`did-fail-load ${code} ${desc}`),
    );

    await win.loadURL(cfg.url);
    if (cfg.show === true) win.focus();
    say("loaded " + cfg.url);

    await new Promise((r) => setTimeout(r, cfg.wait ?? 7000));

    if (cfg.script) {
      const result = await win.webContents.executeJavaScript(
        fs.readFileSync(path.join(DIR, cfg.script), "utf8"),
        true,
      );
      say("script -> " + JSON.stringify(result));
      await new Promise((r) => setTimeout(r, cfg.afterScript ?? 1500));
    }

    for (const key of cfg.keys ?? []) {
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: key });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: key });
      await new Promise((r) => setTimeout(r, 120));
    }
    if (cfg.keys?.length) say("pressed " + cfg.keys.join(" "));

    if (cfg.probe) {
      const result = await win.webContents.executeJavaScript(
        fs.readFileSync(path.join(DIR, cfg.probe), "utf8"),
        true,
      );
      say("probe -> " + JSON.stringify(result));
    }

    const image = await win.capturePage();
    say("captured " + JSON.stringify(image.getSize()));

    fs.writeFileSync(path.join(DIR, cfg.out), image.toPNG());
    say("wrote " + cfg.out);
  } catch (e) {
    say("ERROR " + (e && e.stack));
  } finally {
    app.quit();
  }
});
