import {
  Button,
  ColorField,
  NumberInput,
  Panel,
  PixelText,
  Row,
  Stack,
} from "../ui";
import { useWindowFrame } from "../hooks/useWindowFrame";
import { THEME } from "./theme";
import "./settings.css";

/**
 * The toolkit's own window: what the UI looks like, rather than what any
 * plugin is doing.
 *
 * It is not an app. An app is a declaration bound to a plugin on a port and
 * only exists while that plugin is connected; this belongs to the shell and
 * is always there. It borrows the window chrome, the frame hook and the
 * kit, and nothing else.
 */

/**
 * The accents the kit was designed around, plus a neutral.
 *
 * Offered as swatches because most choices are one of a few, and picking
 * from a set keeps a palette coherent in a way a free colour wheel does not.
 */
const SWATCHES = [
  "#ffb454",
  "#56d4e8",
  "#8ce99a",
  "#ffd43b",
  "#ff6b6b",
  "#ff79c6",
  "#ccd6e0",
];

const SURFACES = ["#06080b", "#0c1016", "#121821", "#1a222d", "#24303e", "#35465a"];

const swatchesFor = (field) =>
  field.key === "window" || field.key === "panel" || field.key === "edge"
    ? SURFACES
    : SWATCHES;

export function SettingsWindow({ theme, onChange, onReset, onClose }) {
  // Wider than an app window: a colour row is swatches plus a picker, and
  // the frame hook takes a whole frame as its first-run position.
  const { frame, handlers, windowRef } = useWindowFrame("shell_settings", {
    x: 120,
    y: 120,
    width: 360,
    height: 560,
  });

  const colours = THEME.filter((field) => field.type === "color");
  const numbers = THEME.filter((field) => field.type === "px");

  return (
    <div
      ref={windowRef}
      className="app ph"
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
        <div className="header">
          <PixelText upper className="header-title">
            Interface
          </PixelText>

          <div className="set__spacer" />

          <Button
            size="sm"
            variant="ghost"
            title="Back to the shipped theme"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onReset}
          >
            Reset
          </Button>

          <button
            type="button"
            className="header-min"
            title="Close"
            aria-label="Close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
          >
            <span className="header-min__bar" />
          </button>
        </div>
      </div>

      <div className="body">
        <Panel title="Colours">
          <Stack gap={2}>
            {colours.map((field) => (
              <ColorField
                key={field.key}
                label={field.label}
                hint={field.hint}
                value={theme[field.key]}
                swatches={swatchesFor(field)}
                onChange={(value) => onChange(field.key, value)}
              />
            ))}
          </Stack>
        </Panel>

        <Panel title="Shape">
          <Stack gap={2}>
            {numbers.map((field) => (
              <Row key={field.key} gap={2} className="set__row">
                <PixelText upper className="set__label">
                  {field.label}
                </PixelText>
                <NumberInput
                  value={Number(theme[field.key])}
                  min={field.min}
                  max={field.max}
                  onChange={(value) => onChange(field.key, value)}
                  onCommit={(value) => onChange(field.key, value)}
                  title={field.hint}
                />
              </Row>
            ))}
          </Stack>
        </Panel>
      </div>

      <div className="resize-e" {...handlers("e")} />
      <div className="resize-s" {...handlers("s")} />
      <div className="resize-se" {...handlers("se")} />
    </div>
  );
}

export default SettingsWindow;
