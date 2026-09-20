import { useState, useRef, useCallback } from "react";
import {
  getItemStats,
  getItemModifiers,
  getItemModifierCriteria,
  getItemModifierText,
  getItemRequirements,
  getItemSkillChecks,
  findBracketingTemplates,
} from "../lib/db";
import { membersOf, namesOf } from "../lib/itemCache";
import { formatMods, formatReqs, formatStats } from "../lib/formatter";
import {
  interpolateMods,
  interpolateReqs,
  interpolateStats,
} from "../lib/interpolate";

/**
 * Built tooltips and raw stat tuples, shared by every row.
 *
 * These were per-hook, and ItemRow mounts one hook per row — so hovering the
 * same item in two rows fetched and rebuilt everything twice, and moving the
 * mouse back to a row you had already hovered started again from nothing.
 * An item's stats do not change while the app is running, so a module-level
 * cache is the right lifetime. Raw tuples are stored as promises, so two
 * rows hovering at once make one request rather than two.
 */
const tooltips = new Map(); // low_id -> built tooltip
const rawById = new Map(); // template id -> Promise<raw tuple>

const RAW_FETCHERS = [
  getItemStats,
  getItemModifiers,
  getItemModifierCriteria,
  getItemModifierText,
  getItemRequirements,
  getItemSkillChecks,
];

/** Everything the formatter needs about one template, fetched once. */
function fetchMemberRaw(id) {
  const hit = rawById.get(id);
  if (hit) return hit;

  const request = Promise.all(RAW_FETCHERS.map((fetch) => fetch(id))).catch(
    (err) => {
      rawById.delete(id);
      throw err;
    },
  );

  rawById.set(id, request);
  return request;
}

/** Only for tests — nothing in the app has a reason to forget. */
export function clearTooltipCache() {
  tooltips.clear();
  rawById.clear();
}

function flattenNestedEntries(obj) {
  return Object.values(obj).flatMap((group) =>
    Object.values(group).flatMap((entries) => entries),
  );
}

function getNanoOrder(mods) {
  return flattenNestedEntries(mods)
    .filter((m) => m.isNano && m.itemId != null)
    .map((m) => ({ itemId: m.itemId, name: m.value }));
}

async function buildTooltipCore(
  rawStats,
  rawMods,
  rawModCriteria,
  rawModText,
  rawReqs,
  rawSkillChecks = [],
) {
  const mods = formatMods(rawMods, rawModCriteria, rawModText);
  const reqs = formatReqs(rawReqs);
  const { stats, flags } = formatStats(rawStats, rawSkillChecks);

  const allEntries = [
    ...flattenNestedEntries(mods),
    ...flattenNestedEntries(reqs),
  ];

  const unresolvedIds = allEntries
    .filter((m) => m.resolveItemName)
    .map((m) => m.value);

  if (unresolvedIds.length > 0) {
    const nameMap = await namesOf(unresolvedIds);
    for (const entry of allEntries) {
      if (entry.resolveItemName) {
        if (entry.isNano) entry.itemId = entry.value;
        entry.value = nameMap[entry.value] ?? `Unknown (${entry.value})`;
      }
    }
  }

  return { stats, flags, mods, reqs };
}

async function loadNanoTooltips(core, depth = 0) {
  if (depth > 3) return {};

  const nanoEntries = flattenNestedEntries(core.mods).filter(
    (m) => m.isNano && m.itemId != null,
  );

  const seen = new Set();
  const uniqueNanos = nanoEntries.filter((m) => {
    if (seen.has(m.itemId)) return false;
    seen.add(m.itemId);
    return true;
  });

  const nanoTooltips = {};

  await Promise.all(
    uniqueNanos.map(async ({ itemId, value: nanoName }) => {
      try {
        const [ns, nm, nmc, nmt, nr] = await fetchMemberRaw(itemId);

        const nanoCore = await buildTooltipCore(ns, nm, nmc, nmt, nr);
        const childNanoTooltips = await loadNanoTooltips(nanoCore, depth + 1);

        nanoTooltips[itemId] = {
          name: nanoName,
          ...nanoCore,
          nanoTooltips: childNanoTooltips,
          nanoOrder: getNanoOrder(nanoCore.mods),
        };
      } catch {
        nanoTooltips[itemId] = null;
      }
    }),
  );

  return nanoTooltips;
}

export function useItemData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);
  const rawRef = useRef(null);
  const genRef = useRef(0);

  const interpolate = useCallback(async (ql, gen) => {
    if (!rawRef.current) return;

    const {
      members,
      lowRaw: defaultLow,
      highRaw: defaultHigh,
      lowQl: defaultLowQl,
      highQl: defaultHighQl,
    } = rawRef.current;

    let lowRaw, highRaw, lowQl, highQl;

    if (members && members.length > 1) {
      const { low, high } = findBracketingTemplates(members, ql);

      [lowRaw, highRaw] = await Promise.all([
        fetchMemberRaw(low.id),
        fetchMemberRaw(high.id),
      ]);

      lowQl = low.ql;
      highQl = high.ql;
    } else {
      lowRaw = defaultLow;
      highRaw = defaultHigh;
      lowQl = defaultLowQl;
      highQl = defaultHighQl;
    }

    if (gen !== undefined && gen !== genRef.current) return;

    const [
      rawStats,
      rawMods,
      rawModCriteria,
      rawModText,
      rawReqs,
      rawSkillChecks,
    ] = lowRaw;

    const interpStats = interpolateStats(
      rawStats,
      highRaw[0],
      ql,
      lowQl,
      highQl,
    );

    const interpMods = interpolateMods(rawMods, highRaw[1], ql, lowQl, highQl);
    const interpReqs = interpolateReqs(rawReqs, highRaw[4], ql, lowQl, highQl);

    const core = await buildTooltipCore(
      interpStats,
      interpMods,
      rawModCriteria,
      rawModText,
      interpReqs,
      rawSkillChecks,
    );

    if (gen !== undefined && gen !== genRef.current) return;

    const nanoTooltips = await loadNanoTooltips(core);
    const nanoOrder = getNanoOrder(core.mods);

    if (gen !== undefined && gen !== genRef.current) return;

    setData((prev) => ({ ...prev, ...core, nanoTooltips, nanoOrder }));
  }, []);

  const load = useCallback(
    async (item, gen) => {
      let members = item.members;
      if (members.length <= 1) {
        try {
          const fetched = await membersOf(item.low_id);
          if (fetched?.length > 1) members = fetched;
        } catch {
          // fall through — single-member path is still better than crashing
        }
      }
      if (gen !== genRef.current) return;
      const id = item.low_id;
      const highId = members.at(-1).id;
      const lowQl = members[0].ql;
      const highQl = members.at(-1).ql;
      if (tooltips.has(id)) {
        if (gen !== genRef.current) return;
        const cached = tooltips.get(id);
        rawRef.current = {
          lowRaw: cached.lowRaw,
          highRaw: cached.highRaw,
          lowQl: cached.lowQl,
          highQl: cached.highQl,
          item,
          members,
        };
        setData(cached);
        return;
      }
      setLoading(true);
      try {
        const [lowRaw, highRaw] = await Promise.all([
          fetchMemberRaw(id),
          id !== highId ? fetchMemberRaw(highId) : null,
        ]);
        if (gen !== genRef.current) return;
        rawRef.current = {
          lowRaw,
          highRaw: highRaw ?? lowRaw,
          item,
          lowQl,
          highQl,
          members,
        };
        const [
          rawStats,
          rawMods,
          rawModCriteria,
          rawModText,
          rawReqs,
          rawSkillChecks,
        ] = lowRaw;
        const core = await buildTooltipCore(
          rawStats,
          rawMods,
          rawModCriteria,
          rawModText,
          rawReqs,
          rawSkillChecks,
        );
        if (gen !== genRef.current) return;
        const nanoTooltips = await loadNanoTooltips(core);
        const nanoOrder = getNanoOrder(core.mods);
        if (gen !== genRef.current) return;
        const result = {
          ...core,
          name: item.name,
          description: item.description ?? null,
          lowQl,
          highQl,
          lowRaw,
          highRaw: highRaw ?? lowRaw,
          nanoTooltips,
          nanoOrder,
        };
        tooltips.set(id, result);
        setData(result);
      } catch (e) {
        console.error("Tooltip fetch failed", e);
        if (gen === genRef.current) setData(null);
      } finally {
        if (gen === genRef.current) setLoading(false);
      }
    },
    [],
  );

  const show = useCallback(
    (item, ql) => {
      clearTimeout(timerRef.current);
      const gen = ++genRef.current;
      timerRef.current = setTimeout(async () => {
        await load(item, gen);
        if (gen !== genRef.current) return;
        if (ql != null) await interpolate(ql, gen);
      }, 120);
    },
    [load, interpolate],
  );

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    genRef.current++;
    setData(null);
    setLoading(false);
  }, []);

  return { data, loading, show, hide, interpolate };
}
