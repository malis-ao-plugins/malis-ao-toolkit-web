import { useState } from "react";
import { Empty, List, SearchInput, Stack } from "../../ui";
import { PixelSelect, PixelText } from "../../packages/pixel-text";
import { ItemRow } from "../../items";
import { useInventory } from "./useInventory";
import "./item-assistant.css";

const ALL = "";

/**
 * Every item across every character, with where it is and a way to pull it.
 *
 * The character filter and the search box are the whole control surface; the
 * columns beyond the name are cut progressively as the window narrows (see
 * item-assistant.css), because at the 320px overlay target only the name and
 * the pull button are worth the space.
 */
export function InventoryPanel({ settings, set, send }) {
  const [query, setQuery] = useState("");
  const characterId = settings.characterId ?? null;

  const { characters, results, loading, total } = useInventory({
    characterId,
    query,
  });

  const options = [
    { value: ALL, label: "All characters" },
    ...characters.map((c) => ({ value: c.id, label: c.name })),
  ];

  const pull = (item) =>
    send({
      type: "pullItem",
      charid: item.charid,
      parentType: item.parentType,
      parentInstance: item.parentInstance,
      slot: item.slot,
    });

  return (
    <Stack gap={2}>
      <PixelSelect
        className="ia-select"
        value={characterId ?? ALL}
        options={options}
        onChange={(v) => set({ characterId: v === ALL ? null : Number(v) })}
      />

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search inventory…"
        count={loading ? "…" : (results.length ?? null)}
      />

      {results.length === 0 ? (
        <Empty>
          {loading
            ? "Loading…"
            : total === 0
              ? "No inventory recorded"
              : "Nothing matches"}
        </Empty>
      ) : (
        <List className="ia-list">
          {/* The head is the list's first row, not a sibling above it, so it
              shares the rows' content box — scrollbar included. It mirrors
              ItemRow's layout: icon, name, the three columns, then the
              QL + pull block. Any change to the row has to be made here
              too — they are two halves of one table. */}
          <div className="ia-head">
            <div className="ia-head__icon" />
            <PixelText className="ia-head__name">Name</PixelText>
            <PixelText className="ia-col ia-col--char">Char</PixelText>
            <PixelText className="ia-col ia-col--where">Location</PixelText>
            <PixelText className="ia-col ia-col--in">In</PixelText>
            <div className="ia-head__actions">
              <PixelText className="ia-head__ql">QL</PixelText>
              <PixelText className="ia-head__pull">Pull</PixelText>
            </div>
          </div>

          {results.map((item) => (
              <ItemRow
                key={item.key}
                item={item}
                qlMode="show"
                actionLabel="Pull"
                onAction={() => pull(item)}
              >
                <PixelText className="ia-col ia-col--char">
                  {item.charName}
                </PixelText>
                <PixelText className="ia-col ia-col--where">
                  {item.locationName}
                </PixelText>
                <PixelText className="ia-col ia-col--in">
                  {item.locationParent ?? ""}
                </PixelText>
              </ItemRow>
          ))}
        </List>
      )}
    </Stack>
  );
}

export default InventoryPanel;
