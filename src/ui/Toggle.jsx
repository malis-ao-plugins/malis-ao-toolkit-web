import { cx } from "./cx";
import { PixelText } from "./pixel";

/**
 * On/off control. Deliberately a hard 8px box rather than a sliding switch —
 * a knob that animates across a track cannot land on whole pixels.
 *
 * Labels are uppercased, because most of them are the kit's own short
 * captions. Pass `upper={false}` for anything that is a name rather than a
 * caption — a playfield, a character — where capitals read as shouting.
 *
 * `fit` truncates the label to the room left over. It is not free, so only
 * ask for it where the label can genuinely be too long.
 */
export function Toggle({
  label,
  on = false,
  onChange,
  block = false,
  /** No chrome: the box, and a label that takes the accent when it is on. */
  plain = false,
  title,
  className,
  upper = true,
  fit = false,
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
        plain && "ph-toggle--plain",
        className,
      )}
      onClick={() => onChange?.(!on)}
    >
      <span className="ph-toggle__box" />
      {/* `fit` costs a ResizeObserver and a second render, so it is asked
          for rather than assumed: only labels that can actually be too long
          — a stat, a playfield — need to be cut down to the room left over. */}
      <PixelText upper={upper} fit={fit} className="ph-toggle__text">
        {label}
      </PixelText>
    </button>
  );
}

export default Toggle;
