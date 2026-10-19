import { useEffect, useRef } from "react";
import { Button, Empty, List, NumberInput } from "../../ui";
import { ItemRow } from "../../items";
import { useResolvedItems } from "../../hooks/useResolvedItems";
import { entryKey } from "./rollerData";

const EMPTY = [];

/**
 * The wanted-items list the roller matches missions against.
 *
 * Entries are `{ ids, ql, max_ql, count }`. With Remove On Hit on, a
 * `missionHit` for an entry decrements it, and the entry disappears at zero;
 * with it off, entries stay as they are and keep being rolled for.
 *
 * All edits rebuild the settings object. The previous version assigned into
 * `settings.rollList` in place and then pushed the same object reference, so
 * React saw no change and the list only redrew when something else happened to
 * re-render it.
 */
export function RollList({ settings, set, state }) {
  const lastHit = state.lastHit;
  const rollList = settings?.rollList ?? EMPTY;
  const resolved = useResolvedItems(rollList);

  const setCount = (key, count) =>
    set({
      rollList: rollList.map((e) =>
        entryKey(e) === key ? { ...e, count } : e,
      ),
    });

  const remove = (key) =>
    set({ rollList: rollList.filter((e) => entryKey(e) !== key) });

  // Consume hits. Held in a ref so a re-render with the same hit is a no-op.
  const lastSeen = useRef(null);
  useEffect(() => {
    if (!lastHit || lastHit === lastSeen.current) return;
    lastSeen.current = lastHit;

    if (!settings?.removeRolledEntries) return;

    const key = entryKey(lastHit);
    const match = rollList.find((e) => entryKey(e) === key);
    if (!match) return;

    if (match.count > 1) setCount(key, match.count - 1);
    else remove(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastHit]);

  if (rollList.length === 0) {
    return <Empty>Add items from Browse</Empty>;
  }

  const counts = new Map(rollList.map((e) => [entryKey(e), e.count]));

  return (
    <List className="rl-scroll rl-scroll--short">
      {resolved.map((item) => {
        const key = entryKey(item);
        return (
          <ItemRow key={key} item={item} showAction={false} qlMode="none">
            <NumberInput
              value={counts.get(key) ?? 1}
              min={1}
              max={999}
              onChange={(v) => setCount(key, v)}
              onCommit={(v) => setCount(key, v)}
              title="How many to roll for"
            />
            <Button
              variant="danger"
              size="sm"
              title="Remove from roll list"
              onClick={() => remove(key)}
            >
              {"×"}
            </Button>
          </ItemRow>
        );
      })}
    </List>
  );
}

export default RollList;
