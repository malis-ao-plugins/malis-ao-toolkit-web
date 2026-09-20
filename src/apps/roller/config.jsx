import { defineApp } from "../defineApp";
import { Button, Empty, Stack } from "../../ui";
import { MISSION_PLAYFIELDS, PLAYFIELDS } from "../../lib/data";
import { MissionCard } from "./MissionCard";
import { RollList } from "./RollList";
import { Browser } from "./Browser";
import {
  BehaviourPanel,
  SlidersPanel,
  TypesPanel,
  ZonesPanel,
} from "./Settings";
import { useHoverNote } from "./HoverNote";
import { SLIDERS } from "./rollerData";
import "./roller.css";

const MAX_MISSIONS = 6;

const ZONE_NAME = Object.fromEntries(
  PLAYFIELDS.map((p) => [p.id, p.name || `PF ${p.id}`]),
);

/** Start/stop lives in the title bar — it is the one control always needed. */
function RollerControls({ state, setState, send }) {
  const rolling = !!state.rolling;
  return (
    <Button
      variant={rolling ? "danger" : "primary"}
      onClick={() => {
        send({ type: rolling ? "stop" : "start" });
        setState({ rolling: !rolling });
      }}
    >
      {rolling ? "Stop" : "Roll"}
    </Button>
  );
}

function MissionsPanel({ state, send }) {
  const note = useHoverNote();
  const missions = state.missions ?? [];

  if (!missions.length) return <Empty>Waiting for a roll</Empty>;

  return (
    <>
      <Stack gap={2} className="rl-missions">
        {missions.slice(0, MAX_MISSIONS).map((m) => (
          <MissionCard
            key={m.id}
            mission={m}
            noteBind={note.bind}
            onAccept={() => send({ type: "accept", id: m.id })}
            onPing={() => send({ type: "ping", id: m.id })}
          />
        ))}
      </Stack>
      {note.element}
    </>
  );
}

export default defineApp({
  id: "app_7069", // keeps the existing saved layout and settings
  port: 7069,
  name: "Mission Roller",
  header: RollerControls,

  settings: {
    ...Object.fromEntries(
      SLIDERS.map((s) => [s.key, s.key === "easyHard" ? 6 : 0]),
    ),

    returnItem: true,
    killTarget: true,
    useItem: true,
    findItem: true,

    autoAdjustLvlSlider: true,
    removeRolledEntries: true,
    autoAcceptMissions: true,
    showPlayfieldBounds: true,

    rollList: [],

    dbFilters: {
      canFilter: [],
      itemFilter: [],
      modFilter: [],
      statFilter: [],
      reqFilter: [],
    },

    locations: Object.fromEntries(
      MISSION_PLAYFIELDS.map((id) => [
        id,
        { active: true, x1: 0, y1: 0, x2: 9999, y2: 9999 },
      ]),
    ),
  },

  state: { rolling: false },

  messages: {
    missionResults: (d) => ({ missions: d.missions }),
    missionHit: (d) => ({ lastHit: d.item }),
  },

  // Zone ids carry no names over the wire; the panel wants them by name.
  derive: (state) => ({
    zones: state.settings?.locations
      ? Object.fromEntries(
          Object.entries(state.settings.locations).map(([id, z]) => [
            id,
            { ...z, name: ZONE_NAME[Number(id)] ?? `PF ${id}` },
          ]),
        )
      : null,
  }),

  panels: {
    missions: {
      title: ({ state }) =>
        state.missions?.length
          ? `Missions · ${state.missions.length}`
          : "Missions",
      fixed: true,
      component: MissionsPanel,
    },
    rollList: {
      title: ({ settings }) => `Roll List · ${settings.rollList?.length ?? 0}`,
      component: RollList,
    },
    browser: { title: "Finder", fixed: true, component: Browser },
    types: { title: "Mission Types", component: TypesPanel },
    behaviour: { title: "Behaviour", component: BehaviourPanel },
    sliders: { title: "Sliders", component: SlidersPanel },
    zones: { title: "Zones", component: ZonesPanel },
  },

  tabs: [
    { id: "tab-roll", label: "Roll", panels: ["missions", "rollList"] },
    { id: "tab-find", label: "Find", panels: ["browser"] },
    {
      id: "tab-cfg",
      label: "Config",
      panels: ["types", "behaviour", "sliders", "zones"],
    },
  ],
});
