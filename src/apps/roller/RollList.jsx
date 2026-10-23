import { Button, Empty, List, NumberInput } from "../../ui";
import { ItemRow } from "../../items";
import { useResolvedItems } from "../../hooks/useResolvedItems";
import { entryKey } from "./rollerData";

const EMPTY = [];

/**
 * The wanted-items list the roller matches missions against.
 *
 * Entries are `{ ids, ql, max_ql, count }`. With Remove On Hit on, the plugin
 * decrements an entry when it lands and drops it at zero, then sends the list
 * back; the app's `missionHit` handler puts it in settings, whatever tab is
 * open.
 *
 * All edits rebuild the settings object. The previous version assigned into
 * `settings.rollList` in place and then pushed the same object reference, so
 * React saw no change and the list only redrew when something else happened to
 * re-render it.
 */
export function RollList({ settings, set }) {
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
