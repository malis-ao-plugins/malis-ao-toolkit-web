import { forwardRef, useCallback, useLayoutEffect, useRef, useState } from "react";
import { PixelText } from "./PixelText";
import { useAtlas } from "./loader";
import "./pixel-input.css";

/**
 * An editable field whose text is drawn from the atlas.
 *
 * A real <input> does all the work — focus, keyboard, IME, undo, selection,
 * the caret, autofill — but its own glyphs are made transparent and the value
 * is painted underneath with PixelText. The behaviour stays the browser's;
 * only the pixels are ours.
 *
 * Three things have to line up for that to hold:
 *
 *   - Metrics. The field uses the matching generated webfont at the matching
 *     size, which is monospaced on the same cell as the atlas, so the caret
 *     and the selection rectangle land on glyph boundaries.
 *   - Origin. The painted layer and the field share one containing block —
 *     the inner element — so padding on the outside cannot shift one relative
 *     to the other.
 *   - Scroll. Once the value outgrows the box the field scrolls itself, and
 *     the painted layer is offset by the same amount, rounded to a whole
 *     pixel.
 */
export const PixelInput = forwardRef(function PixelInput(
  {
    value,
    onChange,
    placeholder = "",
    size = 12,
    weight = 400,
    upper = false,
    align = "left",
    className = "",
    style,
    inputClassName = "",
    ...rest
  },
  forwardedRef,
) {
  const atlas = useAtlas(size, weight);
  const innerRef = useRef(null);
  const [offset, setOffset] = useState(0);

  const setRefs = useCallback(
    (el) => {
      innerRef.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    },
    [forwardedRef],
  );

  const sync = useCallback(() => {
    const el = innerRef.current;
    if (el) setOffset(Math.round(el.scrollLeft));
  }, []);

  useLayoutEffect(sync, [value, sync]);

  const text = String(value ?? "");
  const shown = upper ? text.toUpperCase() : text;
  const empty = text.length === 0;
  const cellH = atlas?.meta.cellH ?? size;

  return (
    <span
      className={`pxi ${className}`}
      style={{ "--pxi-cell-h": `${cellH}px`, "--pxi-size": `${size}px`, ...style }}
    >
      <span className="pxi__inner">
        <PixelText
          aria-hidden="true"
          size={size}
          weight={weight}
          className={`pxi__ink${empty ? " pxi__ink--placeholder" : ""}`}
          style={{ left: -offset }}
        >
          {empty ? placeholder : shown}
        </PixelText>

        <input
          ref={setRefs}
          className={`pxi__field ${inputClassName}`}
          value={text}
          onChange={(e) => {
            onChange?.(e);
            sync();
          }}
          onScroll={sync}
          onKeyUp={sync}
          onSelect={sync}
          onFocus={sync}
          style={{
            fontFamily: `"TerminusPx${atlas?.meta.size ?? size}", monospace`,
            textAlign: align,
          }}
          spellCheck={false}
          {...rest}
        />
      </span>
    </span>
  );
});

export default PixelInput;
