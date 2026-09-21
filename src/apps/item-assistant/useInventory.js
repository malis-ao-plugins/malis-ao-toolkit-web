import { useEffect, useMemo, useState } from "react";
import { searchItems } from "../../lib/db";
import { iconsOf } from "../../lib/itemCache";
import {
  getCharacterContainers,
  getCharacterItems,
  getCharacters,
} from "./inventoryDb";

/**
 * Everything the inventory panel needs, in one hook.
 *
 * The view was previously 290 lines with six effects interleaved with the
 * markup. The work is really three stages, so it is written as three:
 *
 *   1. characters   — the plugin's list, fetched once
 *   2. records      — every item row for the selected character(s), with its
 *                     location resolved from the container tree
 *   3. results      — those records joined to the item database, so names,
 *                     icons and QL ranges come from the same source the rest
 *                     of the toolkit uses
 *
 * Splitting them means a change to the search does not risk the container
 * walk, and each stage can be read on its own.
 */

/** How long a pause in typing counts as "done typing". */
const SETTLE_MS = 160;

// Parent types that are top-level containers — nothing above them to name.
const TOP_LEVEL = { 104: "Inventory", 105: "Bank" };

/**
 * Where an item lives, and what that container itself sits in.
 *
 * AO nests containers, so a backpack inside a bank reads "Large Backpack" in
 * "Bank". Only one level up is shown — deeper than that and the column stops
 * being readable at the width we have.
 */
function resolveLocation(parentType, parentInstance, byInstance) {
  if (TOP_LEVEL[parentType]) {
    return { locationName: TOP_LEVEL[parentType], locationParent: null };
  }

  const container = byInstance[parentInstance];

  // A container the plugin has not catalogued yet still has an instance id,
  // which is more use than nothing; one it has no id for at all is simply
  // unknown, and printing "Container null" for that was the old behaviour.
  const named = (instance) =>
    instance == null ? null : `Container ${instance}`;

  const locationName = container?.name ?? named(parentInstance) ?? "Unknown";

  if (!container) return { locationName, locationParent: null };

  if (TOP_LEVEL[container.parent_type]) {
    return { locationName, locationParent: TOP_LEVEL[container.parent_type] };
  }

  const above = byInstance[container.parent_instance];
  return {
    locationName,
    locationParent: above?.name ?? named(container.parent_instance),
  };
}

export function useInventory({ characterId, query }) {
  const [characters, setCharacters] = useState([]);
  const [records, setRecords] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // ── 1. characters ───────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    getCharacters()
      .then((list) => alive && setCharacters(list))
      .catch((err) => console.error("[item-assistant] characters", err));
    return () => {
      alive = false;
    };
  }, []);

  // ── 2. records ──────────────────────────────────────────────────────────
  const charIds = useMemo(
    () => (characterId != null ? [characterId] : characters.map((c) => c.id)),
    [characterId, characters],
  );
  const charKey = charIds.join(",");

  useEffect(() => {
    if (!charIds.length) {
      setRecords([]);
      return;
    }

    let alive = true;

    Promise.all(
      charIds.map(async (charid) => {
        const [items, containers] = await Promise.all([
          getCharacterItems(charid),
          getCharacterContainers(charid),
        ]);
        return { charid, items, containers };
      }),
    )
      .then((perCharacter) => {
        if (!alive) return;
        setRecords(
          perCharacter.flatMap(({ charid, items, containers }) => {
            const byInstance = Object.fromEntries(
              containers.map((c) => [c.instance, c]),
            );
            return items.map((row) => ({
              itemId: row.item_id,
              highId: row.item_high_id,
              ql: row.ql,
              charid,
              slot: row.slot,
              parentType: row.parent_type,
              parentInstance: row.parent_instance,
              ...resolveLocation(row.parent_type, row.parent_instance, byInstance),
            }));
          }),
        );
      })
      .catch((err) => console.error("[item-assistant] inventory", err));

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charKey]);

  // ── 3. results ──────────────────────────────────────────────────────────

  // Typing is not a reason to hit the database.
  //
  // The search below is a query plus an icon fetch, and it was running once
  // per keystroke: eight characters typed quickly meant eight round trips,
  // seven of whose results were thrown away before anyone saw them. Waiting
  // for a pause in typing costs nothing anyone can perceive and does the work
  // once.
  const [settled, setSettled] = useState(query);

  useEffect(() => {
    if (settled === query) return undefined;
    const timer = setTimeout(() => setSettled(query), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [query, settled]);

  const idPairs = useMemo(() => {
    const seen = new Map();
    for (const r of records) {
      if (!seen.has(r.itemId)) {
        seen.set(r.itemId, { lowId: r.itemId, highId: r.highId });
      }
    }
    return [...seen.values()];
  }, [records]);

  const byItemId = useMemo(() => {
    const map = new Map();
    for (const rec of records) {
      const list = map.get(rec.itemId);
      if (list) list.push(rec);
      else map.set(rec.itemId, [rec]);
    }
    return map;
  }, [records]);

  const nameOf = useMemo(
    () => new Map(characters.map((c) => [c.id, c.name])),
    [characters],
  );

  useEffect(() => {
    if (!idPairs.length) {
      setResults([]);
      return;
    }

    let alive = true;
    setLoading(true);

    searchItems({ idPairs, name: settled, limit: idPairs.length })
      .then(async (items) => {
        if (!alive) return;

        const ids = new Set(
          items.flatMap((i) => [i.low_id, ...i.members.map((m) => m.id)]),
        );
        const icons = await iconsOf([...ids]);
        if (!alive) return;

        // One row per physical copy: the same item in three places is three
        // rows, because the point of the panel is finding where a thing is.
        // A key that is unique whatever the data says.
        //
        // item + character + container + slot ought to identify one physical
        // copy, and usually does — but the plugin can record the same slot
        // twice, and two rows with one key make React remount both on every
        // update rather than keep them. A counter costs nothing and cannot
        // collide.
        let seq = 0;

        setResults(
          items.flatMap((item) =>
            (byItemId.get(item.low_id) ?? []).map((rec) => ({
              ...item,
              ql: rec.ql,
              iconSrc: icons[item.low_id] ?? null,
              members: item.members.map((m) => ({
                ...m,
                iconSrc: icons[m.id] ?? null,
              })),
              charName: nameOf.get(rec.charid) ?? `#${rec.charid}`,
              locationName: rec.locationName,
              locationParent: rec.locationParent,
              charid: rec.charid,
              slot: rec.slot,
              parentType: rec.parentType,
              parentInstance: rec.parentInstance,
              key: `${item.low_id}-${rec.charid}-${rec.parentInstance}-${rec.slot}-${seq++}`,
            })),
          ),
        );
        setLoading(false);
      })
      .catch((err) => {
        console.error("[item-assistant] search", err);
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [idPairs, byItemId, nameOf, settled]);

  return { characters, results, loading, total: records.length };
}
