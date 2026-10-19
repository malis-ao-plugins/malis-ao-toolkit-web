/**
 * Copies the production build into plugin/www, the page the plugin library
 * serves on http://localhost:7067 from inside the game. Run it through
 * `npm run plugins`, which builds first.
 *
 * Plugins are installed by cloning and compiling, so plugin/www has to be
 * committed for users to get the page. CI does this on every push to the
 * page's source.
 */

const fs = require("fs");
const path = require("path");

const build = path.resolve(__dirname, "..", "build");
const target = path.resolve(__dirname, "..", "plugin");

if (!fs.existsSync(path.join(build, "index.html"))) {
  console.error("No build found. Run `npm run plugins`, not this script on its own.");
  process.exit(1);
}

if (!fs.existsSync(target)) {
  console.error(`plugin folder not found at ${target}`);
  process.exit(1);
}

const www = path.join(target, "www");
fs.rmSync(www, { recursive: true, force: true });
fs.cpSync(build, www, {
  recursive: true,
  filter: (src) => !src.endsWith(".map"),
});
console.log(`copied to ${www}`);
