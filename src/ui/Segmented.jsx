import { cx } from "./cx";
import { pixelize } from "../packages/pixel-text";

/**
 * Mutually exclusive choice, sized to fill its container.
 * items: [{ value, label, title? }]
 */
export function Segmented({ items, value, onChange, className }) {
  return (
    <div className={cx("ph-seg", className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={it.value === value}
          title={it.title ?? it.label}
          className={cx(
            "ph-seg__item",
            it.value === value && "ph-seg__item--on",
          )}
          onClick={() => onChange?.(it.value)}
        >
          {pixelize(it.label, { upper: true })}
        </button>
      ))}
    </div>
  );
}

export default Segmented;
