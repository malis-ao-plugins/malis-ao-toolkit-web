import { useRef, useState } from "react";
import { cx } from "./cx";
import { ColorPicker } from "./ColorPicker";
import { PixelText } from "./pixel";

/**
 * Pick a colour: a row of swatches, and a picker for anything else.
 *
 * The swatches are there because most choices are one of a few, and picking
 * from them keeps the palette coherent — they are the accents the kit was
 * designed around. The chip at the end opens the full grid for anything
 * they do not cover.
 */
export function ColorField({ label, hint, value, swatches = [], onChange }) {
  const chipRef = useRef(null);
  const [picking, setPicking] = useState(false);

  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

  return (
    <div className="ph-color">
      <div className="ph-color__head">
        <PixelText upper className="ph-color__label">
          {label}
        </PixelText>
        {hint && (
          <PixelText fit className="ph-color__hint">
            {hint}
          </PixelText>
        )}
      </div>

      <div className="ph-color__row">
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            title={swatch}
            aria-label={swatch}
            aria-pressed={same(swatch, value)}
            className={cx(
              "ph-color__swatch",
              same(swatch, value) && "ph-color__swatch--on",
            )}
            style={{ background: swatch }}
            onClick={() => onChange(swatch)}
          />
        ))}

        <button
          ref={chipRef}
          type="button"
          className={cx("ph-color__more", picking && "ph-color__more--on")}
          title="More colours"
          aria-expanded={picking}
          onClick={() => setPicking((v) => !v)}
        >
          <span className="ph-color__chip" style={{ background: value }} />
          <span className="ph-caret" />
        </button>
      </div>

      {picking && (
        <ColorPicker
          value={value}
          anchor={chipRef.current}
          onChange={onChange}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

export default ColorField;
