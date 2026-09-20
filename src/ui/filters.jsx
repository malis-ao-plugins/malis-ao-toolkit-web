import { useState } from "react";
import { PixelInput, PixelText } from "../packages/pixel-text";
import { Button } from "./Button";
import { Toggle } from "./Toggle";
import { cx } from "./cx";

/**
 * One entry in a filter list: a toggle, a label, whatever the filter needs in
 * the middle, and a remove.
 *
 * The old version faded and slid the row out over 300ms before deleting it.
 * That is a transform on text, so the glyphs blurred for the whole animation
 * — and the row was gone either way. It just goes now.
 */
export function FilterRow({ name, active = true, onToggle, onRemove, children }) {
  return (
    <div className={cx("flt-row", !active && "flt-row--off")}>
      <Toggle
        block
        label={name}
        on={active}
        onChange={() => onToggle?.()}
        className="flt-row__toggle"
      />

      {children && <div className="flt-row__fields">{children}</div>}

      {onRemove && (
        <Button
          size="sm"
          variant="danger"
          title={`Remove ${name}`}
          onClick={onRemove}
        >
          {"×"}
        </Button>
      )}
    </div>
  );
}

/**
 * Integer field that is allowed to be empty.
 *
 * "No minimum" and "a minimum of zero" are different filters, so blank has to
 * survive round-tripping — it maps to null rather than 0.
 *
 * `onChange` fires as you type and `onCommit` on blur or Enter, so a filter
 * can preview locally and only push to the plugin once.
 */
export function RangeField({ value, onChange, onCommit, placeholder, maxDigits = 6 }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const [editing, setEditing] = useState(false);

  if (!editing) {
    const incoming = value == null ? "" : String(value);
    if (incoming !== text) setText(incoming);
  }

  const parse = (raw) => {
    const cleaned = raw.replace(/[^0-9-]/g, "").slice(0, maxDigits);
    return cleaned === "" || cleaned === "-" ? null : Number(cleaned);
  };

  return (
    <PixelInput
      className="flt-range"
      align="center"
      placeholder={placeholder}
      value={text}
      inputMode="numeric"
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        setText(e.target.value);
        onChange?.(parse(e.target.value));
      }}
      onBlur={() => {
        setEditing(false);
        onCommit?.(parse(text));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

/**
 * Multi-select as removable tags with a type-ahead behind it.
 *
 * Backspace on an empty field removes the last tag, which is the one thing
 * people expect from a tag field and the one thing that is always missing.
 */
export function TagField({ tags, onRemove, children, onFocusInput }) {
  return (
    <div className="flt-tags" onClick={onFocusInput}>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          className="flt-tag"
          title={`Remove ${tag}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onRemove(tag);
          }}
        >
          <PixelText>{tag}</PixelText>
        </button>
      ))}
      {children}
    </div>
  );
}
