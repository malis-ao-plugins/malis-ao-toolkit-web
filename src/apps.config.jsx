/**
 * App registry — built by discovery, not by hand.
 *
 * Any `config.jsx` one level under src/apps/ is picked up automatically, so
 * adding an app is: create the folder, write the config, done. Nothing to
 * remember to register, and no merge conflicts in a shared list.
 *
 * Folders starting with `_` are skipped, so a scaffold can sit in the tree
 * without mounting itself.
 */

const modules = require.context("./apps", true, /^\.\/[^_][^/]*\/config\.jsx$/);

export const APP_CONFIGS = modules
  .keys()
  .map((path) => {
    const config = modules(path).default;
    if (!config?.port) {
      console.error(`[apps] ${path} does not default-export an app config.`);
      return null;
    }
    return config;
  })
  .filter(Boolean)
  .sort((a, b) => a.port - b.port);

if (process.env.NODE_ENV !== "production") {
  const seen = new Map();
  for (const app of APP_CONFIGS) {
    if (seen.has(app.port)) {
      console.error(
        `[apps] ${app.label} and ${seen.get(app.port)} both claim port ${app.port}.`,
      );
    }
    seen.set(app.port, app.label);
  }
}
