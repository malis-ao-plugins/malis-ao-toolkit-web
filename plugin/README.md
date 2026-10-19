# Toolkit page library

A small library the toolkit plugins share. It serves the built web page on
`http://localhost:7067` while any of them is injected, so users need no npm or
Electron.

`www/` is the production build of this repo, built into the DLL. Update it
with `npm run plugins` from the repo root and commit the result; plugins are
installed by cloning and compiling, so the page they serve is whatever is
committed here.

A plugin uses it by adding
`https://github.com/malis-ao-plugins/malis-ao-toolkit-web/plugin/MalisToolkitPage.csproj`
to `dependencies` in its `manifest.json`, then calling `Start()` in `Run` and
`Stop()` in `Teardown`. Every plugin that does so tries for the port; the first
one gets it and the rest retry, so the page stays up while any of them is
loaded.
