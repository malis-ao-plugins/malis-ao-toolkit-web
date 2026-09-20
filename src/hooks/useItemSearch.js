import { useCallback, useEffect, useRef, useState } from "react";
import { searchItems } from "../lib/db";
import { iconsOf } from "../lib/itemCache";
import { CanFlags, ItemFlags } from "../lib/enums";

/**
 * Item search, debounced and race-free.
 *
 * Two things this has to get right, both of which it previously did not:
 *
 *   Ordering. A request went out on every keystroke and whichever came back
 *   last won. A slow answer for "ar" would land after the answer for "armor"
 *   and replace it, so the list disagreed with the box. Every search now
 *   carries a generation, and a result from anything but the newest is
 *   dropped on the floor.
 *
 *   Failure. The old version had try/finally with no catch, so a service that
 *   was down produced an unhandled rejection, an empty list and no
 *   explanation. Errors are surfaced instead.
 *
 * Typing is debounced so a six-letter word is one request rather than six.
 */

export const DEBOUNCE_MS = 200;

/** Fold chosen flag names into the bitmask the service filters on. */
function bitsFrom(table, names) {
  return (names ?? []).reduce((acc, name) => acc | (table[name]?.bit ?? 0), 0);
}

export function useItemSearch({
  canFilter,
  itemFilter,
  modFilter,
  statFilter,
  reqFilter,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Bumped for every search started and for unmount; a response whose
  // generation is stale belongs to a search nobody is waiting for any more.
  const generation = useRef(0);
  useEffect(() => () => generation.current++, []);

  const search = useCallback(async (name, filters) => {
    const gen = ++generation.current;
    setLoading(true);
    setError(null);

    try {
      const items = await searchItems({
        name,
        canBits: bitsFrom(CanFlags, filters.canFilter) || undefined,
        itemBits: bitsFrom(ItemFlags, filters.itemFilter) || undefined,
        modFilter: filters.modFilter?.length ? filters.modFilter : undefined,
        statFilter: filters.statFilter?.length ? filters.statFilter : undefined,
        reqFilter: filters.reqFilter?.length ? filters.reqFilter : undefined,
      });

      const ids = new Set(
        items.flatMap((i) => [i.low_id, ...i.members.map((m) => m.id)]),
      );
      const icons = await iconsOf([...ids]);

      if (gen !== generation.current) return;

      setResults(
        items.map((item) => ({
          ...item,
          iconSrc: icons[item.low_id] ?? null,
          members: item.members.map((m) => ({
            ...m,
            iconSrc: icons[m.id] ?? null,
          })),
        })),
      );
      setLoading(false);
    } catch (err) {
      if (gen !== generation.current) return;
      console.error("[item search]", err);
      setResults([]);
      setError(err);
      setLoading(false);
    }
  }, []);

  // Filters are compared by content, not by identity. They arrive from
  // persisted settings and a caller that rebuilds the arrays each render —
  // which is easy to do by accident — would otherwise re-search on every
  // render, and on the empty-query path would re-render itself forever.
  const filters = { canFilter, itemFilter, modFilter, statFilter, reqFilter };
  const filterKey = JSON.stringify(filters);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    const name = query.trim();

    if (!name) {
      // Abandon anything in flight so its results cannot arrive into a box
      // the user has just cleared. The updaters return the existing value
      // when there is nothing to clear, so React bails out instead of
      // re-rendering for a state that did not change.
      generation.current++;
      setResults((prev) => (prev.length ? [] : prev));
      setLoading((prev) => (prev ? false : prev));
      setError((prev) => (prev ? null : prev));
      return undefined;
    }

    const timer = setTimeout(
      () => search(name, filtersRef.current),
      DEBOUNCE_MS,
    );

    return () => clearTimeout(timer);
  }, [query, filterKey, search]);

  return { query, onQueryChange: setQuery, results, loading, error };
}

export default useItemSearch;
