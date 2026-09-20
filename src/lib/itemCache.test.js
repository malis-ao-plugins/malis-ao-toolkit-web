import { clearItemCache, iconsOf, membersOf, namesOf } from "./itemCache";
import { getItemIcons, getItemMembers, getItemNames } from "./db";

jest.mock("./db", () => ({
  getItemMembers: jest.fn(),
  getItemNames: jest.fn(),
  getItemIcons: jest.fn(),
}));

beforeEach(() => {
  clearItemCache();
  getItemMembers.mockReset();
  getItemNames.mockReset();
  getItemIcons.mockReset();
});

/** Answer a names/icons batch from a table, echoing only what was asked. */
const from = (table) => (ids) =>
  Promise.resolve(Object.fromEntries(ids.map((id) => [id, table[id] ?? null])));

describe("membersOf", () => {
  it("fetches a family once and serves it from memory after", async () => {
    getItemMembers.mockResolvedValue([{ id: 1, ql: 1 }]);

    expect(await membersOf(1)).toEqual([{ id: 1, ql: 1 }]);
    expect(await membersOf(1)).toEqual([{ id: 1, ql: 1 }]);
    expect(getItemMembers).toHaveBeenCalledTimes(1);
  });

  it("joins a request already in flight rather than starting another", async () => {
    getItemMembers.mockResolvedValue([{ id: 1, ql: 1 }]);

    await Promise.all([membersOf(1), membersOf(1), membersOf(1)]);
    expect(getItemMembers).toHaveBeenCalledTimes(1);
  });

  it("drops duplicate templates the service may repeat", async () => {
    getItemMembers.mockResolvedValue([
      { id: 1, ql: 1 },
      { id: 1, ql: 1 },
      { id: 2, ql: 200 },
    ]);

    expect(await membersOf(1)).toEqual([
      { id: 1, ql: 1 },
      { id: 2, ql: 200 },
    ]);
  });

  it("does not cache a failure", async () => {
    getItemMembers
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce([{ id: 1, ql: 1 }]);

    await expect(membersOf(1)).rejects.toThrow("down");
    expect(await membersOf(1)).toEqual([{ id: 1, ql: 1 }]);
    expect(getItemMembers).toHaveBeenCalledTimes(2);
  });
});

describe("namesOf", () => {
  it("asks only for the ids it does not already know", async () => {
    getItemNames.mockImplementation(from({ 1: "one", 2: "two", 3: "three" }));

    expect(await namesOf([1, 2])).toEqual({ 1: "one", 2: "two" });
    expect(await namesOf([2, 3])).toEqual({ 2: "two", 3: "three" });

    expect(getItemNames.mock.calls.map((c) => c[0])).toEqual([[1, 2], [3]]);
  });

  it("answers from memory alone without any request", async () => {
    getItemNames.mockImplementation(from({ 1: "one" }));

    await namesOf([1]);
    getItemNames.mockClear();

    expect(await namesOf([1])).toEqual({ 1: "one" });
    expect(getItemNames).not.toHaveBeenCalled();
  });

  it("coalesces overlapping batches into one request", async () => {
    getItemNames.mockImplementation(from({ 1: "one", 2: "two" }));

    const [a, b] = await Promise.all([namesOf([1, 2]), namesOf([2, 1])]);

    expect(a).toEqual({ 1: "one", 2: "two" });
    expect(b).toEqual({ 1: "one", 2: "two" });
    expect(getItemNames).toHaveBeenCalledTimes(1);
  });

  it("remembers that an id has no name, and does not re-ask", async () => {
    getItemNames.mockImplementation(from({}));

    expect(await namesOf([7])).toEqual({ 7: null });
    expect(await namesOf([7])).toEqual({ 7: null });
    expect(getItemNames).toHaveBeenCalledTimes(1);
  });

  it("ignores ids the service could not use anyway", async () => {
    expect(await namesOf([])).toEqual({});
    expect(await namesOf([0, -1, null, 1.5])).toEqual({});
    expect(getItemNames).not.toHaveBeenCalled();
  });

  it("de-duplicates within a single call", async () => {
    getItemNames.mockImplementation(from({ 1: "one" }));

    await namesOf([1, 1, 1]);
    expect(getItemNames).toHaveBeenCalledWith([1]);
  });

  it("does not cache a failed batch", async () => {
    getItemNames
      .mockRejectedValueOnce(new Error("down"))
      .mockImplementationOnce(from({ 1: "one" }));

    await expect(namesOf([1])).rejects.toThrow("down");
    expect(await namesOf([1])).toEqual({ 1: "one" });
  });
});

describe("iconsOf", () => {
  it("batches and caches the same way names do", async () => {
    getItemIcons.mockImplementation(from({ 1: "data:one" }));

    expect(await iconsOf([1])).toEqual({ 1: "data:one" });
    expect(await iconsOf([1])).toEqual({ 1: "data:one" });
    expect(getItemIcons).toHaveBeenCalledTimes(1);
  });

  it("keeps its own store, separate from names", async () => {
    getItemNames.mockImplementation(from({ 1: "one" }));
    getItemIcons.mockImplementation(from({ 1: "data:one" }));

    await namesOf([1]);
    expect(await iconsOf([1])).toEqual({ 1: "data:one" });
    expect(getItemIcons).toHaveBeenCalledTimes(1);
  });
});
