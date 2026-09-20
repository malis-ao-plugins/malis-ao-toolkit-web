import { useMemo, useState } from "react";
import { Empty, FilterRow, RangeField, Stack, TypeAhead } from "../../../ui";
import { ALL_STATS, statName } from "../../../lib/stats";

/**
 * Filter items by a stat being within a range — used for both requirements
 * and stats, which differ only in the placeholder and where the result goes.
 *
 * Entries are keyed by `statId`, so a stat can only appear once; picking one
 * already in the list is a no-op rather than a duplicate row.
 */
export default function StatRangeFilter({ value, onChange, placeholder }) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(null);

  const rows = draft ?? value;

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const taken = new Set(rows.map((r) => r.statId));
    return ALL_STATS.filter(
      (s) => !taken.has(s.id) && (!q || s.name.toLowerCase().includes(q)),
    )
      .slice(0, 200)
      .map((s) => ({ key: s.id, label: s.name, stat: s }));
  }, [query, rows]);

  const commit = (next) => {
    setDraft(null);
    onChange(next);
  };

  const edit = (statId, field, next, isCommit) => {
    const updated = rows.map((r) =>
      r.statId === statId ? { ...r, [field]: next } : r,
    );
    if (isCommit) commit(updated);
    else setDraft(updated);
  };

  return (
    <Stack gap={1}>
      <TypeAhead
        value={query}
        onChange={setQuery}
        options={options}
        onPick={(option) => {
          commit([
            ...value,
            { statId: option.stat.id, enabled: true, min: null, max: null },
          ]);
          setQuery("");
        }}
        placeholder={placeholder ?? "Add stat…"}
      />

      {rows.length === 0 ? (
        <Empty>Nothing selected</Empty>
      ) : (
        rows.map((row) => (
          <FilterRow
            key={row.statId}
            name={statName(row.statId)}
            active={row.enabled ?? true}
            onToggle={() =>
              edit(row.statId, "enabled", !(row.enabled ?? true), true)
            }
            onRemove={() =>
              commit(value.filter((r) => r.statId !== row.statId))
            }
          >
            <RangeField
              placeholder="Min"
              value={row.min}
              onChange={(v) => edit(row.statId, "min", v, false)}
              onCommit={(v) => edit(row.statId, "min", v, true)}
            />
            <RangeField
              placeholder="Max"
              value={row.max}
              onChange={(v) => edit(row.statId, "max", v, false)}
              onCommit={(v) => edit(row.statId, "max", v, true)}
            />
          </FilterRow>
        ))
      )}
    </Stack>
  );
}
