import { useMemo, useRef, useState } from "react";
import { Empty, FilterRow, RangeField, Stack, TypeAhead } from "../../../ui";
import { ALL_STATS, statName } from "../../../lib/stats";
import { MOD_FILTER_TYPES, MOD_TYPE_BY_ID } from "../../../lib/modFilterTypes";

let counter = 0;
const uid = () => `mod-${++counter}`;

function rowLabel(row) {
  switch (row.modType) {
    case "stat":
      return statName(row.statId);
    case "hit":
      return "Damage / Healing";
    case "cast":
      return "Casts nano";
    case "upload":
      return "Uploads nano";
    case "lock":
      return `Lock: ${statName(row.statId)}`;
    default:
      return row.modType;
  }
}

/**
 * Filter items by what their modifiers do.
 *
 * Two-stage: pick a kind of modifier, then — for the kinds that need one —
 * the stat it applies to. The field keeps focus between stages so it reads as
 * one continuous act of typing, and Escape steps back a stage rather than
 * closing outright.
 *
 * Range edits preview locally and only reach the plugin on blur; otherwise
 * typing a four-digit minimum sends four searches.
 */
export default function ModifierFilter({ value, onChange }) {
  const [stage, setStage] = useState(null); // mod type awaiting a stat
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(null); // local preview of a range edit
  const fieldRef = useRef(null);

  const rows = draft ?? value;

  const taken = useMemo(() => {
    const keys = new Set();
    for (const row of rows) {
      if (row.modType === "stat" || row.modType === "lock") {
        keys.add(`${row.modType}-${row.statId}`);
      }
    }
    return keys;
  }, [rows]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!stage) {
      return MOD_FILTER_TYPES.filter(
        (t) => !q || t.label.toLowerCase().includes(q),
      ).map((t) => ({ key: t.id, label: t.label, hint: t.hint, type: t }));
    }

    // 2000+ stats exist; the list is capped because nobody scrolls past the
    // first screen, they type.
    return ALL_STATS.filter(
      (s) =>
        !taken.has(`${stage.id}-${s.id}`) &&
        (!q || s.name.toLowerCase().includes(q)),
    )
      .slice(0, 200)
      .map((s) => ({ key: s.id, label: s.name, stat: s }));
  }, [stage, query, taken]);

  const commit = (next) => {
    setDraft(null);
    onChange(next);
  };

  const pick = (option) => {
    if (option.type) {
      if (option.type.needsStatPicker) {
        setStage(option.type);
        setQuery("");
        fieldRef.current?.focus();
        return;
      }
      commit([
        ...value,
        {
          uid: uid(),
          modType: option.type.id,
          enabled: true,
          min: null,
          max: null,
        },
      ]);
    } else {
      commit([
        ...value,
        {
          uid: uid(),
          modType: stage.id,
          statId: option.stat.id,
          enabled: true,
          min: null,
          max: null,
        },
      ]);
    }
    setStage(null);
    setQuery("");
  };

  /** Escape backs out of the stat picker before it closes the field. */
  const cancel = () => {
    if (!stage) return true;
    setStage(null);
    setQuery("");
    return false;
  };

  const edit = (key, field, next, isCommit) => {
    const updated = rows.map((r) =>
      r.uid === key ? { ...r, [field]: next } : r,
    );
    if (isCommit) commit(updated);
    else setDraft(updated);
  };

  return (
    <Stack gap={1}>
      <TypeAhead
        ref={fieldRef}
        value={query}
        onChange={setQuery}
        options={options}
        onPick={pick}
        onCancel={cancel}
        placeholder={
          stage ? `Search ${stage.label.toLowerCase()}…` : "Add modifier…"
        }
      />

      {rows.length === 0 ? (
        <Empty>No modifier filters</Empty>
      ) : (
        rows.map((row) => (
          <FilterRow
            key={row.uid}
            name={rowLabel(row)}
            active={row.enabled ?? true}
            onToggle={() =>
              edit(row.uid, "enabled", !(row.enabled ?? true), true)
            }
            onRemove={() => commit(value.filter((r) => r.uid !== row.uid))}
          >
            {MOD_TYPE_BY_ID[row.modType]?.hasRange && (
              <>
                <RangeField
                  placeholder="Min"
                  value={row.min}
                  onChange={(v) => edit(row.uid, "min", v, false)}
                  onCommit={(v) => edit(row.uid, "min", v, true)}
                />
                <RangeField
                  placeholder="Max"
                  value={row.max}
                  onChange={(v) => edit(row.uid, "max", v, false)}
                  onCommit={(v) => edit(row.uid, "max", v, true)}
                />
              </>
            )}
          </FilterRow>
        ))
      )}
    </Stack>
  );
}
