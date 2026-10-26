import { hasFilters, matchesFilters, parseQuery, parseRange } from "./searchQuery";

describe("parseRange", () => {
  it.each([
    ["200", { min: 200, max: 200 }],
    ["100-200", { min: 100, max: 200 }],
    ["200-100", { min: 100, max: 200 }],
    ["200+", { min: 200, max: Infinity }],
    ["200-", { min: -Infinity, max: 200 }],
    [">=200", { min: 200, max: Infinity }],
    ["<=200", { min: -Infinity, max: 200 }],
    [">200", { min: 201, max: Infinity }],
    ["<200", { min: -Infinity, max: 199 }],
  ])("reads %s", (text, range) => {
    expect(parseRange(text)).toEqual(range);
  });

  it("rejects what is not a number range", () => {
    expect(parseRange("high")).toBeNull();
    expect(parseRange("1-2-3")).toBeNull();
  });
});

describe("parseQuery", () => {
  it("keeps plain words as the name", () => {
    const q = parseQuery("wrist  datapad");
    expect(q.name).toBe("wrist datapad");
    expect(hasFilters(q)).toBe(false);
  });

  it("takes filters out of the name", () => {
    const q = parseQuery("pad ql:200+ loc:bank char:Aag id:268702");
    expect(q.name).toBe("pad");
    expect(q.ql).toEqual([{ min: 200, max: Infinity }]);
    expect(q.id).toEqual([{ min: 268702, max: 268702 }]);
    expect(q.loc).toEqual(["bank"]);
    expect(q.char).toEqual(["aag"]);
  });

  it("treats in: as loc:", () => {
    expect(parseQuery("in:test").loc).toEqual(["test"]);
  });

  it("keeps quoted words together", () => {
    const q = parseQuery('"wrist datapad" loc:"large backpack"');
    expect(q.name).toBe("wrist datapad");
    expect(q.loc).toEqual(["large backpack"]);
  });

  it("reads a minus as leaving out", () => {
    const q = parseQuery("pad -broken -loc:bank -char:doc");
    expect(q.name).toBe("pad");
    expect(q.exclude).toEqual(["broken"]);
    expect(q.notLoc).toEqual(["bank"]);
    expect(q.notChar).toEqual(["doc"]);
  });

  it("leaves an unknown key, or a range that does not parse, in the name", () => {
    expect(parseQuery("ammo:bullets").name).toBe("ammo:bullets");
    expect(parseQuery("ql:high").name).toBe("ql:high");
  });

  it("is empty for an empty box", () => {
    const q = parseQuery("");
    expect(q.name).toBe("");
    expect(hasFilters(q)).toBe(false);
  });
});

describe("matchesFilters", () => {
  const row = {
    name: "Wrist Datapad",
    ql: 150,
    low_id: 268702,
    members: [{ id: 268702 }],
    locationName: "Test",
    locationParent: "Inventory",
    charName: "Aagent",
  };

  const passes = (text) => matchesFilters(row, parseQuery(text));

  it("passes everything with no filters", () => {
    expect(passes("anything at all")).toBe(true);
  });

  it("filters by QL", () => {
    expect(passes("ql:100-200")).toBe(true);
    expect(passes("ql:200+")).toBe(false);
    expect(passes("ql:150")).toBe(true);
  });

  it("filters by location, including the container it sits in", () => {
    expect(passes("loc:test")).toBe(true);
    expect(passes("loc:inv")).toBe(true);
    expect(passes("loc:bank")).toBe(false);
    expect(passes("-loc:bank")).toBe(true);
    expect(passes("-loc:inv")).toBe(false);
  });

  it("filters by character", () => {
    expect(passes("char:aag")).toBe(true);
    expect(passes("char:doc")).toBe(false);
    expect(passes("-char:aag")).toBe(false);
  });

  it("filters by id", () => {
    expect(passes("id:268702")).toBe(true);
    expect(passes("id:1-10")).toBe(false);
  });

  it("leaves out names with an excluded word", () => {
    expect(passes("-datapad")).toBe(false);
    expect(passes("-broken")).toBe(true);
  });

  it("narrows further when a filter repeats", () => {
    expect(passes("ql:100+ ql:140-")).toBe(false);
    expect(passes("ql:100+ ql:160-")).toBe(true);
  });
});
