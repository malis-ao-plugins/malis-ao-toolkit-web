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
}) {
  return (
    <div className={cx("ph-search", className)}>
      <div className="ph-search__wrap">
        <PixelInput
          className="ph-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
        />
        {count != null && !value && (
          <PixelText className="ph-search__count">{String(count)}</PixelText>
        )}
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
      {right}
    </div>
  );
}

export default SearchInput;
