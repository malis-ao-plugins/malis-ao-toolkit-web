import { useState } from "react";
import {
  Button,
  Collapse,
  Empty,
  List,
  ListRow,
  NumberInput,
  Row,
  SearchInput,
  Slider,
  Stack,
  Toggle,
} from "../../ui";
import { BEHAVIOURS, MISSION_TYPES, SLIDERS } from "./rollerData";

/** Mission kinds to accept. */
export function TypesPanel({ settings, set }) {
  return (
    <Stack gap={1}>
      {MISSION_TYPES.map((t) => (
        <Toggle
          key={t.key}
          block
          label={t.label}
          on={!!settings[t.key]}
          onChange={(v) => set({ [t.key]: v })}
        />
      ))}
    </Stack>
  );
}

/** Behaviour flags. */
export function BehaviourPanel({ settings, set }) {
  return (
    <Stack gap={1}>
      {BEHAVIOURS.map((b) => (
        <Toggle
          key={b.key}
          block
          label={b.label}
          title={b.hint}
          on={!!settings[b.key]}
          onChange={(v) => set({ [b.key]: v })}
        />
      ))}
    </Stack>
  );
}

/**
 * The seven mission sliders.
 *
 * The dragged value is held locally so the readout tracks the pointer, and
 * only the release pushes to the client — otherwise a single drag fires a
 * hundred updateConfig messages down the socket.
 */
export function SlidersPanel({ settings, set }) {
  const [drag, setDrag] = useState(null); // { key, value }

  return (
    <Stack gap={1}>
      {SLIDERS.map((s) => (
        <Slider
          key={s.key}
          left={s.left}
          right={s.right}
          min={s.min}
          max={s.max}
          value={drag?.key === s.key ? drag.value : (settings[s.key] ?? s.min)}
          onChange={(v) => setDrag({ key: s.key, value: v })}
          onCommit={(v) => {
            setDrag(null);
            set({ [s.key]: v });
          }}
        />
      ))}
    </Stack>
  );
}

function ZoneRow({ id, zone, patchZone }) {
  const [open, setOpen] = useState(false);
  const bounded =
    zone.x1 !== 0 || zone.y1 !== 0 || zone.x2 !== 9999 || zone.y2 !== 9999;

  return (
    <div className="rl-zone">
      <ListRow on={zone.active}>
        <Toggle
          block
          label={zone.name}
          on={zone.active}
          onChange={(v) => patchZone(id, { active: v })}
        />
        <Button
          size="sm"
          variant="ghost"
          title="Bounds"
          onClick={() => setOpen((v) => !v)}
        >
          {bounded ? "▣" : "□"}
        </Button>
      </ListRow>

      <Collapse open={open}>
        <div className="rl-zone__bounds">
          <Row gap={1}>
            <span className="ph-label rl-zone__cap">From</span>
            <NumberInput
              value={zone.x1}
              min={-99999}
              max={99999}
              onCommit={(v) => patchZone(id, { x1: v })}
              onChange={() => {}}
              wide
              title="x1"
            />
            <NumberInput
              value={zone.y1}
              min={-99999}
              max={99999}
              onCommit={(v) => patchZone(id, { y1: v })}
              onChange={() => {}}
              wide
              title="y1"
            />
          </Row>
          <Row gap={1}>
            <span className="ph-label rl-zone__cap">To</span>
            <NumberInput
              value={zone.x2}
              min={-99999}
              max={99999}
              onCommit={(v) => patchZone(id, { x2: v })}
              onChange={() => {}}
              wide
              title="x2"
            />
            <NumberInput
              value={zone.y2}
              min={-99999}
              max={99999}
              onCommit={(v) => patchZone(id, { y2: v })}
              onChange={() => {}}
              wide
              title="y2"
            />
          </Row>
        </div>
      </Collapse>
    </div>
  );
}

/** Playfields the roller is allowed to roll in, with optional bounds. */
export function ZonesPanel({ settings, set, state }) {
  const zones = state.zones;
  const [query, setQuery] = useState("");

  const entries = Object.entries(zones ?? {});
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? entries.filter(([, z]) => z.name?.toLowerCase().includes(needle))
    : entries;

  const activeCount = entries.filter(([, z]) => z.active).length;

  const patchZone = (id, changes) =>
    set({
      locations: {
        ...settings.locations,
        [id]: { ...settings.locations[id], ...changes },
      },
    });

  const setAll = (active) =>
    set({
      locations: Object.fromEntries(
        Object.entries(settings.locations ?? {}).map(([id, z]) => [
          id,
          { ...z, active },
        ]),
      ),
    });

  return (
    <Stack gap={2}>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Filter zones…"
        count={`${activeCount}/${entries.length}`}
      />
      <Row gap={1}>
        <Button size="sm" block onClick={() => setAll(true)}>
          All On
        </Button>
        <Button size="sm" block onClick={() => setAll(false)}>
          All Off
        </Button>
      </Row>

      {filtered.length === 0 ? (
        <Empty>No zone matches</Empty>
      ) : (
        <List className="rl-scroll">
          {filtered.map(([id, zone]) => (
            <ZoneRow key={id} id={id} zone={zone} patchZone={patchZone} />
          ))}
        </List>
      )}
    </Stack>
  );
}
