import { useState, useRef, useCallback } from "react";
import {
  getItemStats,
  getItemModifiers,
  getItemModifierCriteria,
  getItemModifierText,
  getItemRequirements,
  getItemNames,
  getItemSkillChecks,
  getItemMembers,
  findBracketingTemplates,
} from "../lib/db";
import { formatMods, formatReqs, formatStats } from "../lib/formatter";
import {
  interpolateMods,
  interpolateReqs,
  interpolateStats,
} from "../lib/interpolate";

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
    const nameMap = await getItemNames(unresolvedIds);
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
        const [ns, nm, nmc, nmt, nr] = await Promise.all([
          getItemStats(itemId),
          getItemModifiers(itemId),
          getItemModifierCriteria(itemId),
          getItemModifierText(itemId),
          getItemRequirements(itemId),
        ]);

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
  const cacheRef = useRef({});
  const memberRawCacheRef = useRef({});
  const membersCacheRef = useRef({});
  const timerRef = useRef(null);
  const rawRef = useRef(null);
  const genRef = useRef(0);

  const fetchMemberRaw = async (id) => {
    if (memberRawCacheRef.current[id]) {
      return memberRawCacheRef.current[id];
    }

    const raw = await Promise.all([
      getItemStats(id),
      getItemModifiers(id),
      getItemModifierCriteria(id),
      getItemModifierText(id),
      getItemRequirements(id),
      getItemSkillChecks(id),
    ]);

    memberRawCacheRef.current[id] = raw;
    return raw;
  };

  const fetchMembers = useCallback(async (id) => {
    if (membersCacheRef.current[id]) {
      return membersCacheRef.current[id];
    }
    const members = await getItemMembers(id);
    membersCacheRef.current[id] = members;
    return members;
  }, []);

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
          const fetched = await fetchMembers(item.low_id);
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
      if (cacheRef.current[id]) {
        if (gen !== genRef.current) return;
        const cached = cacheRef.current[id];
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
          Promise.all([
            getItemStats(id),
            getItemModifiers(id),
            getItemModifierCriteria(id),
            getItemModifierText(id),
            getItemRequirements(id),
            getItemSkillChecks(id),
          ]),
          id !== highId
            ? Promise.all([
                getItemStats(highId),
                getItemModifiers(highId),
                getItemModifierCriteria(highId),
                getItemModifierText(highId),
                getItemRequirements(highId),
                getItemSkillChecks(highId),
              ])
            : null,
        ]);
        if (gen !== genRef.current) return;
        memberRawCacheRef.current[id] = lowRaw;
        if (highId !== id && highRaw) {
          memberRawCacheRef.current[highId] = highRaw;
        }
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
        cacheRef.current[id] = result;
        setData(result);
      } catch (e) {
        console.error("Tooltip fetch failed", e);
        if (gen === genRef.current) setData(null);
      } finally {
        if (gen === genRef.current) setLoading(false);
      }
    },
    [fetchMembers],
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
