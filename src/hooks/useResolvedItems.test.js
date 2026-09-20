import { renderHook, waitFor } from "@testing-library/react";
import { useResolvedItems } from "./useResolvedItems";
import { clearItemCache } from "../lib/itemCache";
import { getItemIcons, getItemMembers, getItemNames } from "../lib/db";

jest.mock("../lib/db", () => ({
  getItemMembers: jest.fn(),
  getItemNames: jest.fn(),
  getItemIcons: jest.fn(),
}));

const FAMILIES = {
  100: [
    { id: 100, ql: 1 },
    { id: 101, ql: 200 },
  ],
  200: [{ id: 200, ql: 50 }],
};

const NAMES = { 100: "Low Ring", 101: "High Ring", 200: "Amulet" };
const ICONS = { 100: "data:100", 101: "data:101", 200: "data:200" };

const pick = (table) => (ids) =>
  Promise.resolve(Object.fromEntries(ids.map((id) => [id, table[id] ?? null])));

beforeEach(() => {
  clearItemCache();
  getItemMembers.mockReset();
  getItemNames.mockReset();
  getItemIcons.mockReset();

  getItemMembers.mockImplementation((lowId) =>
    Promise.resolve(FAMILIES[lowId] ?? []),
  );
  getItemNames.mockImplementation(pick(NAMES));
  getItemIcons.mockImplementation(pick(ICONS));

  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

const STUBS = [
  { ids: [100, 101], ql: 200, count: 1 },
  { ids: [200], ql: 50, count: 2 },
];

describe("useResolvedItems", () => {
  it("is empty for no stubs, and asks for nothing", async () => {
    const { result } = renderHook(() => useResolvedItems([]));

    expect(result.current).toEqual([]);
    expect(getItemMembers).not.toHaveBeenCalled();
  });

  it("fills in templates, names and icons", async () => {
    const { result } = renderHook(() => useResolvedItems(STUBS));

    await waitFor(() => expect(result.current).toHaveLength(2));

    const [ring, amulet] = result.current;
    expect(ring).toMatchObject({ low_id: 100, high_id: 101, ql: 200, count: 1 });
    expect(ring.members).toEqual([
      { id: 100, ql: 1, name: "Low Ring", iconSrc: "data:100" },
      { id: 101, ql: 200, name: "High Ring", iconSrc: "data:101" },
    ]);
    expect(amulet.name).toBe("Amulet");
  });

  it("names the item after the template its QL lands on", async () => {
    const { result } = renderHook(() => useResolvedItems(STUBS));
    await waitFor(() => expect(result.current).toHaveLength(2));

    // QL 200 is the high template, not the first one in the family.
    expect(result.current[0].name).toBe("High Ring");
  });

  it("uses one batched name and icon request for the whole list", async () => {
    const { result } = renderHook(() => useResolvedItems(STUBS));
    await waitFor(() => expect(result.current).toHaveLength(2));

    // Two families, because the service has no batch endpoint for them —
    // but one request each for the names and the icons of all three ids.
    expect(getItemMembers).toHaveBeenCalledTimes(2);
    expect(getItemNames).toHaveBeenCalledTimes(1);
    expect(getItemIcons).toHaveBeenCalledTimes(1);
    expect(getItemNames.mock.calls[0][0].sort()).toEqual([100, 101, 200]);
  });

  it("asks for nothing at all the second time", async () => {
    const first = renderHook(() => useResolvedItems(STUBS));
    await waitFor(() => expect(first.result.current).toHaveLength(2));

    getItemMembers.mockClear();
    getItemNames.mockClear();
    getItemIcons.mockClear();

    const second = renderHook(() => useResolvedItems(STUBS));
    await waitFor(() => expect(second.result.current).toHaveLength(2));

    expect(getItemMembers).not.toHaveBeenCalled();
    expect(getItemNames).not.toHaveBeenCalled();
    expect(getItemIcons).not.toHaveBeenCalled();
  });

  it("does not re-fetch when the array is rebuilt with the same contents", async () => {
    const { result, rerender } = renderHook((stubs) => useResolvedItems(stubs), {
      initialProps: [...STUBS],
    });
    await waitFor(() => expect(result.current).toHaveLength(2));
    getItemMembers.mockClear();

    rerender(STUBS.map((s) => ({ ...s })));
    expect(getItemMembers).not.toHaveBeenCalled();
  });

  it("drops a stub whose family cannot be fetched, and keeps the rest", async () => {
    getItemMembers.mockImplementation((lowId) =>
      lowId === 100
        ? Promise.reject(new Error("down"))
        : Promise.resolve(FAMILIES[lowId] ?? []),
    );

    const { result } = renderHook(() => useResolvedItems(STUBS));

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].name).toBe("Amulet");
  });

  it("drops a stub whose family is empty", async () => {
    const { result } = renderHook(() =>
      useResolvedItems([{ ids: [999], ql: 1 }]),
    );

    await waitFor(() => expect(getItemMembers).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it("survives a template with no name or icon", async () => {
    getItemNames.mockImplementation(pick({}));
    getItemIcons.mockImplementation(pick({}));

    const { result } = renderHook(() =>
      useResolvedItems([{ ids: [200], ql: 50 }]),
    );

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].name).toBeNull();
    expect(result.current[0].members[0].iconSrc).toBeNull();
  });
});
