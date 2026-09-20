import {
  Section100,
  Section1005,
  Section110,
  Section2003,
  Section2004,
  Section2017,
  Section506,
  Section2009,
  Section2007,
  Section2005,
} from "./ctext";
import {
  Perks,
  Operator,
  EventType,
  ActionType,
  Breed,
  NanoLineSection,
} from "../aoMappings";
import {
  ExpansionFlags,
  StatId,
  FunctionType,
  WeaponSlot,
  ImplantSlot,
  ArmorSlot,
  CanFlags,
  ItemFlags,
  NanoSchool,
} from "./enums";

const dev = process.env.NODE_ENV !== "production";

export function getExpansionFlags(value) {
  return Object.values(ExpansionFlags)
    .filter(({ bit }) => value & bit)
    .map(({ label }) => label);
}

const SLOT_GROUPS = {
  1: Object.values(WeaponSlot),
  2: Object.values(ArmorSlot),
  3: Object.values(ImplantSlot),
};

export function getEquipSlot(itemClass, slot) {
  const group = SLOT_GROUPS[itemClass];
  if (!group) return null;
  return (
    group
      .filter((s) => slot & s.bit)
      .map((s) => s.label)
      .join(", ") || null
  );
}

export function getStatName(id) {
  return StatId[id] ?? `Unknown ${id}`;
}

export function getOperatorLabel(value) {
  return Operator[value] ?? `Unknown ${value}`;
}

export function getProfession(value) {
  return Section2004[value] ?? `Unknown ${value}`;
}

export function getEventType(value) {
  return EventType[value] ?? `Unknown ${value}`;
}

export function getPerkName(value) {
  for (let i = value; i >= value - 9; i--) {
    if (Perks[i] !== undefined) {
      const rank = value - i + 1;
      return `${Perks[i]} ${rank}`;
    }
  }
  return `Unknown ${value}`;
}

export function getMissionBits(stat, value) {
  const key = stat * 1000 + Math.log2(value);
  return Section2017[key] ?? `Unknown (${key})`;
}

export function getStatOperatorValue(stat, operator) {
  if (stat === 0 && operator === 175) return Section110[48324276];
}

export const getHash = (value) => {
  return String.fromCharCode(
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  );
};

// 1. Operator handlers — checked first
const OPERATOR_HANDLERS = {
  93: (row) => ({
    label: `${Section100[226935915]} `,
    value: getPerkName(row.value),
  }),
  101: (row) => ({
    label: `${stripP(Section1005[247645193])} `,
    value: row.value,
    resolveItemName: true,
  }),
  102: (row) => ({
    label: `${stripP(Section1005[247645193]).replace(":", "")} `,
    value: Section2009[row.value],
  }),
  117: (row) => ({ label: Section110[48324276], value: getHash(row.value) }),
  127: (row) => ({
    label: `${stripP(Section1005[109081314]).replace(":", "")} `,
    value: row.value,
    resolveItemName: true,
  }),
};

const RANGE_OPERATORS = new Set([31, 32, 33, 34, 35, 36]);

/**
 * The operators that are structure rather than data.
 *
 * Requirements arrive as a postfix stream: operands, then the operator that
 * combines the two most recent ones. These three are that grammar.
 */
const OP_OR = 3;
const OP_AND = 4;
const OP_NOT = 42;

/** Operators that switch whose requirement the following rows describe. */
const SOURCE_OPS = new Set([16, 18, 19, 21, 26, 27, 28, 29, 30]);

const DEFAULT_SOURCE = "On Self";

// 2. Stat handlers — checked second
const STAT_HANDLERS = {
  [StatId.Profession]: (row) => ({
    label: "Profession",
    value: getProfession(row.value),
  }),
  [StatId.Expansion]: (row, prefix) => ({
    label: `${prefix}${stripP(Section1005[146655790])}`,
    value: getExpansionFlags(row.value).join(", "),
  }),
  [StatId.Breed]: (row, prefix) => ({
    label: "",
    value: `${prefix}${Breed[row.value]}`,
  }),
  [StatId.VisualProfession]: (row, prefix) => ({
    label: `${prefix}${Section1005[122566574].replace(":", "")}`,
    value: getProfession(row.value),
  }),
  [StatId.NanoFocusLevel]: () => ({
    label: "",
    value: Section1005[511].replace(".", ""),
  }),
  [StatId.Specialization]: (row) => ({
    label: "Specialization",
    value: getSpecialization(row.value).replace(".", ""),
  }),
  [StatId.MonsterData]: (row) => ({ label: "Form", value: row.value }),
  [StatId.SelectedTargetType]: (row, prefix) => ({
    label: "",
    value: `Target ${prefix.toLowerCase()} ${Section2007[row.value]}`,
  }),
  [StatId.NumFightingOpponents]: () => ({
    label: "",
    value: Section1005[179552215].replace(".", ""),
  }),
  [StatId.WaitState]: (row) => ({
    label: "",
    value:
      row.value === 2
        ? Section1005[239200100].replace(".", "")
        : "Must be standing",
  }),
  [StatId.ExpansionPlayfield]: (row) => ({
    label: "",
    value:
      row.value === 0
        ? Section1005[267085425].replace(".", "")
        : Section1005[114151651].replace(".", ""),
  }),
  [StatId.NPCFamily]: (row) => ({
    label: "",
    value: `Must not be a ${PetType[row.value] ?? row.value}`,
  }),
  [StatId.Side]: (row) => ({
    label: "Faction",
    value: `${getOperatorLabel(row.operator)} ${Section2005[row.value]}`,
  }),
};

const MISSION_BIT_STATS = new Set([65, 257, 686]);

const stripP = (str) => str.replace("%s", "").replace(".", "");

export const formatReqValue = (op, val) => {
  if (op === 2) return val + 1;
  // if (op === 1) return val - 1;
  return val;
};

export const formatReq = (row) => {
  const prefix = row.operator === 107 ? "Not " : "";

  if (OPERATOR_HANDLERS[row.operator])
    return OPERATOR_HANDLERS[row.operator](row);

  if (RANGE_OPERATORS.has(row.operator))
    return {
      label: getOperatorLabel(row.operator),
      value: row.value,
      resolveItemName: true,
    };

  if (MISSION_BIT_STATS.has(row.stat))
    return {
      label: `${prefix}${stripP(Section1005[86152078])}`,
      value: getMissionBits(row.stat, row.value),
    };

  if (row.stat === StatId.CharState && row.value === 10)
    return {
      label: "",
      value: stripP(Section1005[240038980]),
    };

  if (STAT_HANDLERS[row.stat]) return STAT_HANDLERS[row.stat](row, prefix);

  const skillName = Section2003[row.stat] ?? `Stat ${row.stat}`;
  return {
    label: skillName,
    value: `${getOperatorLabel(row.operator)} ${formatReqValue(row.operator, row.value)}`,
  };
};

const PetType = {
  0: "Player",
  94: "Charmed pet",
  95: "Attack pet",
  96: "Heal pet",
  97: "Attack pet",
  98: "Mezz pet",
};

const SOURCE_OP_LABELS = {
  16: "On User",
  18: "On Target",
  19: "On Self",
  21: "On Secondary Item",
  26: "On User",
  27: "On Valid Target",
  28: "On Invalid Target",
  29: "On Valid User",
  30: "On Invalid User",
};

/**
 * Reduce a postfix requirement stream to a flat list of rows and connectors.
 *
 * A well-formed stream leaves exactly one group on the stack. A malformed one
 * — a connector with nothing to connect, or operands that never get combined
 * — used to have everything but the first group silently dropped, so a
 * tooltip quietly showed fewer requirements than the item has. Whatever is
 * left is now concatenated in order, and the imbalance is reported in
 * development.
 */
function reduceRequirements(rows, where) {
  const stack = [];

  for (const row of rows) {
    if (row.operator === OP_AND || row.operator === OP_OR) {
      if (stack.length < 2) continue;
      const b = stack.pop();
      const a = stack.pop();
      stack.push([
        ...a,
        { connector: row.operator === OP_AND ? "and" : "or" },
        ...b,
      ]);
    } else if (row.operator === OP_NOT) {
      if (stack.length < 1) continue;
      const a = stack.pop();
      stack.push([{ ...a[0], negated: true }, ...a.slice(1)]);
    } else {
      const req = formatReq(row);
      if (req) stack.push([req]);
    }
  }

  if (dev && stack.length > 1) {
    console.warn(
      `[formatter] ${where}: ${stack.length} requirement groups did not ` +
        `combine into one; showing all of them in order.`,
    );
  }

  return stack.flat();
}

export const formatReqs = (rows) => {
  const byAction = {};
  for (const row of rows) {
    const at = row.outer_action_type ?? 0;
    if (!byAction[at]) byAction[at] = [];
    byAction[at].push(row);
  }

  const result = {};

  for (const [at, actionRows] of Object.entries(byAction)) {
    // Split rows into source buckets, tracking context switches
    const bySource = {};
    let currentSource = DEFAULT_SOURCE;

    for (const row of actionRows) {
      const sourceLabel = SOURCE_OP_LABELS[row.operator];
      if (sourceLabel !== undefined) {
        currentSource = sourceLabel;
        continue;
      }
      if (!bySource[currentSource]) bySource[currentSource] = [];
      bySource[currentSource].push(row);
    }

    // Each source bucket is its own expression.
    const bySourceResult = {};
    for (const [source, sourceRows] of Object.entries(bySource)) {
      const reqs = reduceRequirements(sourceRows, `action ${at}, ${source}`);
      if (reqs.length > 0) bySourceResult[source] = reqs;
    }

    if (Object.keys(bySourceResult).length === 0) continue;
    result[ActionType[at] ?? `Action ${at}`] = bySourceResult;
  }

  return result;
};

export const formatCriteriaGroup = (criteriaRows) =>
  reduceRequirements(
    criteriaRows.filter((row) => !SOURCE_OPS.has(row.operator)),
    "modifier criteria",
  );

/**
 * Named parameter slots.
 *
 * A modifier arrives as a bag of numbered operator slots whose meaning
 * depends on the function type, which is why each formatter still reads the
 * bag directly — but the recurring ones are worth a name.
 */
const PARAM = {
  stat: 0,
  from: 2,
  hits: 3,
  delay: 4,
  criteria: 26,
  target: 32,
  to: 37,
  value: 39,
  bodyPart: 56,
  texture: 57,
  text: 65,
  mesh: 76,
  nano: 88,
};

/** A stat modifier reads "+12"; the sign is explicit for a gain. */
const signed = (value) => `${value >= 0 ? "+" : ""}${value}`;

function modifyStat(p) {
  const statId = p[PARAM.stat];
  const value = p[PARAM.value];
  if (statId == null || value == null) return null;
  return { label: Section2003[statId], value: signed(value) };
}

/**
 * Damage and healing share one function type: the sign of the low end says
 * which it is, and a `to` of zero means the figure is a percentage rather
 * than a range.
 */
function hit(p) {
  const from = p[PARAM.from];
  const to = p[PARAM.to];
  const hits = p[PARAM.hits];
  const delay = p[PARAM.delay] / 100;

  const suffix = [];
  if (hits > 1) suffix.push(`${hits} hits`);
  if (delay > 0) suffix.push(`${delay}s delay`);

  let value;
  if (to === 0) value = `${Math.abs(from)}%`;
  else if (from === to) value = `${Math.abs(from)}`;
  else value = `${Math.abs(from)} - ${Math.abs(to)}`;

  return {
    label: from > 0 ? "Healing" : "Damage",
    value,
    negative: from < 0,
    suffix: suffix.join(", ") || undefined,
  };
}

/**
 * One formatter per function type.
 *
 * Each returns only the parts of the line particular to it; the parts every
 * line shares — the criteria that gate it, the target it applies to — are
 * attached once, below. Returning null means "renders nothing", which is a
 * deliberate answer and distinct from having no formatter at all: the types
 * that swap a mesh or add a hidden skill are listed so they stay quiet
 * rather than being reported as unmapped.
 */
const MOD_FORMATTERS = {
  [FunctionType.ModifyStat]: modifyStat,
  [FunctionType.ModifyNanoStat]: modifyStat,
  [FunctionType.Hit]: hit,

  [FunctionType.Texture]: (p) => ({
    label: `${getTextureBodyPart(p[PARAM.bodyPart])} Texture`,
    value: p[PARAM.texture],
  }),

  [FunctionType.ChangeBodyMesh]: (p) => ({
    label: "Change body mesh",
    value: p[PARAM.mesh]?.[0],
  }),

  [FunctionType.SystemText]: (p) => ({
    label: "System text",
    value: p[PARAM.text]?.[0],
  }),

  [FunctionType.LockSkill]: (p) => ({
    label: `${Section2003[p[PARAM.stat]]} locked for`,
    value: "",
    suffix: `${p[PARAM.value]}s`,
  }),

  [FunctionType.UploadNano]: (p) => ({
    label: "Upload",
    value: p[PARAM.value],
    resolveItemName: true,
    isNano: true,
    noColor: true,
  }),

  [FunctionType.CastNano]: (p) => ({
    label: "Cast",
    value: p[PARAM.value],
    resolveItemName: true,
    isNano: true,
  }),

  [FunctionType.CastChance]: (p) => ({
    label: `Cast chance (${p[PARAM.value]}%)`,
    value: p[PARAM.nano],
    resolveItemName: true,
    isNano: true,
    noColor: true,
  }),

  [FunctionType.TeamCastNano]: (p) => ({
    label: "Team cast",
    value: p[PARAM.nano],
    resolveItemName: true,
    isNano: true,
  }),

  [FunctionType.AreaCastNano]: (p) => ({
    label: "AOE",
    value: p[PARAM.nano],
    resolveItemName: true,
    isNano: true,
  }),

  [FunctionType.SetFlag]: (p) => ({
    label: getSetFlag(p[PARAM.stat]),
    value: getZoneFlagValue(p[PARAM.value]),
  }),

  [FunctionType.HeadMesh]: () => null,
  [FunctionType.AddSkill]: () => null,
  [FunctionType.GfxEffect]: () => null,
};

export const formatMod = (action) => {
  const p = action.params;
  const format = MOD_FORMATTERS[action.function_type];

  if (!format) {
    reportUnmapped(action.function_type);
    return null;
  }

  const line = format(p);
  if (!line) return null;

  const targetId = p[PARAM.target];
  return {
    ...line,
    criteria: p[PARAM.criteria]?.length
      ? formatCriteriaGroup(p[PARAM.criteria])
      : [],
    target: Section506[targetId],
    targetId,
  };
};

const unmapped = new Set();

/**
 * A function type with no formatter renders nothing at all, which is silent
 * and easy to miss. Say so once per type, in development only — this was a
 * bare log on every modifier of every item hovered.
 */
function reportUnmapped(ft) {
  if (!dev || unmapped.has(ft)) return;
  unmapped.add(ft);
  console.warn(`[formatter] no formatter for function type ${ft}`);
}

export const formatMods = (rawMods, rawModCriteria, rawModText) => {
  rawMods = rawMods ?? [];
  rawModCriteria = rawModCriteria ?? [];
  rawModText = rawModText ?? [];

  const byEvent = {};

  for (const row of rawMods) {
    const et = row.event_type;
    const ft = row.function_type;
    const li = row.list_index;

    if (!byEvent[et]) byEvent[et] = {};
    if (!byEvent[et][ft]) byEvent[et][ft] = {};
    if (!byEvent[et][ft][li])
      byEvent[et][ft][li] = { function_type: ft, params: {} };

    const p = byEvent[et][ft][li].params;

    if (row.value_type === "num" || row.value_type === "null") {
      p[row.operator] = row.value;
    } else if (row.value_type === "criteria") {
      p[row.operator] = rawModCriteria
        .filter(
          (c) =>
            c.event_type === row.event_type &&
            c.function_type === row.function_type &&
            c.list_index === row.list_index &&
            c.op_index === row.op_index,
        )
        .sort((a, b) => a.crit_index - b.crit_index);
    } else if (row.value_type === "text") {
      p[row.operator] = rawModText
        .filter(
          (t) =>
            t.event_type === row.event_type &&
            t.function_type === row.function_type &&
            t.list_index === row.list_index &&
            t.op_index === row.op_index,
        )
        .sort((a, b) => a.sort_index - b.sort_index)
        .map((t) => t.value);
    }
  }

  const mods = {};

  for (const [et, byFunc] of Object.entries(byEvent)) {
    const etLabel = EventType[et] ?? `Event ${et}`;
    const lines = Object.values(byFunc)
      .flatMap((byLi) => Object.values(byLi))
      .map(formatMod)
      .filter(Boolean);

    if (lines.length === 0) continue;

    const byTarget = {};
    for (const line of lines) {
      const t = line.target ?? "Unknown";
      if (!byTarget[t])
        byTarget[t] = { targetId: line.targetId ?? 999, lines: [] };
      byTarget[t].lines.push(line);
    }

    const sortedTarget = {};
    Object.entries(byTarget)
      .sort(([, a], [, b]) => a.targetId - b.targetId)
      .forEach(([label, { lines }]) => {
        sortedTarget[label] = lines;
      });

    mods[etLabel] = sortedTarget;
  }

  return mods;
};

const COMBAT = "Combat";

/** Attack and defence skill contributions, by the code the service uses. */
const SKILL_CHECKS = [
  { check: 0xc, label: "Attack skills" },
  { check: 0xd, label: "Defence skills" },
];

/** A stat id rendered through Section2003, or the raw id if it has no name. */
const statName = (id) => Section2003[id] ?? `Stat ${id}`;

/** Durations arrive in hundredths of a second. */
const asSeconds = (v) => (v / 100).toFixed(2) + "s";

/** An item carrying both a strain and a school is a nano program. */
const isNanoProgram = (sv) =>
  sv(StatId.NanoStrain) != null && sv(StatId.School) != null;

/** Render through `fn` only when the stat is there at all. */
const present = (id, fn) => (sv) => (sv(id) == null ? null : fn(sv(id), sv));

/**
 * Every row a tooltip can show, in the order it shows them.
 *
 * Each row reads what it needs through `sv` and answers null when it does
 * not apply, so this table is the whole of the layout: read it top to bottom
 * and that is the tooltip. A row is dropped only for null or an empty
 * string — never for a falsy number, because zero is a real value for a cap,
 * a cost or a chance.
 *
 * Deliberately not shown: the raw flag and "can" bitfields (the flags are
 * returned separately and the tooltip renders the interesting ones as
 * badges), and the icon ids.
 */
const STAT_ROWS = [
  {
    label: (sv) => (isNanoProgram(sv) ? "NCU" : "QL"),
    value: (sv) => sv(StatId.Level),
  },
  {
    label: "Slot",
    value: (sv) => getEquipSlot(sv(StatId.ItemClass), sv(StatId.Slot)),
  },
  { label: "Value", value: (sv) => sv(StatId.Value) },
  { label: "Equip delay", value: present(StatId.EquipDelay, asSeconds) },
  { label: "Nanocost", value: (sv) => sv(StatId.NanoPoints) },
  {
    label: "School",
    value: (sv) =>
      isNanoProgram(sv)
        ? `${getNanoSchool(sv(StatId.School))}:  ${getNanoStrain(sv(StatId.NanoStrain))}`
        : null,
  },
  { label: "Stacking order", value: (sv) => sv(StatId.StackingOrder) },

  {
    section: COMBAT,
    label: "Damage",
    value: present(
      StatId.MinDamage,
      (min, sv) =>
        `${min}–${sv(StatId.MaxDamage)}(${sv(StatId.CriticalBonus)})`,
    ),
  },
  {
    section: COMBAT,
    label: "Duration",
    value: present(StatId.TimeExist, (v) => formatDuration(v)),
  },
  {
    section: COMBAT,
    label: "Attack",
    value: present(StatId.AttackDelay, asSeconds),
  },
  {
    section: COMBAT,
    label: "Attack speed",
    value: present(StatId.AttackSpeed, asSeconds),
  },
  {
    section: COMBAT,
    label: "Recharge",
    value: present(StatId.RechargeDelay, asSeconds),
  },
  {
    section: COMBAT,
    label: "Range",
    value: present(StatId.AttackRange, (v) => `${v}m`),
  },
  {
    section: COMBAT,
    label: "Specials",
    value: (sv) => getSpecials(sv(StatId.Can) ?? 0).join(", "),
  },
  {
    section: COMBAT,
    label: "Initiative",
    value: present(StatId.InitiativeType, statName),
  },
  {
    // `??` binds looser than `!=`, so the old condition here read as
    // `sv(AMSCap) ?? (sv(SISCap) != null)`, and a cap of exactly 0 — falsy —
    // dropped the row entirely.
    section: COMBAT,
    label: "Max beneficial skill",
    value: (sv) => sv(StatId.AMSCap) ?? sv(StatId.SISCap),
  },
  {
    section: COMBAT,
    label: "Attack skill",
    value: present(StatId.ItemSkill, statName),
  },
  { section: COMBAT, label: "Dual wield", value: (sv) => sv(StatId.MultiMelee) },
  {
    section: COMBAT,
    label: "Combined (MA)",
    value: (sv) => sv(StatId.MartialArtist),
  },
  {
    section: COMBAT,
    label: "Damage type",
    value: present(StatId.DamageType2, statName),
  },
  {
    section: COMBAT,
    label: "Chance of break on attack",
    value: (sv) => sv(StatId.ChanceOfUse),
  },
  {
    section: COMBAT,
    label: "Chance of break on nano",
    value: (sv) => sv(StatId.ChanceOfBreakOnSpellAttack),
  },
  {
    section: COMBAT,
    label: "Chance of break on debuff",
    value: (sv) => sv(StatId.ChanceOfBreakOnDebuff),
  },

  ...SKILL_CHECKS.map(({ check, label }) => ({
    section: COMBAT,
    label,
    value: (sv, checks) =>
      checks
        .filter((r) => r.skill_check === check)
        .map((r) => `${statName(r.stat_id)} ${r.value}%`)
        .join(" & "),
  })),
];

/**
 * The stat block of a tooltip: rows in display order, each optionally in a
 * section, plus the item's flags for the badges.
 *
 * This was 160 lines of `if (sv(X) != null) stats.push({ … })`, so the order
 * of a tooltip was something you reconstructed by reading all of it. The
 * order is now STAT_ROWS, and this is only the driver.
 */
export const formatStats = (rawStats, rawSkillChecks = []) => {
  const sv = (id) => rawStats.find((s) => s.stat_id === id)?.value ?? null;

  const stats = [];
  for (const row of STAT_ROWS) {
    const value = row.value(sv, rawSkillChecks);
    if (value == null || value === "") continue;

    const label = typeof row.label === "function" ? row.label(sv) : row.label;
    stats.push(
      row.section ? { label, value, section: row.section } : { label, value },
    );
  }

  return { stats, flags: getFlags(sv(StatId.Flags) ?? 0) };
};

export const formatDuration = (ticks) => {
  const totalSeconds = Math.floor(ticks / 100);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return (
    [h > 0 ? `${h}hr` : null, m > 0 ? `${m}m` : null, s > 0 ? `${s}s` : null]
      .filter(Boolean)
      .join(" ") || "0s"
  );
};

export function getFlags(value) {
  return Object.values(ItemFlags)
    .filter((flag) => value & flag.bit)
    .map((flag) => flag.label);
}

const SPECIAL_CAN_FLAGS = [
  CanFlags.Burst,
  CanFlags.FlingShot,
  CanFlags.FullAuto,
  CanFlags.AimedShot,
  CanFlags.SneakAttack,
  CanFlags.FastAttack,
  CanFlags.Brawl,
  CanFlags.Dimach,
];

export function getSpecials(value) {
  return SPECIAL_CAN_FLAGS.filter(
    (flag) => ((value >>> 0) & (flag.bit >>> 0)) !== 0,
  ).map((flag) => flag.label);
}

export function getCans(value) {
  return Object.values(CanFlags)
    .filter((flag) => ((value >>> 0) & (flag.bit >>> 0)) !== 0)
    .map((flag) => flag.label);
}

export function getNanoStrain(value) {
  return NanoLineSection[value];
}

export function getNanoSchool(value) {
  return Object.keys(NanoSchool).find((k) => NanoSchool[k] === value);
}

export function getSetFlag(value) {
  if (value === 467) return "SL zone protection";
}

export function getZoneFlagValue(value) {
  if (value === 0) return "Adonis Abyss";
  if (value === 1) return "Penumbra";
  if (value === 2) return "Inferno";
  if (value === 3) return "Pandemonium";

  return "SL zone protection";
}

function getTextureBodyPart(value) {
  if (value === 0) return "Hands";
  if (value === 1) return "Body";
  if (value === 2) return "Feet";
  if (value === 3) return "Arms";
  if (value === 4) return "Legs";
}

export function getSpecialization(value) {
  if (value === 1) return Section1005[104594638];
  if (value === 2) return Section1005[103152846];
  if (value === 4) return Section1005[102366414];
  if (value === 8) return Section1005[101432526];
}
