import { cx } from "./cx";
import { PixelInput } from "./PixelInput";
import { PixelText } from "./pixel";

/**
 * Text filter with an inline clear affordance, an optional result count and
 * an optional trailing control (typically a filter toggle).
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  count,
  right,
  className,
  overlayInputProxy = false,
}) {
  return (
    <div className={cx("ph-search", className)}>
      <div className="ph-search__wrap">
        <PixelInput
          className="ph-input"
          value={value}
          placeholder={placeholder}
          overlayInputProxy={overlayInputProxy}
          onChange={(e) => onChange?.(e.target.value)}
        />
        {value && (
          <button
            type="button"
            className="ph-search__clear"
            aria-label="Clear"
            onClick={() => onChange?.("")}
          >
            <PixelText>{"\u00d7"}</PixelText>
          </button>
        )}
      </div>

      {/* Outside the field, not laid over its right-hand end: a count that
          sits inside the box crowds the text and has to hide itself as soon
          as anything is typed — which is exactly when it becomes useful. */}
      {count != null && (
        <PixelText className="ph-search__count">{String(count)}</PixelText>
      )}

      {right}
    </div>
  );
}

export default SearchInput;
