import { cx } from "./cx";
import { PixelText } from "./pixel";

/**
 * Pick a colour: a row of swatches, and the system picker for anything else.
 *
 * The swatches are there because most choices are one of a few, and picking
 * from them keeps the palette coherent — they are the accents the kit was
 * designed around. The native input is the escape hatch; it is the one
 * control here drawn by the operating system rather than by us, which is the
 * price of letting someone choose a colour that was not anticipated.
 */
export function ColorField({ label, hint, value, swatches = [], onChange }) {
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
            aria-pressed={swatch.toLowerCase() === String(value).toLowerCase()}
            className={cx(
              "ph-color__swatch",
              swatch.toLowerCase() === String(value).toLowerCase() &&
                "ph-color__swatch--on",
            )}
            style={{ background: swatch }}
            onClick={() => onChange(swatch)}
          />
        ))}

        <label className="ph-color__custom" title="Any colour">
          <span className="ph-color__chip" style={{ background: value }} />
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

export default ColorField;
