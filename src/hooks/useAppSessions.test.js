import { act, renderHook } from "@testing-library/react";
import { ALL, HUB_URL, useAppSessions, viewState } from "./useAppSessions";

/** Minimal stand-in for the browser socket the hook opens to the hub. */
class FakeSocket {
  static instances = [];
  static OPEN = 1;

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeSocket.instances.push(this);
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  deliver(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const KEY = "appState_app_1";

const config = (overrides = {}) => ({
  id: "app_1",
  port: 7001,
  initialState: () => ({ settings: { volume: 1 }, rolling: false }),
  handleMessage: (data) =>
    data.type === "hit" ? { lastHit: data.item, seen: data.item } : null,
  transientKeys: ["rolling", "lastHit"],
  multiClient: false,
  clientSettings: false,
  ...overrides,
});

const CONFIGS = [config()];

const stored = (key = KEY) => JSON.parse(localStorage.getItem(key) ?? "null");

const socket = () => FakeSocket.instances[0];

/** The hub's list of clients; every one runs app_1 unless told otherwise. */
const clients = (...list) =>
  socket().deliver({
    hub: "clients",
    clients: list.map((c) =>
      typeof c === "number" ? { client: c, name: `C${c}`, apps: ["app_1"] } : c,
    ),
  });

beforeEach(() => {
  localStorage.clear();
  FakeSocket.instances = [];
  global.WebSocket = FakeSocket;
});

afterEach(() => {
  delete global.WebSocket;
});

const mount = (configs = CONFIGS) => renderHook(() => useAppSessions(configs));

describe("connection state", () => {
  it("opens one socket, to the hub", () => {
    mount([config(), config({ id: "app_2", port: 7002 })]);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(socket().url).toBe(HUB_URL);
  });

  it("reports an app connected once a client runs it", () => {
    const { result } = mount();
    act(() => socket().open());
    expect(result.current.connections.app_1).toBe(false);

    act(() => clients(1));
    expect(result.current.connections.app_1).toBe(true);
  });

  it("reports an app no client runs as disconnected", () => {
    const { result } = mount();
    act(() => socket().open());
    act(() => clients({ client: 1, name: "C1", apps: ["app_9"] }));

    expect(result.current.connections.app_1).toBe(false);
  });

  it("forgets the clients when the socket closes", () => {
    const { result } = mount();
    act(() => socket().open());
    act(() => clients(1));
    act(() => socket().close());

    expect(result.current.connections.app_1).toBe(false);
    expect(result.current.clients).toEqual([]);
  });
});

describe("messages", () => {
  it("lands a message from any client in a single-state app's one state", () => {
    const { result } = mount();
    act(() => socket().deliver({ app: "app_1", client: 5, type: "hit", item: { id: 9 } }));

    expect(result.current.states.app_1[ALL].lastHit).toEqual({ id: 9 });
  });

  it("keeps each client's state apart in a multi-client app", () => {
    const { result } = mount([config({ multiClient: true })]);
    act(() => {
      socket().deliver({ app: "app_1", client: 1, type: "hit", item: { id: 1 } });
      socket().deliver({ app: "app_1", client: 2, type: "hit", item: { id: 2 } });
    });

    expect(result.current.states.app_1["1"].lastHit).toEqual({ id: 1 });
    expect(result.current.states.app_1["2"].lastHit).toEqual({ id: 2 });
  });

  it("gives a client that speaks before it is listed the app's defaults", () => {
    const { result } = mount([config({ multiClient: true, clientSettings: true })]);
    act(() => socket().deliver({ app: "app_1", client: 3, type: "hit", item: { id: 1 } }));

    expect(result.current.states.app_1["3"].settings).toEqual({ volume: 1 });
    expect(result.current.states.app_1["3"].rolling).toBe(false);
  });

  it("applies a handler's function of the state the window shows", () => {
    const { result } = mount([
      config({
        multiClient: true,
        clientSettings: true,
        handleMessage: (data) => (s) => ({
          settings: { ...s.settings, list: data.list },
        }),
      }),
    ]);
    act(() => {
      socket().deliver({ app: "app_1", client: 1, list: [1] });
      socket().deliver({ app: "app_1", client: 1, list: [2] });
    });

    expect(result.current.states.app_1["1"].settings).toEqual({ volume: 1, list: [2] });
    expect(socket().sent).toEqual([]);
  });

  it("ignores a message for an app it does not know", () => {
    const { result } = mount();
    const before = result.current.states.app_1;

    act(() => socket().deliver({ app: "app_9", client: 1, type: "hit" }));
    expect(result.current.states.app_1).toBe(before);
  });

  it("ignores a frame that is not JSON", () => {
    const { result } = mount();
    const before = result.current.states.app_1;

    act(() => socket().onmessage?.({ data: "<html>" }));
    expect(result.current.states.app_1).toBe(before);
  });
});

describe("what a window shows", () => {
  it("puts the shared settings into a client's own state", () => {
    const c = config({ multiClient: true });
    const shown = viewState(c, { [ALL]: { settings: { volume: 4 } }, 1: { seen: 1 } }, "1");

    expect(shown).toEqual({ seen: 1, settings: { volume: 4 } });
  });

  it("shows a client's own settings when they are per client", () => {
    const c = config({ multiClient: true, clientSettings: true });
    const shown = viewState(
      c,
      { [ALL]: { settings: { volume: 4 } }, 1: { settings: { volume: 2 } } },
      "1",
    );

    expect(shown.settings).toEqual({ volume: 2 });
  });
});

describe("persistence", () => {
  // Writing is deferred, so that a streaming app cannot turn each message into
  // a synchronous localStorage write. These tests let that timer run.
  const flushSaves = () => act(() => jest.advanceTimersByTime(500));

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("keeps transient state out of storage", () => {
    const { result } = mount();
    act(() => socket().deliver({ app: "app_1", client: 1, type: "hit", item: { id: 9 } }));
    flushSaves();

    // `seen` came from the same message and is not transient, so the write
    // definitely happened — `lastHit` was left out of it deliberately.
    expect(result.current.states.app_1[ALL].lastHit).toEqual({ id: 9 });
    expect(stored().seen).toEqual({ id: 9 });
    expect(stored()).not.toHaveProperty("lastHit");
    expect(stored()).not.toHaveProperty("rolling");
  });

  it("stores a client's state under its own key", () => {
    mount([config({ multiClient: true, clientSettings: true })]);
    act(() => socket().deliver({ app: "app_1", client: 7, type: "hit", item: { id: 1 } }));
    flushSaves();

    expect(stored(`${KEY}@7`).seen).toEqual({ id: 1 });
    expect(stored(`${KEY}@7`).settings).toEqual({ volume: 1 });
  });

  it("ignores transient state that an earlier version persisted", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ lastHit: { id: 9 }, rolling: true, seen: { id: 9 } }),
    );

    const { result } = mount();

    // This is the bug that decremented the roll list on every reload.
    expect(result.current.states.app_1[ALL].lastHit).toBeUndefined();
    expect(result.current.states.app_1[ALL].rolling).toBe(false);
    expect(result.current.states.app_1[ALL].seen).toEqual({ id: 9 });
  });

  it("keeps a setting the saved state has never heard of", () => {
    // saved before `volume` had a companion
    localStorage.setItem(KEY, JSON.stringify({ settings: { volume: 4 } }));

    const { result } = mount([
      config({ initialState: () => ({ settings: { volume: 1, muted: false }, rolling: false }) }),
    ]);

    expect(result.current.states.app_1[ALL].settings).toEqual({ volume: 4, muted: false });
  });

  it("starts a new client from the settings saved before clients existed", () => {
    localStorage.setItem(KEY, JSON.stringify({ settings: { volume: 4 } }));

    const { result } = mount([config({ multiClient: true, clientSettings: true })]);
    act(() => socket().open());
    act(() => clients(1));

    expect(result.current.states.app_1["1"].settings).toEqual({ volume: 4 });
  });

  it("collapses a burst of messages into one write", () => {
    mount();
    const writes = jest.spyOn(Storage.prototype, "setItem");

    act(() => {
      for (let i = 0; i < 20; i += 1) {
        socket().deliver({ app: "app_1", client: 1, type: "hit", item: { id: i } });
      }
    });

    // The dungeon map sends a position every frame. Twenty of those must not
    // be twenty writes.
    expect(writes).not.toHaveBeenCalled();

    flushSaves();
    expect(writes).toHaveBeenCalledTimes(1);
    expect(stored().seen).toEqual({ id: 19 });

    writes.mockRestore();
  });

  it("writes what is still queued when the window goes away", () => {
    const { unmount } = mount();
    act(() => socket().deliver({ app: "app_1", client: 1, type: "hit", item: { id: 4 } }));
    expect(stored()).toBeNull();

    unmount();
    expect(stored().seen).toEqual({ id: 4 });
  });
});

describe("sending", () => {
  it("sends each client its settings when it appears", () => {
    localStorage.setItem(KEY, JSON.stringify({ settings: { volume: 7 } }));
    mount();
    act(() => socket().open());
    act(() => clients(1, 2));

    expect(socket().sent).toEqual([
      { type: "updateConfig", settings: { volume: 7 }, app: "app_1", client: 1 },
      { type: "updateConfig", settings: { volume: 7 }, app: "app_1", client: 2 },
    ]);
  });

  it("does not resend settings to a client still in the list", () => {
    mount();
    act(() => socket().open());
    act(() => clients(1));
    socket().sent = [];
    act(() => clients(1, 2));

    expect(socket().sent.map((m) => m.client)).toEqual([2]);
  });

  it("mirrors a shared settings change to every client", () => {
    const { result } = mount();
    act(() => socket().open());
    act(() => clients(1, 2));
    socket().sent = [];
    act(() => result.current.push("app_1", ALL, { settings: { volume: 3 } }));

    expect(socket().sent).toEqual([
      { type: "updateConfig", settings: { volume: 3 }, app: "app_1", client: 1 },
      { type: "updateConfig", settings: { volume: 3 }, app: "app_1", client: 2 },
    ]);
    expect(result.current.states.app_1[ALL].settings).toEqual({ volume: 3 });
  });

  it("sends a per-client settings change to that client only", () => {
    const { result } = mount([config({ multiClient: true, clientSettings: true })]);
    act(() => socket().open());
    act(() => clients(1, 2));
    socket().sent = [];
    act(() => result.current.push("app_1", "2", { settings: { volume: 3 } }));

    expect(socket().sent).toEqual([
      { type: "updateConfig", settings: { volume: 3 }, app: "app_1", client: 2 },
    ]);
    expect(result.current.states.app_1["1"].settings).toEqual({ volume: 1 });
    expect(result.current.states.app_1["2"].settings).toEqual({ volume: 3 });
  });

  it("sends a message to the client a window shows", () => {
    const { result } = mount([config({ multiClient: true })]);
    act(() => socket().open());
    act(() => clients(1, 2));
    socket().sent = [];
    act(() => result.current.send("app_1", "1", { type: "start" }));

    expect(socket().sent).toEqual([{ type: "start", app: "app_1", client: 1 }]);
  });

  it("does not announce a state change that is not a setting", () => {
    const { result } = mount();
    act(() => socket().open());
    act(() => clients(1));
    socket().sent = [];
    act(() => result.current.push("app_1", ALL, { rolling: true }));

    expect(socket().sent).toEqual([]);
    expect(result.current.states.app_1[ALL].rolling).toBe(true);
  });

  it("drops a message when the socket is not open", () => {
    const { result } = mount();
    act(() => result.current.send("app_1", "1", { type: "start" }));

    expect(socket().sent).toEqual([]);
  });
});

describe("loading saved settings", () => {
  it("keeps keyed defaults that were added after the save", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ settings: { zones: { a: { on: false } }, list: [3] } }),
    );
    const { result } = mount([
      config({
        initialState: () => ({
          settings: { volume: 1, zones: { a: { on: true }, b: { on: true } }, list: [] },
        }),
      }),
    ]);

    expect(result.current.states.app_1[ALL].settings).toEqual({
      volume: 1,
      zones: { a: { on: false }, b: { on: true } },
      list: [3],
    });
  });
});
