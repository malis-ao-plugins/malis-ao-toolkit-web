import { memo, useCallback, useRef, useState } from "react";
import {
  Button,
  Collapse,
  Defer,
  Empty,
  List,
  ListRow,
  NumberInput,
  Row,
  SearchInput,
  Skeleton,
  Slider,
  Stack,
  Toggle,
} from "../../ui";
import { knobWidthFor, measure } from "../../ui";
import { BEHAVIOURS, MISSION_TYPES, SLIDERS } from "./rollerData";

/**
 * The widest caption any of the sliders carries.
 *
 * Every row reserves this much for both of its captions, so the rails all
 * start and end in the same place instead of each one being as long as its
 * own labels happen to allow.
 */
/** Playfield coordinates run to four digits. */
const BOUND = 9999;

/**
 * One knob size for the whole stack, measured across every slider.
 *
 * Easy/Hard only runs to 11, so left to itself it would carry a visibly
 * smaller handle than the rest - which go to -100 - sitting directly above
 * and below it.
 */
const KNOB_PX = Math.max(...SLIDERS.map((s) => knobWidthFor(s.min, s.max)));

const CAP_PX = Math.ceil(
  Math.max(
    ...SLIDERS.flatMap((s) => [
      measure(s.left.toUpperCase()),
      measure(s.right.toUpperCase()),
    ]),
  ),
);

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
    <Defer placeholder={<Skeleton rows={SLIDERS.length} />}>
      <Stack gap={1} style={{ "--ph-slider-cap": `${CAP_PX}px` }}>
        {SLIDERS.map((s) => (
          <Slider
            key={s.key}
            left={s.left}
            right={s.right}
            min={s.min}
            max={s.max}
            knobPx={KNOB_PX}
            value={drag?.key === s.key ? drag.value : (settings[s.key] ?? s.min)}
            onChange={(v) => setDrag({ key: s.key, value: v })}
            onCommit={(v) => {
              setDrag(null);
              set({ [s.key]: v });
            }}
          />
        ))}
      </Stack>
    </Defer>
  );
}

/**
 * Memoised: there are 46 of these, and any change to one zone rebuilds the
 * settings object that every other one is handed.
 */
const ZoneRow = memo(function ZoneRow({ id, zone, patchZone }) {
  const [open, setOpen] = useState(false);

  // The value being dragged, held here so the readout tracks the pointer.
  // Without it the field showed the committed value and only caught up on
  // release, because NumberInput reports a scrub through onChange and the
  // committed one through onCommit.
  const [draft, setDraft] = useState(null);

  const bounded =
    zone.x1 !== 0 || zone.y1 !== 0 || zone.x2 !== BOUND || zone.y2 !== BOUND;

  const field = (key, label) => ({
    value: draft?.key === key ? draft.value : zone[key],
    min: -BOUND,
    max: BOUND,
    onChange: (value) => setDraft({ key, value }),
    onCommit: (value) => {
      setDraft(null);
      patchZone(id, { [key]: value });
    },
    wide: true,
    title: label,
  });

  return (
    <div className="rl-zone">
      <ListRow on={zone.active}>
        <Toggle
          block
          fit
          upper={false}
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
          {bounded ? "[x]" : "[ ]"}
        </Button>
      </ListRow>

      <Collapse open={open}>
        <div className="rl-zone__bounds">
          <Row gap={1}>
            <span className="ph-label rl-zone__cap">From</span>
            <NumberInput {...field("x1", "x1")} />
            <NumberInput {...field("y1", "y1")} />
          </Row>
          <Row gap={1}>
            <span className="ph-label rl-zone__cap">To</span>
            <NumberInput {...field("x2", "x2")} />
            <NumberInput {...field("y2", "y2")} />
          </Row>
        </div>
      </Collapse>
    </div>
  );
});

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

  // Read through a ref so the callback itself never changes: it is handed to
  // 46 memoised rows, and a new function each render would re-render all of
  // them every time one zone is toggled.
  const latest = useRef({ settings, set });
  latest.current = { settings, set };

  const patchZone = useCallback((id, changes) => {
    const { settings: now, set: push } = latest.current;
    push({
      locations: {
        ...now.locations,
        [id]: { ...now.locations[id], ...changes },
      },
    });
  }, []);

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
        placeholder="Filter zones..."
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
        <Defer placeholder={<Skeleton rows={8} />}>
          <List className="rl-scroll">
            {filtered.map(([id, zone]) => (
              <ZoneRow key={id} id={id} zone={zone} patchZone={patchZone} />
            ))}
          </List>
        </Defer>
      )}
    </Stack>
  );
}
