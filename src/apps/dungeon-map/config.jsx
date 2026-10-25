import { defineApp } from "../defineApp";
import { MapCanvas } from "./MapCanvas";
import { flipDungeon, flipMover } from "./payload";
import { Button, ColorField, NumberInput, PixelText, Stack, Toggle } from "../../ui";
import "./dungeon-map.css";

/**
 * Dungeon Map.
 *
 * The plugin (malis-dungeon-map-net, port 7071) reads the dungeon out of the
 * running client and sends it once per zone: one entry per room with its wall
 * segments, its doors and, in the four generated-dungeon templates, the spawn
 * points the template hangs off that room. A `frame` message then follows on
 * every game frame with the player, the dynels and the mission objective.
 *
 * The wire calls a lift a `terminal`, because that is its identity type in the
 * client. In a generated dungeon they are the lifts, so that is what they are
 * called here. The objective can be one of them - it is drawn as the
 * objective either way, and has its own toggle.
 *
 * Everything here is drawing.
 */

/**
 * The defaults, named once.
 *
 * Reset puts these back, so it cannot drift from what a fresh install gets.
 */
const DEFAULTS = {
  follow: true,
  showDoors: true,
  showSpawns: false,
  showDynels: true,
  showChests: true,
  showLifts: true,
  showObjective: true,

  // empty colour means "follow the skin"; widths are whole device pixels
  transparentBackground: false,
  mapClickThrough: false,
  wallColor: "",
  wallWidth: 1,
  doorColor: "",
  doorWidth: 2,
};

/** The kit's accents, plus a neutral - enough for a map without a full grid. */
const SWATCHES = ["#ccd6e0", "#8ce99a", "#56d4e8", "#ffd43b", "#ffb454", "#ff6b6b", "#ff79c6"];

/**
 * One thing you can style: its colour and how thick it is drawn.
 *
 * The width sits on the swatch row rather than in a row of its own - a
 * caption saying "wall width" under one saying "walls" is a line of text
 * earning nothing.
 */
function StyleField({ label, color, width, min, max, onColor, onWidth }) {
  return (
    <div className="dm__field">
      <ColorField
        label={label}
        hint={color ? "" : "following the skin"}
        value={color || ""}
        swatches={SWATCHES}
        onChange={onColor}
      />
      <NumberInput
        value={Number(width)}
        min={min}
        max={max}
        title="thickness in pixels"
        onChange={onWidth}
        onCommit={onWidth}
      />
    </div>
  );
}

function TransparencyIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      focusable="false"
    >
      <rect x="1.5" y="1.5" width="13" height="13" fill="none" stroke="currentColor" />
      <path
        d="M3 3h3v3H3zM9 3h3v3H9zM6 6h3v3H6zM3 9h3v3H3zM9 9h3v3H9z"
        fill="currentColor"
      />
    </svg>
  );
}

function PassThroughIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      focusable="false"
    >
      <path
        d="M9 2h5v2H9zM12 4h2v3h-2zM9 7h5v2H9zM12 9h2v3h-2zM9 12h5v2H9z"
        fill="currentColor"
      />
      <path
        d="M2 2v10l3-3 2 5 2-1-2-5h4L2 2z"
        fill="currentColor"
      />
    </svg>
  );
}

function MapHeaderControls({ settings, set }) {
  const transparent = !!settings.transparentBackground;
  const clickThrough = !!settings.mapClickThrough;
  return (
    <>
      <Button
        size="sm"
        variant={transparent ? "primary" : "default"}
        className="dm__icon-button"
        title={
          transparent
            ? "Use a solid map background"
            : "Make the map background transparent"
        }
        aria-label={
          transparent
            ? "Use a solid map background"
            : "Make the map background transparent"
        }
        aria-pressed={transparent}
        onClick={() => set({ transparentBackground: !transparent })}
      >
        <TransparencyIcon />
      </Button>
      <Button
        size="sm"
        variant={clickThrough ? "primary" : "default"}
        className="dm__icon-button"
        title={
          clickThrough
            ? "Capture mouse input in the map area"
            : "Pass mouse input through the map area"
        }
        aria-label={
          clickThrough
            ? "Capture mouse input in the map area"
            : "Pass mouse input through the map area"
        }
        aria-pressed={clickThrough}
        onClick={() => set({ mapClickThrough: !clickThrough })}
      >
        <PassThroughIcon />
      </Button>
    </>
  );
}

function OptionsPanel({ settings, set }) {
  return (
    <Stack gap={1} className="dm__options">
      <Toggle
        plain
        label="Follow the player"
        on={!!settings.follow}
        onChange={(v) => set({ follow: v })}
      />
      <Toggle
        plain
        label="Doors"
        on={!!settings.showDoors}
        onChange={(v) => set({ showDoors: v })}
      />
      <Toggle
        plain
        label="Spawn points"
        on={!!settings.showSpawns}
        onChange={(v) => set({ showSpawns: v })}
      />
      <Toggle
        plain
        label="Characters"
        on={!!settings.showDynels}
        onChange={(v) => set({ showDynels: v })}
      />
      <Toggle
        plain
        label="Chests"
        on={!!settings.showChests}
        onChange={(v) => set({ showChests: v })}
      />
      <Toggle
        plain
        label="Lifts"
        on={!!settings.showLifts}
        onChange={(v) => set({ showLifts: v })}
      />
      <Toggle
        plain
        label="Mission objective"
        on={!!settings.showObjective}
        onChange={(v) => set({ showObjective: v })}
      />
      <PixelText className="dm__muted">
        Spawn points are where the template puts a monster, not where one is.
      </PixelText>

      <PixelText upper className="dm__section">
        Outlines
      </PixelText>

      <StyleField
        label="Walls"
        color={settings.wallColor}
        width={settings.wallWidth ?? 1}
        min={1}
        max={4}
        onColor={(v) => set({ wallColor: v })}
        onWidth={(v) => set({ wallWidth: v })}
      />

      <StyleField
        label="Doors"
        color={settings.doorColor}
        width={settings.doorWidth ?? 2}
        min={1}
        max={6}
        onColor={(v) => set({ doorColor: v })}
        onWidth={(v) => set({ doorWidth: v })}
      />

      <PixelText className="dm__muted">
        Leave a colour unset and it follows whatever skin the toolkit is on.
      </PixelText>

      <Button size="sm" onClick={() => set({ ...DEFAULTS })}>
        Reset to defaults
      </Button>
    </Stack>
  );
}

export default defineApp({
  port: 7071,
  name: "Dungeon Map",
  vendor: "Mali's",
  header: MapHeaderControls,

  settings: DEFAULTS,

  state: {
    dungeon: null,
    player: null,
    dynels: [],
    objective: null,
    pinnedFloor: null,
  },

  // None of this outlives the session. Where the player is and what is on the
  // floor with them are only true while the plugin is connected - and the
  // dungeon itself is the one you are standing in, so keeping it would show a
  // stale map after a reload. It is also the only large value here, and this
  // is the one app that streams: persisting it meant re-writing 15-27KB to
  // localStorage on every 10Hz position message.
  transient: ["player", "dynels", "objective", "dungeon"],

  // Z is flipped on the way in, once - see payload.js.
  messages: {
    dungeon: (d) => ({ dungeon: flipDungeon(d), pinnedFloor: null }),
    // one message a frame: where the player is, and what is standing near them
    frame: (d) => ({
      player: flipMover(d.p),
      dynels: (d.d ?? []).map(flipMover),
      objective: d.o ? flipMover(d.o) : null,
    }),
  },

  panels: {
    map: {
      title: ({ state }) =>
        state.dungeon?.rooms?.length
          ? `Map · ${state.dungeon.rooms.length} rooms`
          : "Map",
      fixed: true,
      fill: true,
      component: MapCanvas,
    },
    options: { title: "Options", component: OptionsPanel },
  },

  tabs: [
    { id: "tab-map", label: "Map", panels: ["map"] },
    { id: "tab-cfg", label: "Config", panels: ["options"] },
  ],
});
