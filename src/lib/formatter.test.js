/**
 * Characterisation tests for the tooltip formatter.
 *
 * These pin down what the formatter does today, quirks included, so the
 * refactor of its 175-line dispatch chain can be shown not to have changed
 * any output. They assert on behaviour a user can see in a tooltip — a label
 * and a value — not on the shape of the code that produces it.
 */
import {
  formatCriteriaGroup,
  formatDuration,
  formatMods,
  formatReq,
  formatReqValue,
  formatReqs,
  formatStats,
  getEquipSlot,
  getFlags,
  getHash,
  getSpecials,
} from "./formatter";
import { FunctionType, StatId } from "./enums";

describe("formatDuration", () => {
  it("renders whole hours, minutes and seconds from centisecond ticks", () => {
    expect(formatDuration(360000)).toBe("1hr");
    expect(formatDuration(12345)).toBe("2m 3s");
  });

  it("never renders an empty string", () => {
    expect(formatDuration(0)).toBe("0s");
  });
});

describe("formatReqValue", () => {
  // Operator 2 is "greater than", which the client displays as the first
  // value that actually passes.
  it("bumps a strict lower bound to the first passing value", () => {
    expect(formatReqValue(2, 10)).toBe(11);
  });

  it("leaves every other operator alone", () => {
    expect(formatReqValue(1, 10)).toBe(10);
    expect(formatReqValue(107, 10)).toBe(10);
  });
});

describe("formatReq", () => {
  it("names the skill and renders operator plus value", () => {
    expect(formatReq({ stat: StatId.Agility, operator: 2, value: 100 })).toEqual(
      { label: "Agility", value: "from 101" },
    );
  });

  it("falls back to the raw id for a stat it has no name for", () => {
    expect(formatReq({ stat: 999999, operator: 2, value: 5 })).toEqual({
      label: "Stat 999999",
      value: "from 6",
    });
  });

  it("routes a stat with its own handler away from the generic path", () => {
    expect(formatReq({ stat: StatId.Profession, operator: 0, value: 6 })).toEqual(
      { label: "Profession", value: "Adventurer" },
    );
  });

  it("resolves an item name for the operators that carry an item id", () => {
    const req = formatReq({ stat: 0, operator: 101, value: 12345 });
    expect(req.resolveItemName).toBe(true);
    expect(req.value).toBe(12345);
  });
});

describe("getHash", () => {
  it("reads a 32-bit value back as its four characters", () => {
    expect(getHash(0x41424344)).toBe("ABCD");
  });
});

describe("flag decoding", () => {
  it("returns nothing for a zero bitfield", () => {
    expect(getFlags(0)).toEqual([]);
    expect(getSpecials(0)).toEqual([]);
  });

  it("returns null when the item class has no slot group", () => {
    expect(getEquipSlot(99, 1)).toBeNull();
  });
});

describe("requirement trees", () => {
  const andRows = [
    { stat: StatId.Agility, operator: 2, value: 100, outer_action_type: 0 },
    { stat: StatId.Stamina, operator: 2, value: 50, outer_action_type: 0 },
    { stat: 0, operator: 4, value: 0, outer_action_type: 0 },
  ];

  it("joins two requirements with the connector the operator names", () => {
    expect(formatCriteriaGroup(andRows)).toEqual([
      { label: "Agility", value: "from 101" },
      { connector: "and" },
      { label: "Stamina", value: "from 51" },
    ]);
  });

  it("groups by action and by source", () => {
    expect(formatReqs(andRows)).toEqual({
      Any: {
        "On Self": [
          { label: "Agility", value: "from 101" },
          { connector: "and" },
          { label: "Stamina", value: "from 51" },
        ],
      },
    });
  });

  it("survives a connector with nothing to connect", () => {
    expect(formatCriteriaGroup([{ stat: 0, operator: 4, value: 0 }])).toEqual([]);
    expect(formatReqs([])).toEqual({});
  });

  it("keeps every requirement when the stream never combines them", () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});

    // Two operands and no connector: the walker used to return the first
    // group and drop the rest, so the tooltip showed one of two requirements.
    const reqs = formatCriteriaGroup([
      { stat: StatId.Agility, operator: 2, value: 100 },
      { stat: StatId.Stamina, operator: 2, value: 50 },
    ]);

    expect(reqs).toEqual([
      { label: "Agility", value: "from 101" },
      { label: "Stamina", value: "from 51" },
    ]);

    console.warn.mockRestore();
  });

  it("negates the requirement a NOT applies to", () => {
    const reqs = formatCriteriaGroup([
      { stat: StatId.Agility, operator: 2, value: 100 },
      { stat: 0, operator: 42, value: 0 },
    ]);
    expect(reqs[0].negated).toBe(true);
  });

  it("switches source when an operator says the rows describe the target", () => {
    const reqs = formatReqs([
      { stat: 0, operator: 18, value: 0, outer_action_type: 0 },
      { stat: StatId.Agility, operator: 2, value: 100, outer_action_type: 0 },
    ]);
    expect(Object.keys(reqs.Any)).toEqual(["On Target"]);
  });
});

describe("formatMods", () => {
  it("returns nothing for no rows, and tolerates missing tables", () => {
    expect(formatMods([], [], [])).toEqual({});
    expect(formatMods(null, null, null)).toEqual({});
  });

  it("groups a stat modifier under its event and target, signed", () => {
    const mods = formatMods(
      [
        { event_type: 0, function_type: FunctionType.ModifyStat, list_index: 0, op_index: 0, operator: 0, value: StatId.Agility, value_type: "num" },
        { event_type: 0, function_type: FunctionType.ModifyStat, list_index: 0, op_index: 0, operator: 39, value: 12, value_type: "num" },
      ],
      [],
      [],
    );

    const lines = Object.values(Object.values(mods)[0])[0];
    expect(lines).toEqual([
      expect.objectContaining({ label: "Agility", value: "+12" }),
    ]);
  });

  it("signs a negative modifier without doubling the minus", () => {
    const mods = formatMods(
      [
        { event_type: 0, function_type: FunctionType.ModifyStat, list_index: 0, op_index: 0, operator: 0, value: StatId.Agility, value_type: "num" },
        { event_type: 0, function_type: FunctionType.ModifyStat, list_index: 0, op_index: 0, operator: 39, value: -12, value_type: "num" },
      ],
      [],
      [],
    );

    const lines = Object.values(Object.values(mods)[0])[0];
    expect(lines[0].value).toBe("-12");
  });
});

describe("formatStats", () => {
  it("returns empty sections for an item with no stats", () => {
    expect(formatStats([], [])).toEqual({ stats: [], flags: [] });
  });

  it("reports a beneficial-skill cap of zero, which is a real cap", () => {
    // `??` binds looser than `!=`, so the old condition tested
    // `sv(AMSCap) ?? (sv(SISCap) != null)` and a cap of 0 vanished.
    expect(formatStats([{ stat_id: StatId.AMSCap, value: 0 }], []).stats).toEqual(
      [{ label: "Max beneficial skill", value: 0, section: "Combat" }],
    );
  });

  it("prefers AMSCap over SISCap when both are present", () => {
    const { stats } = formatStats(
      [
        { stat_id: StatId.AMSCap, value: 5 },
        { stat_id: StatId.SISCap, value: 7 },
      ],
      [],
    );
    expect(stats).toEqual([
      { label: "Max beneficial skill", value: 5, section: "Combat" },
    ]);
  });

  it("reports the beneficial-skill cap from either stat", () => {
    expect(formatStats([{ stat_id: StatId.AMSCap, value: 5 }], []).stats).toEqual([
      { label: "Max beneficial skill", value: 5, section: "Combat" },
    ]);
    expect(formatStats([{ stat_id: StatId.SISCap, value: 7 }], []).stats).toEqual([
      { label: "Max beneficial skill", value: 7, section: "Combat" },
    ]);
  });

  it("labels the level stat QL on an item and NCU on a nano", () => {
    const item = formatStats([{ stat_id: StatId.Level, value: 200 }], []);
    expect(item.stats[0]).toEqual({ label: "QL", value: 200 });

    const nano = formatStats(
      [
        { stat_id: StatId.Level, value: 200 },
        { stat_id: StatId.NanoStrain, value: 1 },
        { stat_id: StatId.School, value: 1 },
      ],
      [],
    );
    expect(nano.stats[0].label).toBe("NCU");
  });

  it("collects attack and defence skill checks into one line each", () => {
    const { stats } = formatStats(
      [],
      [
        { skill_check: 0xc, stat_id: StatId.Agility, value: 60 },
        { skill_check: 0xc, stat_id: StatId.Stamina, value: 40 },
        { skill_check: 0xd, stat_id: StatId.Agility, value: 100 },
      ],
    );
    expect(stats).toEqual([
      { label: "Attack skills", value: "Agility 60% & Stamina 40%", section: "Combat" },
      { label: "Defence skills", value: "Agility 100%", section: "Combat" },
    ]);
  });
});
