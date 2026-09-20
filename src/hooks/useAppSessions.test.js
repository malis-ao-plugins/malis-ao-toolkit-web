import { act, renderHook } from "@testing-library/react";
import { useAppSessions } from "./useAppSessions";

/** Minimal stand-in for the browser socket the hook opens per app. */
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
  ...overrides,
});

const CONFIGS = [config()];

const stored = () => JSON.parse(localStorage.getItem(KEY) ?? "null");

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
  it("opens one socket per app, on its own port", () => {
    mount();
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.instances[0].url).toBe("ws://localhost:7001/ws");
  });

  it("reports connected only once the socket opens", () => {
    const { result } = mount();
    expect(result.current.connections.app_1).toBe(false);

    act(() => FakeSocket.instances[0].open());
    expect(result.current.connections.app_1).toBe(true);
  });

  it("reports disconnected when the socket closes", () => {
    const { result } = mount();
    act(() => FakeSocket.instances[0].open());
    act(() => FakeSocket.instances[0].close());

    expect(result.current.connections.app_1).toBe(false);
  });
});

describe("messages", () => {
  it("applies the partial state an app's handler returns", () => {
    const { result } = mount();
    act(() => FakeSocket.instances[0].deliver({ type: "hit", item: { id: 9 } }));

    expect(result.current.states.app_1.lastHit).toEqual({ id: 9 });
  });

  it("ignores a message no handler claims", () => {
    const { result } = mount();
    const before = result.current.states.app_1;

    act(() => FakeSocket.instances[0].deliver({ type: "unknown" }));
    expect(result.current.states.app_1).toBe(before);
  });

  it("ignores a frame that is not JSON", () => {
    const { result } = mount();
    const before = result.current.states.app_1;

    act(() => FakeSocket.instances[0].onmessage?.({ data: "<html>" }));
    expect(result.current.states.app_1).toBe(before);
  });
});

describe("persistence", () => {
  it("keeps transient state out of storage", () => {
    const { result } = mount();
    act(() => FakeSocket.instances[0].deliver({ type: "hit", item: { id: 9 } }));

    // `seen` came from the same message and is not transient, so the write
    // definitely happened — `lastHit` was left out of it deliberately.
    expect(result.current.states.app_1.lastHit).toEqual({ id: 9 });
    expect(stored().seen).toEqual({ id: 9 });
    expect(stored()).not.toHaveProperty("lastHit");
    expect(stored()).not.toHaveProperty("rolling");
  });

  it("ignores transient state that an earlier version persisted", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ lastHit: { id: 9 }, rolling: true, seen: { id: 9 } }),
    );

    const { result } = mount();

    // This is the bug that decremented the roll list on every reload.
    expect(result.current.states.app_1.lastHit).toBeUndefined();
    expect(result.current.states.app_1.rolling).toBe(false);
    expect(result.current.states.app_1.seen).toEqual({ id: 9 });
  });

  it("restores ordinary state over the declared defaults", () => {
    localStorage.setItem(KEY, JSON.stringify({ settings: { volume: 4 } }));

    const { result } = mount();
    expect(result.current.states.app_1.settings).toEqual({ volume: 4 });
  });

  it("persists everything when an app declares nothing transient", () => {
    mount([config({ transientKeys: [] })]);
    act(() => FakeSocket.instances[0].deliver({ type: "hit", item: { id: 1 } }));

    expect(stored()).toHaveProperty("lastHit");
  });
});

describe("sending", () => {
  it("mirrors a settings change to the plugin", () => {
    const { result } = mount();
    act(() => FakeSocket.instances[0].open());
    act(() => result.current.push("app_1", { settings: { volume: 3 } }));

    expect(FakeSocket.instances[0].sent).toEqual([
      { type: "updateConfig", settings: { volume: 3 } },
    ]);
    expect(result.current.states.app_1.settings).toEqual({ volume: 3 });
  });

  it("does not announce a state change that is not a setting", () => {
    const { result } = mount();
    act(() => FakeSocket.instances[0].open());
    act(() => result.current.push("app_1", { rolling: true }));

    expect(FakeSocket.instances[0].sent).toEqual([]);
    expect(result.current.states.app_1.rolling).toBe(true);
  });

  it("drops a message when the socket is not open", () => {
    const { result } = mount();
    act(() => result.current.send("app_1", { type: "start" }));

    expect(FakeSocket.instances[0].sent).toEqual([]);
  });
});
