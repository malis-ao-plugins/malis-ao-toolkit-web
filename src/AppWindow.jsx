import { useEffect, useState } from "react";
import { useWindowFrame } from "./hooks/useWindowFrame";
import { Panel } from "./ui";
import Header from "./components/Header";
import Tabs from "./components/Tabs";

const COLLAPSE_KEY = "collapsed_";

function loadCollapsed(id) {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY + id)) ?? []);
  } catch {
    return new Set();
  }
}

/**
 * One app, in one window.
 *
 * The layout is whatever the app declared: tabs in order, panels in order,
 * nothing draggable except the window itself. The previous version let every
 * panel be reordered, torn off into a floating window, dropped onto another
 * tab or merged into another app's window — about 600 lines across the window
 * and a drag hook, and a saved layout that could end up in states the app
 * knew nothing about.
 *
 * What a window remembers now is its position, its size, the open tab and
 * which panels are collapsed.
 */
export function AppWindow({ config, session, initialPos, onMinimise }) {
  const { frame, handlers } = useWindowFrame(config.id, initialPos);
  const [tabId, setTabId] = useState(config.defaultActiveTab);
  const [collapsed, setCollapsed] = useState(() => loadCollapsed(config.id));

  useEffect(() => {
    try {
      localStorage.setItem(
        COLLAPSE_KEY + config.id,
        JSON.stringify([...collapsed]),
      );
    } catch {
      /* private mode */
    }
  }, [config.id, collapsed]);

  const tab =
    config.defaultTabs.find((t) => t.id === tabId) ?? config.defaultTabs[0];

  const toggle = (key) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // What defineApp's renderSection expects: state spread flat, plus the two
  // functions and the open/closed map.
  const ctx = {
    ...session.state,
    ...(config.deriveData?.(session.state) ?? {}),
    send: session.send,
    pushConfig: session.push,
    sectionOpen: Object.fromEntries(
      (tab?.sections ?? []).map((key) => [key, !collapsed.has(key)]),
    ),
  };

  const skin = frame.width <= 360 ? "overlay" : undefined;
  const density = frame.width >= 560 ? "comfortable" : undefined;

  return (
    <div
      className="app ph"
      data-skin={skin}
      data-density={density}
      style={{
        position: "fixed",
        left: frame.x,
        top: frame.y,
        width: frame.width,
        height: frame.height,
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      <div className="window-drag-handle" {...handlers("move")}>
        <Header
          connected={session.connected}
          activeConf={config}
          activeState={session.state}
          send={session.send}
          pushConfig={session.push}
          onMinimise={onMinimise}
        />
      </div>

      {session.connected ? (
        <>
          {config.defaultTabs.length > 1 && (
            <Tabs
              tabs={config.defaultTabs}
              activeId={tab?.id}
              onSelect={setTabId}
            />
          )}

          <div className="body">
            {(tab?.sections ?? []).map((key) => {
              const def = config.renderSection(key, ctx);
              if (!def) return null;
              return (
                <Panel
                  key={key}
                  title={def.title}
                  collapsible={def.collapsible}
                  open={def.open}
                  onToggle={() => toggle(key)}
                  className="shell-section"
                >
                  {def.content}
                </Panel>
              );
            })}
          </div>
        </>
      ) : (
        <div className="disconnected-message">Waiting for the plugin…</div>
      )}

      <div className="resize-e" {...handlers("e")} />
      <div className="resize-s" {...handlers("s")} />
      <div className="resize-se" {...handlers("se")} />
    </div>
  );
}

export default AppWindow;
