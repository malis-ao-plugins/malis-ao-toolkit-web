import { act, renderHook, waitFor } from "@testing-library/react";
import { clearTooltipCache, useItemData } from "./useItemData";
import { clearItemCache } from "../lib/itemCache";
import {
  getItemMembers,
  getItemModifierCriteria,
  getItemModifierText,
  getItemModifiers,
  getItemNames,
  getItemRequirements,
  getItemSkillChecks,
  getItemStats,
} from "../lib/db";

jest.mock("../lib/db", () => ({
  getItemStats: jest.fn(),
  getItemModifiers: jest.fn(),
  getItemModifierCriteria: jest.fn(),
  getItemModifierText: jest.fn(),
  getItemRequirements: jest.fn(),
  getItemSkillChecks: jest.fn(),
  getItemMembers: jest.fn(),
  getItemNames: jest.fn(),
  getItemIcons: jest.fn(),
  findBracketingTemplates: jest.requireActual("../lib/db").findBracketingTemplates,
}));

const ITEM = {
  low_id: 1,
  name: "Test Ring",
  members: [{ id: 1, ql: 1 }],
};

beforeEach(() => {
  clearTooltipCache();
  clearItemCache();

  for (const fn of [
    getItemModifiers,
    getItemModifierCriteria,
    getItemModifierText,
    getItemRequirements,
    getItemSkillChecks,
  ]) {
    fn.mockReset();
    fn.mockResolvedValue([]);
  }
  getItemStats.mockReset();
  getItemStats.mockResolvedValue([{ stat_id: 54, value: 200 }]);
  getItemMembers.mockReset();
  getItemMembers.mockResolvedValue([{ id: 1, ql: 1 }]);
  getItemNames.mockReset();
  getItemNames.mockResolvedValue({});

  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

const showAndSettle = async (result, item = ITEM) => {
  act(() => result.current.show(item, null));
  await waitFor(() => expect(result.current.data).not.toBeNull());
};

describe("useItemData", () => {
  it("loads an item and formats its stats", async () => {
    const { result } = renderHook(() => useItemData());
    await showAndSettle(result);

    expect(result.current.data.name).toBe("Test Ring");
    expect(result.current.data.stats).toEqual([{ label: "QL", value: 200 }]);
  });

  it("does not fetch for a hover that ends before the delay", async () => {
    const { result } = renderHook(() => useItemData());

    act(() => result.current.show(ITEM, null));
    act(() => result.current.hide());
    await new Promise((r) => setTimeout(r, 200));

    expect(getItemStats).not.toHaveBeenCalled();
  });

  it("shares its cache between rows, instead of one cache each", async () => {
    const first = renderHook(() => useItemData());
    await showAndSettle(first.result);
    expect(getItemStats).toHaveBeenCalledTimes(1);

    // A second row hovering the same item used to fetch the whole tooltip
    // again, because the cache lived inside the hook.
    const second = renderHook(() => useItemData());
    await showAndSettle(second.result);

    expect(getItemStats).toHaveBeenCalledTimes(1);
    expect(second.result.current.data.name).toBe("Test Ring");
  });

  it("clears what it is showing when hidden", async () => {
    const { result } = renderHook(() => useItemData());
    await showAndSettle(result);

    act(() => result.current.hide());
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("reports no data rather than throwing when the service fails", async () => {
    getItemStats.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useItemData());

    act(() => result.current.show(ITEM, null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
  });
});
