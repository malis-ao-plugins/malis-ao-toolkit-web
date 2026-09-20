import { useState } from "react";
import {
  Button,
  Collapse,
  Empty,
  List,
  Panel,
  SearchInput,
  Stack,
} from "../../ui";
import { ItemRow } from "../../items";
import ModifierFilter from "./filters/ModifierFilter";
import FlagFilter from "./filters/FlagFilter";
import StatRangeFilter from "./filters/StatRangeFilter";
import { useItemSearch } from "../../hooks/useItemSearch";
import { CanFlags, ItemFlags } from "../../lib/enums";

const EMPTY = [];

/**
 * Item finder. Results feed the roll list.
 *
 * The filter stack is a drawer rather than a permanent column — at 320px there
 * is no room for both, and the filters are set once and then left alone while
 * the search box gets used constantly.
 */
const rollKey = (e) => `${e.ids.join("-")}@${e.ql}`;

export function Browser({ settings, set }) {
  const [open, setOpen] = useState(false);

  const f = settings.dbFilters ?? {};
  const canFilter = f.canFilter ?? EMPTY;
  const itemFilter = f.itemFilter ?? EMPTY;
  const modFilter = f.modFilter ?? EMPTY;
  const statFilter = f.statFilter ?? EMPTY;
  const reqFilter = f.reqFilter ?? EMPTY;

  const setFilter = (key, value) =>
    set({ dbFilters: { ...f, [key]: value } });

  /**
   * Add a found item to the roll list, or bump its count if already there.
   * Lives here rather than in the app config because this is the only place
   * that can produce one.
   */
  const addToRollList = (resolved) => {
    const entry = {
      ids: resolved.members.map((m) => m.id),
      ql: resolved.ql,
      max_ql: resolved.members[resolved.members.length - 1].ql,
    };
    const list = settings.rollList ?? [];
    const key = rollKey(entry);
    const exists = list.some((e) => rollKey(e) === key);

    set({
      rollList: exists
        ? list.map((e) =>
            rollKey(e) === key ? { ...e, count: e.count + 1 } : e,
          )
        : [...list, { ...entry, count: 1 }],
    });
  };

  const { query, onQueryChange, results, loading, error } = useItemSearch({
    canFilter,
    itemFilter,
    modFilter,
    statFilter,
    reqFilter,
  });

  const activeFilters =
    canFilter.length +
    itemFilter.length +
    modFilter.length +
    statFilter.length +
    reqFilter.length;

  return (
    <Stack gap={2}>
      <SearchInput
        value={query}
        onChange={(v) => {
          onQueryChange(v);
          if (open) setOpen(false);
        }}
        placeholder={"Find item…"}
        count={loading ? "…" : results.length || null}
        right={
          <Button
            variant={open ? "primary" : "default"}
            onClick={() => setOpen((v) => !v)}
            title="Filters"
          >
            {activeFilters > 0 ? `F ${activeFilters}` : "F"}
          </Button>
        }
      />

      <Collapse open={open}>
        <Stack gap={1} className="rl-filters">
          <Panel title="Modifiers">
            <ModifierFilter
              value={modFilter}
              onChange={(v) => setFilter("modFilter", v)}
            />
          </Panel>
          <Panel title="Requirements">
            <StatRangeFilter
              placeholder="Add requirement…"
              value={reqFilter}
              onChange={(v) => setFilter("reqFilter", v)}
            />
          </Panel>
          <Panel title="Stats">
            <StatRangeFilter
              placeholder="Add stat…"
              value={statFilter}
              onChange={(v) => setFilter("statFilter", v)}
            />
          </Panel>
          <Panel title="Flags">
            <Stack gap={1}>
              <FlagFilter
                flags={CanFlags}
                value={canFilter}
                onChange={(v) => setFilter("canFilter", v)}
                placeholder="Add can…"
              />
              <FlagFilter
                flags={ItemFlags}
                value={itemFilter}
                onChange={(v) => setFilter("itemFilter", v)}
                placeholder="Add flag…"
              />
            </Stack>
          </Panel>
        </Stack>
      </Collapse>

      {results.length === 0 ? (
        <Empty>
          {loading
            ? "Searching…"
            : error
              ? "Item database not answering"
              : query
                ? "Nothing matches"
                : "Type to search"}
        </Empty>
      ) : (
        <List className="rl-scroll">
          {results.map((item) => (
            <ItemRow
              key={item.low_id}
              item={item}
              onAction={addToRollList}
            />
          ))}
        </List>
      )}
    </Stack>
  );
}

export default Browser;
