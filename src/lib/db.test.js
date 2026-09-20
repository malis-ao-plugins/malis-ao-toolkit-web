import {
  ItemDbError,
  findBracketingTemplates,
  getIcon,
  getItemIcons,
  getItemNames,
  searchItems,
} from "./db";

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const status = (code) => ({
  ok: false,
  status: code,
  json: async () => ({}),
});

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  delete global.fetch;
});

const bodyOf = (call = 0) => JSON.parse(global.fetch.mock.calls[call][1].body);

describe("searchItems", () => {
  it("sends the flag filters the caller asked for", async () => {
    global.fetch.mockResolvedValue(ok([]));
    await searchItems({ name: "ring", canBits: 4, itemBits: 8 });

    expect(bodyOf()).toMatchObject({ name: "ring", canBits: 4, itemBits: 8 });
  });

  it("omits an empty filter rather than sending a zero", async () => {
    global.fetch.mockResolvedValue(ok([]));
    await searchItems({ name: "ring", canBits: 0, itemBits: 0 });

    const body = bodyOf();
    expect(body.canBits).toBeUndefined();
    expect(body.itemBits).toBeUndefined();
  });

  it("omits empty id lists so the service does not read them as 'match none'", async () => {
    global.fetch.mockResolvedValue(ok([]));
    await searchItems({ name: "x", ids: [], idPairs: [] });

    const body = bodyOf();
    expect(body.ids).toBeUndefined();
    expect(body.idPairs).toBeUndefined();
  });

  it("parses the members string the service sends", async () => {
    global.fetch.mockResolvedValue(
      ok([{ low_id: 1, members: JSON.stringify([{ id: 1, ql: 1 }]) }]),
    );

    const [item] = await searchItems({ name: "x" });
    expect(item.members).toEqual([{ id: 1, ql: 1 }]);
  });

  it("accepts members that already arrive as an array", async () => {
    global.fetch.mockResolvedValue(ok([{ low_id: 1, members: [{ id: 1, ql: 1 }] }]));

    const [item] = await searchItems({ name: "x" });
    expect(item.members).toEqual([{ id: 1, ql: 1 }]);
  });

  it("yields an empty member list rather than throwing on a broken one", async () => {
    global.fetch.mockResolvedValue(ok([{ low_id: 1, members: "not json" }]));

    const [item] = await searchItems({ name: "x" });
    expect(item.members).toEqual([]);
  });
});

describe("error handling", () => {
  it("reports an unreachable service as an ItemDbError", async () => {
    global.fetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(searchItems({ name: "x" })).rejects.toThrow(ItemDbError);
    await expect(searchItems({ name: "x" })).rejects.toThrow(/unreachable/);
  });

  it("reports an HTTP error with its status, not a JSON parse failure", async () => {
    global.fetch.mockResolvedValue(status(500));

    await expect(searchItems({ name: "x" })).rejects.toThrow(/returned 500/);
  });

  it("reports a malformed body as such", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });

    await expect(searchItems({ name: "x" })).rejects.toThrow(/malformed JSON/);
  });
});

describe("icons and names", () => {
  it("asks for nothing when no id is usable", async () => {
    await expect(getItemIcons([0, -1, null, undefined, 1.5])).resolves.toEqual({});
    await expect(getItemNames([])).resolves.toEqual({});
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("drops unusable ids from a request that has usable ones too", async () => {
    global.fetch.mockResolvedValue(ok([]));
    await getItemIcons([1, 0, 2, null]);

    expect(global.fetch.mock.calls[0][0]).toContain("ids=1,2");
  });

  it("turns icon data into a data URL and a missing icon into null", async () => {
    global.fetch.mockResolvedValue(
      ok([
        { item_id: 1, iconData: "QUJD" },
        { item_id: 2, iconData: null },
      ]),
    );

    expect(await getItemIcons([1, 2])).toEqual({
      1: "data:image/png;base64,QUJD",
      2: null,
    });
  });

  it("answers null for a single missing icon instead of raising", async () => {
    global.fetch.mockResolvedValue(status(404));
    await expect(getIcon(5)).resolves.toBeNull();
  });

  it("does not call out at all for an invalid icon id", async () => {
    await expect(getIcon(0)).resolves.toBeNull();
    await expect(getIcon(null)).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("findBracketingTemplates", () => {
  const members = [
    { id: 1, ql: 1 },
    { id: 2, ql: 100 },
    { id: 3, ql: 200 },
  ];

  it("answers the same template twice for an exact QL", () => {
    expect(findBracketingTemplates(members, 100)).toEqual({
      low: { id: 2, ql: 100 },
      high: { id: 2, ql: 100 },
    });
  });

  it("brackets a QL between two templates", () => {
    expect(findBracketingTemplates(members, 150)).toEqual({
      low: { id: 2, ql: 100 },
      high: { id: 3, ql: 200 },
    });
  });

  it("clamps below the lowest and above the highest", () => {
    expect(findBracketingTemplates(members, 0).low.ql).toBe(1);
    expect(findBracketingTemplates(members, 999).high.ql).toBe(200);
  });

  it("does not depend on the input being sorted", () => {
    const shuffled = [members[2], members[0], members[1]];
    expect(findBracketingTemplates(shuffled, 150)).toEqual({
      low: { id: 2, ql: 100 },
      high: { id: 3, ql: 200 },
    });
  });

  it("leaves the caller's array alone", () => {
    const input = [members[2], members[0]];
    findBracketingTemplates(input, 50);
    expect(input[0].ql).toBe(200);
  });
});
