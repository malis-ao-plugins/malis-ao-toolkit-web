import { render, screen } from "@testing-library/react";
import { defineApp } from "./defineApp";

const Panel = ({ settings, state, app }) => (
  <div>
    <span data-testid="volume">{String(settings.volume)}</span>
    <span data-testid="hits">{String(state.hits)}</span>
    <span data-testid="app">{app.id}</span>
  </div>
);

const spec = (overrides = {}) => ({
  port: 7100,
  name: "Test App",
  settings: { volume: 1 },
  state: { hits: 0 },
  messages: { bump: (d) => ({ hits: d.n }) },
  panels: { main: { title: "Main", component: Panel } },
  tabs: [{ id: "tab", label: "Tab", panels: ["main"] }],
  ...overrides,
});

describe("identity", () => {
  it("derives an id from the port when none is given", () => {
    expect(defineApp(spec()).id).toBe("app_7100");
  });

  it("keeps an explicit id, so saved state survives a rename", () => {
    expect(defineApp(spec({ id: "app_legacy" })).id).toBe("app_legacy");
  });

  it("splits the title so the vendor can be dropped when narrow", () => {
    const app = defineApp(spec());
    expect([app.name1, app.name2, app.label]).toEqual([
      "Mali's",
      "Test App",
      "Mali's Test App",
    ]);
  });

  it("omits the vendor from the label when there is none", () => {
    expect(defineApp(spec({ vendor: "" })).label).toBe("Test App");
  });
});

describe("state", () => {
  it("starts from the declared settings and state", () => {
    expect(defineApp(spec()).initialState()).toEqual({
      settings: { volume: 1 },
      hits: 0,
    });
  });

  it("reports nothing transient unless the app says so", () => {
    expect(defineApp(spec()).transientKeys).toEqual([]);
    expect(defineApp(spec({ transient: ["hits"] })).transientKeys).toEqual([
      "hits",
    ]);
  });
});

describe("messages", () => {
  it("routes a message to its handler", () => {
    expect(defineApp(spec()).handleMessage({ type: "bump", n: 3 })).toEqual({
      hits: 3,
    });
  });

  it("answers null for anything unhandled, rather than throwing", () => {
    const app = defineApp(spec());
    expect(app.handleMessage({ type: "nope" })).toBeNull();
    expect(app.handleMessage(undefined)).toBeNull();
  });

  it("answers null when a handler returns nothing", () => {
    const app = defineApp(spec({ messages: { bump: () => undefined } }));
    expect(app.handleMessage({ type: "bump" })).toBeNull();
  });
});

describe("tabs and panels", () => {
  it("exposes tabs in order with the panels they name", () => {
    const app = defineApp(spec());
    expect(app.defaultTabs).toEqual([
      { id: "tab", label: "Tab", sections: ["main"] },
    ]);
    expect(app.defaultActiveTab).toBe("tab");
  });

  it("answers null for a section the app does not define", () => {
    expect(defineApp(spec()).renderSection("missing", {})).toBeNull();
  });

  it("hands a panel its settings, its state and the app identity", () => {
    const app = defineApp(spec());
    const section = app.renderSection("main", {
      settings: { volume: 7 },
      hits: 2,
      send: jest.fn(),
      pushConfig: jest.fn(),
      sectionOpen: {},
    });

    render(section.content);
    expect(screen.getByTestId("volume")).toHaveTextContent("7");
    expect(screen.getByTestId("hits")).toHaveTextContent("2");
    expect(screen.getByTestId("app")).toHaveTextContent("app_7100");
  });

  it("merges into settings rather than replacing them", () => {
    const pushConfig = jest.fn();
    let captured;
    const Capture = (props) => {
      captured = props;
      return null;
    };

    const app = defineApp(
      spec({ panels: { main: { title: "Main", component: Capture } } }),
    );
    render(
      app.renderSection("main", {
        settings: { volume: 1, muted: false },
        send: jest.fn(),
        pushConfig,
        sectionOpen: {},
      }).content,
    );

    captured.set({ volume: 9 });
    expect(pushConfig).toHaveBeenCalledWith({
      settings: { volume: 9, muted: false },
    });
  });

  it("computes a title from the panel's own props when it is a function", () => {
    const app = defineApp(
      spec({
        panels: {
          main: {
            title: ({ state }) => `Main · ${state.hits}`,
            component: Panel,
          },
        },
      }),
    );

    expect(
      app.renderSection("main", { settings: {}, hits: 4, sectionOpen: {} })
        .title,
    ).toBe("Main · 4");
  });

  it("makes a fixed panel neither collapsible nor closed", () => {
    const app = defineApp(
      spec({
        panels: { main: { title: "Main", fixed: true, component: Panel } },
      }),
    );
    const section = app.renderSection("main", {
      settings: {},
      sectionOpen: { main: false },
    });

    expect(section.collapsible).toBe(false);
    expect(section.open).toBe(true);
  });

  it("lets a collapsible panel be closed, and defaults it open", () => {
    const app = defineApp(spec());
    expect(
      app.renderSection("main", { settings: {}, sectionOpen: { main: false } })
        .open,
    ).toBe(false);
    expect(
      app.renderSection("main", { settings: {}, sectionOpen: {} }).open,
    ).toBe(true);
  });
});

describe("development validation", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
    console.warn.mockRestore();
  });

  it("names the app when a tab lists a panel that does not exist", () => {
    defineApp(spec({ tabs: [{ id: "t", label: "T", panels: ["ghost"] }] }));
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('"ghost"'),
    );
  });

  it("complains about a panel with no component", () => {
    defineApp(spec({ panels: { main: { title: "Main" } } }));
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("no component"),
    );
  });

  it("warns about a panel no tab shows", () => {
    defineApp(
      spec({
        panels: {
          main: { title: "Main", component: Panel },
          orphan: { title: "Orphan", component: Panel },
        },
      }),
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("orphan"),
    );
  });

  it("refuses settings as a transient key", () => {
    defineApp(spec({ transient: ["settings"] }));
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("cannot be transient"),
    );
  });
});
