import { PixelText } from "../packages/pixel-text";
import "./tabs.css";

/**
 * The app's tabs, exactly as it declared them.
 *
 * No adding, renaming, removing or reordering — those existed only so panels
 * could be dragged between tabs, and panels no longer move.
 *
 * Tabs are content-sized rather than an equal split: three equal tabs across
 * 320px are 106.67px each, which puts every label after the first on a
 * fraction of a pixel.
 */
export default function Tabs({ tabs, activeId, onSelect }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeId}
          className={`tabs__tab${tab.id === activeId ? " tabs__tab--on" : ""}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onSelect(tab.id)}
        >
          <PixelText upper>{tab.label}</PixelText>
        </button>
      ))}
    </div>
  );
}
