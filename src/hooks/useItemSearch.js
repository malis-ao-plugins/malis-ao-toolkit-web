import { useState, useCallback, useEffect } from "react";
import { getItemIcons, searchItems } from "../lib/db";
import { CanFlags, ItemFlags } from "../lib/enums";

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

  const doSearch = useCallback(async (q, canF, itemF, modF, statF, reqF) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const canBits = [...canF].reduce((acc, name) => acc | CanFlags[name], 0);
      const itemBits = [...itemF].reduce(
        (acc, name) => acc | ItemFlags[name],
        0,
      );
      const data = await searchItems({
        name: trimmed,
        canBits: canBits || undefined,
        itemBits: itemBits || undefined,
        modFilter: modF.length ? modF : undefined,
        statFilter: statF.length ? statF : undefined,
        reqFilter: reqF.length ? reqF : undefined,
      });
      const allIds = [
        ...data.map((i) => i.low_id),
        ...data.flatMap((i) => i.members.map((m) => m.id)),
      ];
      const iconMap = await getItemIcons([...new Set(allIds)]);
      setResults(
        data.map((item) => ({
          ...item,
          iconSrc: iconMap[item.low_id] ?? null,
          members: item.members.map((m) => ({
            ...m,
            iconSrc: iconMap[m.id] ?? null,
          })),
        })),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (query.trim())
      doSearch(query, canFilter, itemFilter, modFilter, statFilter, reqFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFilter, itemFilter, modFilter, statFilter, reqFilter]);

  const onQueryChange = (val) => {
    setQuery(val);
    doSearch(val, canFilter, itemFilter, modFilter, statFilter, reqFilter);
  };

  return { query, onQueryChange, results, loading };
}
