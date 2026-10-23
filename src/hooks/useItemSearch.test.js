import { act, renderHook, waitFor } from "@testing-library/react";
import { DEBOUNCE_MS, useItemSearch } from "./useItemSearch";
import { getItemIcons, searchItems } from "../lib/db";
import { clearItemCache } from "../lib/itemCache";

jest.mock("../lib/db", () => ({
  searchItems: jest.fn(),
  getItemIcons: jest.fn(),
}));

/**
 * Real timers throughout. Jest's fake clock and React 19's scheduler
 * deadlock each other here — advancing the clock inside act() lets React
 * schedule more work at 0ms, which the same advance then runs, forever. The
 * debounce is 200ms, so waiting it out costs a few seconds for the suite and
 * is worth not fighting.
 */
const WAIT = DEBOUNCE_MS + 60;

const NO_FILTERS = Object.freeze({
  canFilter: [],
  itemFilter: [],
  modFilter: [],
  statFilter: [],
  reqFilter: [],
});

const item = (low_id, name) => ({
  low_id,
  name,
  members: [{ id: low_id, ql: 1 }],
});

/** A promise plus the handle to settle it, so ordering can be controlled. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const type = (result, text) =>
  act(() => {
    result.current.onQueryChange(text);
  });

const afterDebounce = () =>
  act(() => new Promise((r) => setTimeout(r, WAIT)));

beforeEach(() => {
  clearItemCache();
  searchItems.mockReset();
  getItemIcons.mockReset();
  getItemIcons.mockResolvedValue({});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

describe("useItemSearch", () => {
  it("does not search until typing pauses", async () => {
    searchItems.mockResolvedValue([]);
    const { result } = renderHook(() => useItemSearch(NO_FILTERS));

    type(result, "a");
    type(result, "ar");
    type(result, "arm");
    expect(searchItems).not.toHaveBeenCalled();

    await afterDebounce();
    expect(searchItems).toHaveBeenCalledTimes(1);
    expect(searchItems.mock.calls[0][0]).toMatchObject({ name: "arm" });
  });

  it("does not search for a blank box", async () => {
    const { result } = renderHook(() => useItemSearch(NO_FILTERS));

    type(result, "   ");
    await afterDebounce();

    expect(searchItems).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  it("lists the chains holding the given ids for a blank box", async () => {
    searchItems.mockResolvedValue([]);
    const memberIds = [152740, 199398];
    renderHook(() => useItemSearch({ ...NO_FILTERS, memberIds }));

    await afterDebounce();
    expect(searchItems).toHaveBeenCalledTimes(1);
    expect(searchItems.mock.calls[0][0]).toMatchObject({ name: "", memberIds });
  });

  it("sends the ids along with a typed search", async () => {
    searchItems.mockResolvedValue([]);
    const memberIds = [152740];
    const { result } = renderHook(() =>
      useItemSearch({ ...NO_FILTERS, memberIds }),
    );

    await afterDebounce();
    type(result, "blade");
    await afterDebounce();
    expect(searchItems.mock.calls.at(-1)[0]).toMatchObject({ name: "blade", memberIds });
  });

  it("keeps the newest answer when an older one arrives late", async () => {
    const slow = deferred();
    const fast = deferred();
    searchItems
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(() => fast.promise);

    const { result } = renderHook(() => useItemSearch(NO_FILTERS));

    type(result, "ar");
    await afterDebounce();
    type(result, "armor");
    await afterDebounce();

    // The second search answers first; then the first finally replies.
    await act(async () => {
      fast.resolve([item(2, "armor")]);
    });
    await act(async () => {
      slow.resolve([item(1, "ar")]);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.results.map((r) => r.name)).toEqual(["armor"]);
  });

  it("clears the list at once when the box is emptied", async () => {
    searchItems.mockResolvedValue([item(1, "armor")]);
    const { result } = renderHook(() => useItemSearch(NO_FILTERS));

    type(result, "armor");
    await afterDebounce();
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    type(result, "");
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("reports a failure instead of an empty list with no explanation", async () => {
    searchItems.mockRejectedValue(new Error("service down"));
    const { result } = renderHook(() => useItemSearch(NO_FILTERS));

    type(result, "armor");
    await afterDebounce();

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.loading).toBe(false);
    expect(result.current.results).toEqual([]);
  });

  it("clears a previous failure when a later search succeeds", async () => {
    searchItems
      .mockRejectedValueOnce(new Error("service down"))
      .mockResolvedValueOnce([item(1, "armor")]);

    const { result } = renderHook(() => useItemSearch(NO_FILTERS));

    type(result, "armor");
    await afterDebounce();
    await waitFor(() => expect(result.current.error).toBeTruthy());

    type(result, "armour");
    await afterDebounce();
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.error).toBeNull();
  });

  it("sends the chosen flags as a bitmask, not as objects", async () => {
    searchItems.mockResolvedValue([]);
    const { result } = renderHook(() =>
      useItemSearch({ ...NO_FILTERS, canFilter: ["Carry", "Wear"] }),
    );

    type(result, "ring");
    await afterDebounce();

    // Carry is bit 0, Wear is bit 2.
    expect(searchItems.mock.calls[0][0].canBits).toBe(0b101);
  });

  it("re-runs when a filter changes, without the box being touched", async () => {
    searchItems.mockResolvedValue([]);
    const { result, rerender } = renderHook((props) => useItemSearch(props), {
      initialProps: { ...NO_FILTERS },
    });

    type(result, "ring");
    await afterDebounce();
    expect(searchItems).toHaveBeenCalledTimes(1);

    rerender({ ...NO_FILTERS, canFilter: ["Carry"] });
    await afterDebounce();

    expect(searchItems).toHaveBeenCalledTimes(2);
    expect(searchItems.mock.calls[1][0].canBits).toBe(1);
  });

  it("settles when the caller rebuilds the filter arrays every render", async () => {
    searchItems.mockResolvedValue([]);
    let renders = 0;

    // Fresh arrays on every render with identical contents. Comparing the
    // filters by identity here meant the empty-query branch re-rendered
    // itself forever.
    const { result } = renderHook(() => {
      renders++;
      return useItemSearch({
        canFilter: [],
        itemFilter: [],
        modFilter: [],
        statFilter: [],
        reqFilter: [],
      });
    });

    await afterDebounce();

    expect(renders).toBeLessThan(10);
    expect(result.current.results).toEqual([]);
    expect(searchItems).not.toHaveBeenCalled();
  });

  it("does not re-search when a filter array is rebuilt with the same contents", async () => {
    searchItems.mockResolvedValue([]);
    const { result, rerender } = renderHook((props) => useItemSearch(props), {
      initialProps: { ...NO_FILTERS, canFilter: ["Carry"] },
    });

    type(result, "ring");
    await afterDebounce();
    expect(searchItems).toHaveBeenCalledTimes(1);

    rerender({ ...NO_FILTERS, canFilter: ["Carry"] });
    await afterDebounce();

    expect(searchItems).toHaveBeenCalledTimes(1);
  });

  it("attaches icons to the item and to each of its templates", async () => {
    searchItems.mockResolvedValue([
      {
        low_id: 1,
        name: "ring",
        members: [
          { id: 1, ql: 1 },
          { id: 2, ql: 200 },
        ],
      },
    ]);
    getItemIcons.mockResolvedValue({ 1: "data:one", 2: "data:two" });

    const { result } = renderHook(() => useItemSearch(NO_FILTERS));
    type(result, "ring");
    await afterDebounce();

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0].iconSrc).toBe("data:one");
    expect(result.current.results[0].members.map((m) => m.iconSrc)).toEqual([
      "data:one",
      "data:two",
    ]);
  });
});
