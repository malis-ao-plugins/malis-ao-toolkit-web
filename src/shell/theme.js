import { useCallback, useEffect, useState } from "react";

/**
 * What the user is allowed to retune, and how it reaches the UI.
 *
 * The kit is built on custom properties, so a theme is nothing more than a
 * handful of overrides written onto the document root — every component
 * picks them up because none of them carry a literal colour.
 *
 * The fields are grouped by what they visibly do rather than by which token
 * they happen to be, and the options window shows each group next to a live
 * example of the components it drives. A token on its own says nothing:
 * "accent" turns out to mean the border of a button, the underline of the
 * open tab and the fill of a toggle, and there is no way to know that from
 * the word.
 */

export const GROUPS = [
  {
    id: "accent",
    title: "Accent",
    hint: "Anything you can act on, or that is currently on",
  },
  {
    id: "data",
    title: "Data",
    hint: "Numbers the game gave us",
  },
  {
    id: "text",
    title: "Text",
    hint: "Everything that is read rather than pressed",
  },
  {
    id: "items",
    title: "Items",
    hint: "What a modifier gains or costs you",
  },
  {
    id: "surface",
    title: "Surfaces",
    hint: "The window, the panels on it, and the lines between",
  },
];

export const THEME = [
  {
    key: "accent",
    group: "accent",
    token: "--c-accent",
    label: "Accent",
    type: "color",
    value: "#ffb454",
  },
  {
    key: "data",
    group: "data",
    token: "--c-info",
    label: "Data",
    type: "color",
    value: "#56d4e8",
  },
  {
    key: "text",
    group: "text",
    token: "--c-fg",
    label: "Text",
    type: "color",
    value: "#ccd6e0",
  },
  {
    key: "textDim",
    group: "text",
    token: "--c-fg-dim",
    label: "Secondary",
    type: "color",
    value: "#7c8b9c",
  },
  {
    key: "good",
    group: "items",
    token: "--c-good",
    label: "Gain",
    type: "color",
    value: "#8ce99a",
  },
  {
    key: "bad",
    group: "items",
    token: "--c-bad",
    label: "Loss",
    type: "color",
    value: "#ff6b6b",
  },
  {
    key: "window",
    group: "surface",
    token: "--c-bg-1",
    label: "Window",
    type: "color",
    value: "#0c1016",
  },
  {
    key: "panel",
    group: "surface",
    token: "--c-bg-2",
    label: "Panel",
    type: "color",
    value: "#121821",
  },
  {
    key: "edge",
    group: "surface",
    token: "--c-line-hi",
    label: "Edge",
    type: "color",
    value: "#35465a",
  },
  {
    key: "border",
    group: "surface",
    token: "--win-border",
    label: "Edge width",
    type: "px",
    value: 1,
    min: 0,
    max: 4,
  },
];

const KEY = "uiTheme";

export const defaultTheme = () =>
  Object.fromEntries(THEME.map((field) => [field.key, field.value]));

/* ── Colour arithmetic ─────────────────────────────────────────────────────
   Enough to derive the tokens that must follow a chosen one. */

function toRgb(hex) {
  const h = String(hex).replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
}

const toHex = (rgb) =>
  "#" + rgb.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");

/** `amount` of `a`, the rest `b`. */
const mix = (a, b, amount) => {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex(x.map((n, i) => n * amount + y[i] * (1 - amount)));
};

/**
 * Tokens the user does not set, but which have to move when one they do set
 * does.
 *
 * A primary button is accent-coloured text and border over `--c-accent-lo`,
 * a dim wash of the same hue. Leaving that fixed while the accent changed is
 * why retuning the accent looked like it only touched borders: the fill
 * behind them stayed the colour it shipped as.
 */
function derived(theme) {
  const window = theme.window ?? "#0c1016";
  return {
    "--c-accent-lo": mix(theme.accent, window, 0.22),
    "--c-info-lo": mix(theme.data, window, 0.22),
    // The quieter line, between panels rather than around windows.
    "--c-line": mix(theme.edge, window, 0.6),
    // Placeholders and captions: a step past the secondary text, not a
    // separate choice to make.
    "--c-fg-mute": mix(theme.textDim, window, 0.62),
    "--c-fg-hi": mix(theme.text, "#ffffff", 0.45),
  };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (!saved) return defaultTheme();
    // Merged over the defaults, so a theme saved before a field existed
    // still opens rather than leaving that token unset.
    return { ...defaultTheme(), ...saved };
  } catch {
    return defaultTheme();
  }
}

function save(theme) {
  try {
    localStorage.setItem(KEY, JSON.stringify(theme));
  } catch {
    /* private mode — it still applies, it just will not persist */
  }
}

/** Write the overrides onto the document root, where every component sees them. */
export function applyTheme(theme) {
  const root = document.documentElement;

  for (const field of THEME) {
    const value = theme[field.key] ?? field.value;
    root.style.setProperty(
      field.token,
      field.type === "px" ? `${value}px` : value,
    );
  }

  for (const [token, value] of Object.entries(derived(theme))) {
    root.style.setProperty(token, value);
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(load);

  useEffect(() => {
    applyTheme(theme);
    save(theme);
  }, [theme]);

  const set = useCallback(
    (key, value) => setTheme((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const reset = useCallback(() => setTheme(defaultTheme()), []);

  return { theme, set, reset };
}
