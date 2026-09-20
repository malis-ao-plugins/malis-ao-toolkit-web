/**
 * Characterisation tests for QL interpolation.
 *
 * An item family is stored as a handful of templates at fixed QLs; everything
 * between them is interpolated. Getting this wrong shows up as a tooltip that
 * quietly lies about a weapon's damage, so the edges are pinned down here.
 */
import {
  interpolateMods,
  interpolateReqs,
  interpolateStats,
  lerp,
} from "./interpolate";

describe("lerp", () => {
  it("returns the endpoints exactly, without arithmetic", () => {
    expect(lerp(10, 20, 1, 1, 200)).toBe(10);
    expect(lerp(10, 20, 200, 1, 200)).toBe(20);
  });

  it("rounds to a whole number in between", () => {
    expect(lerp(0, 100, 50, 0, 100)).toBe(50);
    expect(lerp(0, 3, 50, 0, 100)).toBe(2); // 1.5 rounds up
  });

  it("truncates a fractional QL before interpolating", () => {
    expect(lerp(0, 100, 50.9, 0, 100)).toBe(50);
  });
});

describe("interpolateStats", () => {
  it("pairs low and high by stat id, not by position", () => {
    const low = [
      { stat_id: 1, value: 0 },
      { stat_id: 2, value: 100 },
    ];
    const high = [
      { stat_id: 2, value: 200 },
      { stat_id: 1, value: 10 },
    ];
    expect(interpolateStats(low, high, 50, 0, 100)).toEqual([
      { stat_id: 1, value: 5 },
      { stat_id: 2, value: 150 },
    ]);
  });

  it("passes a stat through when the high template has no counterpart", () => {
    const low = [{ stat_id: 7, value: 42 }];
    expect(interpolateStats(low, [], 50, 0, 100)).toEqual(low);
  });
});

describe("interpolateMods", () => {
  const key = { event_type: 1, function_type: 2, list_index: 0, operator: 39 };

  it("interpolates a numeric modifier against its counterpart", () => {
    const low = [{ ...key, value_type: "num", value: 0 }];
    const high = [{ ...key, value_type: "num", value: 100 }];
    expect(interpolateMods(low, high, 25, 0, 100)[0].value).toBe(25);
  });

  it("leaves non-numeric modifiers untouched", () => {
    const low = [{ ...key, value_type: "text", value: "Cast" }];
    const high = [{ ...key, value_type: "text", value: "Cast" }];
    expect(interpolateMods(low, high, 50, 0, 100)[0].value).toBe("Cast");
  });

  it("passes a modifier through when the high template lacks it", () => {
    const low = [{ ...key, value_type: "num", value: 5 }];
    expect(interpolateMods(low, [], 50, 0, 100)[0].value).toBe(5);
  });
});

describe("interpolateReqs", () => {
  it("interpolates a requirement against its counterpart", () => {
    const low = [{ stat: 17, operator: 2, value: 0 }];
    const high = [{ stat: 17, operator: 2, value: 100 }];
    expect(interpolateReqs(low, high, 25, 0, 100)[0].value).toBe(25);
  });

  it("passes a requirement through when there is no counterpart", () => {
    const low = [{ stat: 17, operator: 2, value: 5 }];
    expect(interpolateReqs(low, [], 50, 0, 100)[0].value).toBe(5);
  });

  it("pairs by the requirement, not by position", () => {
    // Same two requirements, reversed. Pairing by index interpolated Agility
    // against Stamina and produced a number the item does not have.
    const low = [
      { stat: 17, operator: 2, value: 0 },
      { stat: 18, operator: 2, value: 1000 },
    ];
    const high = [
      { stat: 18, operator: 2, value: 2000 },
      { stat: 17, operator: 2, value: 100 },
    ];

    expect(interpolateReqs(low, high, 50, 0, 100)).toEqual([
      { stat: 17, operator: 2, value: 50 },
      { stat: 18, operator: 2, value: 1500 },
    ]);
  });

  it("does not shift every later row when the high template has an extra", () => {
    const low = [{ stat: 17, operator: 2, value: 0 }];
    const high = [
      { stat: 99, operator: 2, value: 999 },
      { stat: 17, operator: 2, value: 100 },
    ];

    expect(interpolateReqs(low, high, 50, 0, 100)[0].value).toBe(50);
  });

  it("keeps the same stat under two operators apart", () => {
    const low = [
      { stat: 17, operator: 2, value: 0 },
      { stat: 17, operator: 1, value: 0 },
    ];
    const high = [
      { stat: 17, operator: 1, value: 10 },
      { stat: 17, operator: 2, value: 100 },
    ];

    expect(interpolateReqs(low, high, 50, 0, 100).map((r) => r.value)).toEqual([
      50, 5,
    ]);
  });

  it("pairs repeats of one key in the order they appear", () => {
    const low = [
      { stat: 17, operator: 2, value: 0 },
      { stat: 17, operator: 2, value: 0 },
    ];
    const high = [
      { stat: 17, operator: 2, value: 100 },
      { stat: 17, operator: 2, value: 200 },
    ];

    expect(interpolateReqs(low, high, 50, 0, 100).map((r) => r.value)).toEqual([
      50, 100,
    ]);
  });

  it("keeps requirements of different actions apart", () => {
    const low = [
      { outer_action_type: 1, stat: 17, operator: 2, value: 0 },
      { outer_action_type: 2, stat: 17, operator: 2, value: 0 },
    ];
    const high = [
      { outer_action_type: 2, stat: 17, operator: 2, value: 200 },
      { outer_action_type: 1, stat: 17, operator: 2, value: 100 },
    ];

    expect(interpolateReqs(low, high, 50, 0, 100).map((r) => r.value)).toEqual([
      50, 100,
    ]);
  });
});

describe("resilience", () => {
  it("returns an empty list for missing input rather than throwing", () => {
    expect(interpolateReqs(undefined, undefined, 50, 0, 100)).toEqual([]);
    expect(interpolateMods(null, null, 50, 0, 100)).toEqual([]);
    expect(interpolateStats([], null, 50, 0, 100)).toEqual([]);
  });

  it("survives a service answering with the wrong shape entirely", () => {
    // A stats endpoint that returns a record about the item instead of its
    // rows. Iterating that threw straight out of a hover.
    const low = [{ stat_id: 1, value: 5 }];
    expect(interpolateStats(low, { id: 1, description: "x" }, 50, 0, 100)).toEqual(low);
    expect(interpolateStats({ id: 1 }, low, 50, 0, 100)).toEqual([]);
  });

  it("leaves a row whose counterpart has no value", () => {
    const low = [{ stat_id: 1, value: 5 }];
    const high = [{ stat_id: 1, value: null }];
    expect(interpolateStats(low, high, 50, 0, 100)[0].value).toBe(5);
  });
});
