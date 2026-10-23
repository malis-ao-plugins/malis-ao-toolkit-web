/**
 * Roller-specific definitions.
 *
 * Each entry carries its own settings key. The previous version kept the keys
 * in a separate array and matched them to the labels by index, which silently
 * mis-assigned every slider the moment one was inserted.
 */

/** The seven mission sliders the client exposes, in client order. */
export const SLIDERS = [
  { key: "easyHard", left: "EASY", right: "HARD", min: 1, max: 11 },
  { key: "goodBad", left: "GOOD", right: "EVIL", min: -100, max: 100 },
  { key: "orderChaos", left: "ORDR", right: "CHAO", min: -100, max: 100 },
  { key: "openHidden", left: "OPEN", right: "HIDN", min: -100, max: 100 },
  { key: "physicalMystical", left: "PHYS", right: "MYST", min: -100, max: 100 },
  { key: "headonStealth", left: "HEAD", right: "STLH", min: -100, max: 100 },
  { key: "creditsXp", left: "CRED", right: "XP", min: -100, max: 100 },
];

/** Time between terminal requests, in ms. The plugin clamps to the same range. */
export const ROLL_INTERVAL = { min: 500, max: 10000, step: 100, default: 1500 };

/** Mission kinds the roller will accept. */
export const MISSION_TYPES = [
  { key: "returnItem", label: "Return Item" },
  { key: "killTarget", label: "Kill Target" },
  { key: "useItem", label: "Use Item" },
  { key: "findItem", label: "Find Item" },
];

/** Behaviour flags. */
export const BEHAVIOURS = [
  { key: "autoAdjustLvlSlider", label: "Auto Slider", hint: "Track level with the easy/hard slider" },
  { key: "removeRolledEntries", label: "Remove On Hit", hint: "Drop an entry from the roll list once it lands" },
  { key: "autoAcceptMissions", label: "Auto Accept", hint: "Accept a mission as soon as it matches" },
];

/** Compact number for a 320px column. The exact value goes in a title. */
export function compact(n) {
  if (n == null || Number.isNaN(n)) return "-";
  const abs = Math.abs(n);
  if (abs < 10000) return n.toLocaleString();
  if (abs < 1e6) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return (n / 1e6).toFixed(2).replace(/\.00$/, "") + "M";
}

export function exact(n) {
  return n == null ? "" : n.toLocaleString();
}

/** Stable identity for a roll-list entry. */
export function entryKey(e) {
  return `${e.ids?.join("-") ?? ""}@${e.ql}`;
}
