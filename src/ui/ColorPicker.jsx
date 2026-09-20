import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { PixelInput } from "./PixelInput";

/**
 * A colour picker made of squares.
 *
 * The system picker is the one control in the app drawn by the operating
 * system, and it shows: a soft gradient field you drag a circle around,
 * opened in a dialog that arrives from somewhere else. This is the same job
 * done the way the rest of the kit works — a grid of whole-pixel cells you
 * click, hue across and shade down, plus a hex field for a value you already
 * know.
 *
 * Quantised rather than continuous on purpose. A gradient asks you to hunt
 * for a colour by eye and lands you on a different one each time; a grid is
 * repeatable, and 78 cells is more choice than any interface needs.
 *
 * There is also a screen sampler, which matters more here than it would
 * anywhere else: this is an overlay, and the thing worth matching is usually
 * the game behind it rather than anything in the picker.
 */

/** Chromium ships this; anywhere it does not, the button is simply absent. */
const canSample = () => typeof window !== "undefined" && "EyeDropper" in window;

const HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

/** Saturation and lightness per row: light to dark, down the grid. */
const SHADES = [
  { s: 60, l: 78 },
  { s: 75, l: 64 },
  { s: 85, l: 50 },
  { s: 80, l: 38 },
  { s: 70, l: 26 },
  { s: 55, l: 16 },
];

/** The neutral column, so a grey does not have to be mixed out of a hue. */
const GREYS = [96, 78, 60, 42, 24, 8];

function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;

  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];

  return (
    "#" +
    [r, g, b]
      .map((n) => Math.round((n + m) * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

const COLUMNS = [
  ...HUES.map((h) => SHADES.map((shade) => hslToHex(h, shade.s, shade.l))),
  GREYS.map((l) => hslToHex(0, 0, l)),
];

const isHex = (value) => /^#[0-9a-f]{6}$/i.test(value);

export function ColorPicker({ value, onChange, onClose, anchor }) {
  const rootRef = useRef(null);
  const sampling = useRef(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    const away = (e) => {
      // The sampler takes the whole screen, and dismissing it lands a click
      // on the page underneath — which would otherwise close the picker out
      // from under the colour just chosen.
      if (sampling.current) return;
      if (!rootRef.current?.contains(e.target) && !anchor?.contains(e.target)) {
        onClose();
      }
    };
    const key = (e) => e.key === "Escape" && onClose();

    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [anchor, onClose]);

  const rect = anchor?.getBoundingClientRect();
  if (!rect) return null;

  const commitText = (text) => {
    const next = text.startsWith("#") ? text : `#${text}`;
    setDraft(next);
    if (isHex(next)) onChange(next.toLowerCase());
  };

  return createPortal(
    <div
      ref={rootRef}
      className="ph-picker ph"
      style={{
        position: "fixed",
        top: Math.round(rect.bottom + 2),
        // Kept on screen: the field it belongs to can sit near either edge.
        left: Math.round(
          Math.max(8, Math.min(rect.left, window.innerWidth - 232)),
        ),
      }}
    >
      <div className="ph-picker__grid">
        {COLUMNS.map((column, x) => (
          <div key={x} className="ph-picker__column">
            {column.map((hex) => (
              <button
                key={hex}
                type="button"
                title={hex}
                aria-label={hex}
                className={
                  "ph-picker__cell" +
                  (hex === String(value).toLowerCase()
                    ? " ph-picker__cell--on"
                    : "")
                }
                style={{ background: hex }}
                onClick={() => {
                  onChange(hex);
                  onClose();
                }}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="ph-picker__foot">
        <span className="ph-picker__chip" style={{ background: value }} />
        <PixelInput
          className="ph-picker__hex"
          value={draft}
          onChange={(e) => commitText(e.target.value)}
        />
        {canSample() && (
          <Button
            size="sm"
            title="Sample a colour from anywhere on screen, including the game"
            onClick={async () => {
              sampling.current = true;
              try {
                const { sRGBHex } = await new window.EyeDropper().open();
                onChange(String(sRGBHex).toLowerCase());
                onClose();
              } catch {
                // Dismissed with Escape, which is an answer, not a fault.
              } finally {
                sampling.current = false;
              }
            }}
          >
            Screen
          </Button>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default ColorPicker;
