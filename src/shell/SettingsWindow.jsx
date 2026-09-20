import {
  Button,
  ColorField,
  FAMILIES,
  NumberInput,
  Panel,
  PixelText,
  Row,
  Segmented,
  Stack,
} from "../ui";
import { useWindowFrame } from "../hooks/useWindowFrame";
import { ThemePreview } from "./ThemePreview";
import { GROUPS, THEME } from "./theme";
import "./settings.css";

/**
 * The toolkit's own window: what the UI looks like, rather than what any
 * plugin is doing.
 *
 * It is not an app. An app is a declaration bound to a plugin on a port and
 * only exists while that plugin is connected; this belongs to the shell and
 * is always there. It borrows the window chrome, the frame hook and the kit,
 * and nothing else.
 *
 * Organised by what a colour visibly does, each group shown above a live
 * example of the components it drives. A list of tokens told you nothing:
 * "accent" turns out to mean a button's border, the open tab's underline
 * and a toggle's fill, and no amount of naming conveys that — seeing all
 * three change at once does.
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

/** The surface ramp, so a window and a panel stay distinguishable. */
const SURFACES = [
  "#06080b",
  "#0c1016",
  "#121821",
  "#1a222d",
  "#24303e",
  "#35465a",
];

const TEXT = ["#ffffff", "#ccd6e0", "#9aa7b6", "#7c8b9c", "#4d5a6a"];

const SWATCHES_FOR = { surface: SURFACES, text: TEXT };

/** "Lucida Console" as shipped, "verdana" as exported. */
const titleCase = (name) =>
  String(name)
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const FACE_ITEMS = FAMILIES.map((family) => ({
  value: family,
  label: titleCase(family),
}));

export function SettingsWindow({ theme, onChange, onReset, onClose }) {
  // Wider than an app window: a colour row is swatches plus a picker, and
  // the frame hook takes a whole frame as its first-run position.
  const { frame, handlers, windowRef } = useWindowFrame("shell_settings", {
    x: 120,
    y: 120,
    width: 360,
    height: 620,
  });

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
        {GROUPS.map((group) => {
          const fields = THEME.filter((field) => field.group === group.id);

          return (
            <Panel key={group.id} title={group.title}>
              <Stack gap={2}>
                <PixelText fit className="set__hint">
                  {group.hint}
                </PixelText>

                <ThemePreview group={group.id} />

                {fields.map((field) =>
                  field.type === "font" ? (
                    <Segmented
                      key={field.key}
                      items={FACE_ITEMS}
                      value={theme[field.key]}
                      onChange={(value) => onChange(field.key, value)}
                    />
                  ) : field.type === "color" ? (
                    <ColorField
                      key={field.key}
                      label={field.label}
                      value={theme[field.key]}
                      swatches={SWATCHES_FOR[group.id] ?? SWATCHES}
                      onChange={(value) => onChange(field.key, value)}
                    />
                  ) : (
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
                      />
                    </Row>
                  ),
                )}
              </Stack>
            </Panel>
          );
        })}
      </div>

      <div className="resize-e" {...handlers("e")} />
      <div className="resize-s" {...handlers("s")} />
      <div className="resize-se" {...handlers("se")} />
    </div>
  );
}

export default SettingsWindow;
