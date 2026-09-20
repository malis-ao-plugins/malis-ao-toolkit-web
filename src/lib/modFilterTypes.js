/**
 * User-facing modifier filter types.
 *
 * Each entry defines what the user sees and what the server query should expand to.
 * The `functionTypes` array is what gets sent to the server — it maps one semantic
 * concept to one or more raw FunctionType values so the user never has to think
 * about internal variants like ModifyNanoStat or TeamCastNano.
 *
 * needsStatPicker  — requires a second step where the user picks a stat from Section2003
 * hasRange         — show min/max inputs on the filter row
 */
export const MOD_FILTER_TYPES = [
  {
    id: "stat",
    label: "Stat modifier",
    hint: "Modifies skill",
    functionTypes: ["ModifyStat", "ModifyNanoStat"],
    needsStatPicker: true,
    hasRange: true,
  },
  {
    id: "cast",
    label: "Casts nano",
    hint: "Procs or executes a nano program",
    functionTypes: ["CastNano", "TeamCastNano", "AreaCastNano"],
    needsStatPicker: false,
    hasRange: true,
  },
  {
    id: "upload",
    label: "Uploads nano",
    hint: "Teaches a nano program",
    functionTypes: ["UploadNano"],
    needsStatPicker: false,
    hasRange: true,
  },
  {
    id: "hit",
    label: "Damage / Healing",
    hint: "Deals damage (negative values) or heals (positive values)",
    functionTypes: ["Hit"],
    needsStatPicker: false,
    hasRange: true,
  },
  {
    id: "lock",
    label: "Locks skill",
    hint: "Temporarily disables a skill after use",
    functionTypes: ["LockSkill"],
    needsStatPicker: true,
    hasRange: true,
  },
];

export const MOD_TYPE_BY_ID = Object.fromEntries(
  MOD_FILTER_TYPES.map((t) => [t.id, t]),
);
