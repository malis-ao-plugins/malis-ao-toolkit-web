import { BEHAVIOURS, MISSION_TYPES, SLIDERS, compact, entryKey, exact } from "./rollerData";

describe("compact", () => {
  it("shows small numbers in full, with separators", () => {
    expect(compact(0)).toBe("0");
    expect(compact(9999)).toBe((9999).toLocaleString());
  });

  it("switches to k and M so the value fits a 320px column", () => {
    expect(compact(10000)).toBe("10k");
    expect(compact(12500)).toBe("12.5k");
    expect(compact(2000000)).toBe("2M");
    // Millions keep two decimals and only strip a flat ".00", so 2.5M reads
    // "2.50M". Recorded rather than corrected: it is a deliberate-looking
    // display choice, not a defect.
    expect(compact(2500000)).toBe("2.50M");
  });

  it("renders a dash rather than NaN for a missing value", () => {
    // A hyphen, not an em dash: the atlases are latin1, and an em dash
    // would draw nothing at all.
    expect(compact(null)).toBe("-");
    expect(compact(undefined)).toBe("-");
    expect(compact(NaN)).toBe("-");
  });

  it("keeps the sign on a negative", () => {
    expect(compact(-12500)).toBe("-12.5k");
  });
});

describe("exact", () => {
  it("is empty for a missing value and grouped otherwise", () => {
    expect(exact(null)).toBe("");
    expect(exact(1234567)).toBe((1234567).toLocaleString());
  });
});

describe("entryKey", () => {
  it("identifies a roll-list entry by its ids and QL", () => {
    expect(entryKey({ ids: [1, 2], ql: 200 })).toBe("1-2@200");
  });

  it("separates two QLs of the same item", () => {
    expect(entryKey({ ids: [1, 2], ql: 200 })).not.toBe(
      entryKey({ ids: [1, 2], ql: 100 }),
    );
  });

  it("does not throw on an entry with no ids", () => {
    expect(entryKey({ ql: 1 })).toBe("@1");
  });
});

describe("the declarations the settings panels are built from", () => {
  it("gives every slider a unique settings key and a real range", () => {
    const keys = SLIDERS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of SLIDERS) expect(s.min).toBeLessThan(s.max);
  });

  it("gives every toggle a unique key", () => {
    const keys = [...MISSION_TYPES, ...BEHAVIOURS].map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
