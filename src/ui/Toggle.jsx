import { cx } from "./cx";
import { PixelText } from "./pixel";

/**
 * On/off control. Deliberately a hard 8px box rather than a sliding switch —
 * a knob that animates across a track cannot land on whole pixels.
 *
 * Labels are uppercased, because most of them are the kit's own short
 * captions. Pass `upper={false}` for anything that is a name rather than a
 * caption — a playfield, a character — where capitals read as shouting.
 */
export function Toggle({
  label,
  on = false,
  onChange,
  block = false,
  title,
  className,
  upper = true,
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
      {/* A block toggle fills its row, so a long label has somewhere to be
          cut: it truncates to the room left over rather than running under
          whatever sits beside it. */}
      <PixelText upper={upper} fit={block} className="ph-toggle__text">
        {label}
      </PixelText>
    </button>
  );
}

export default Toggle;
