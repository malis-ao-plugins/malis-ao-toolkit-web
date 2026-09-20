import { cx } from "./cx";
import { PixelText } from "./pixel";

/**
 * On/off control. Deliberately a hard 8px box rather than a sliding switch —
 * a knob that animates across a track cannot land on whole pixels.
 */
export function Toggle({
  label,
  on = false,
  onChange,
  block = false,
  title,
  className,
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      aria-pressed={on}
      className={cx(
        "ph-toggle",
        on && "ph-toggle--on",
        block && "ph-toggle--block",
        className,
      )}
      onClick={() => onChange?.(!on)}
    >
      <span className="ph-toggle__box" />
      <PixelText upper className="ph-toggle__text">
        {label}
      </PixelText>
    </button>
  );
}

export default Toggle;
