import { useCallback, useEffect, useState } from "react";

/**
 * What the user is allowed to retune, and how it reaches the UI.
 *
 * The kit is built on custom properties, so a theme is nothing more than a
 * handful of overrides written onto the document root — every component
 * picks them up because none of them carry a literal colour.
 *
 * Only tokens worth a choice are here. The surfaces step 0..4 from near
 * black to raised, and letting each be set separately is how a palette ends
 * up with no contrast left; the two that matter are the window behind
 * everything and the panels on it.
 */
export const THEME = [
  {
    key: "accent",
    token: "--c-accent",
    label: "Accent",
    hint: "Anything you can act on, or that is currently active",
    type: "color",
    value: "#ffb454",
  },
  {
    key: "data",
    token: "--c-info",
    label: "Data",
    hint: "Numbers the game gave us",
    type: "color",
    value: "#56d4e8",
  },
  {
    key: "window",
    token: "--c-bg-1",
    label: "Window",
    hint: "The surface behind the panels",
    type: "color",
    value: "#0c1016",
  },
  {
    key: "panel",
    token: "--c-bg-2",
    label: "Panel",
    hint: "The panels themselves",
    type: "color",
    value: "#121821",
  },
  {
    key: "edge",
    token: "--c-line-hi",
    label: "Edge",
    hint: "The line around a window",
    type: "color",
    value: "#35465a",
  },
  {
    key: "border",
    token: "--win-border",
    label: "Edge width",
    hint: "How heavy that line is",
    type: "px",
    value: 1,
    min: 0,
    max: 4,
  },
];

const KEY = "uiTheme";

export const defaultTheme = () =>
  Object.fromEntries(THEME.map((field) => [field.key, field.value]));

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
