import { forwardRef, useCallback, useLayoutEffect, useRef, useState } from "react";
import { PixelText, useFontRefresh } from "./pixel";
import { cssSizeFor, fontFor, measure, metricsFamily } from "./fonts";
import "./pixel-input.css";

/**
 * An editable field whose text is drawn from the pixelfont atlases.
 *
 * A real <input> does all the work — focus, keyboard, IME, undo, selection,
 * the caret, autofill — but its own glyphs are made transparent and the value
 * is painted underneath with PixelText. The behaviour stays the browser's;
 * only the pixels are ours.
 *
 * aowebui ships its own <pixel-input>, which is a more complete text field
 * than this in isolation: it takes over caret placement, drag-select and
 * double-click word select off the atlas advances. It is not used here
 * because the kit's fields are not standalone. NumberInput drives this one
 * through a ref — it toggles `readOnly` to switch between scrubbing and
 * typing, calls `select()`, and reads pointer events off the field — and a
 * custom element exposes none of that. Keeping a real <input> keeps those
 * controls working.
 *
 * Three things have to line up:
 *
 *   - Metrics. The field lays out in the same face at the same pixel size the
 *     atlas was exported from, so the caret and the selection rectangle land
 *     close to the drawn glyphs.
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
    size = 13,
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
  // The field lays itself out in the atlas's own metrics, so a change of
  // face has to reach this render and not only the painted layer inside it.
  useFontRefresh();

  const face = fontFor(size, weight);
  const metric = metricsFamily(size, weight);
  const innerRef = useRef(null);
  const [offset, setOffset] = useState(0);
  const [box, setBox] = useState(0);

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
    if (!el) return;
    setOffset(Math.round(el.scrollLeft));
    setBox(el.clientWidth);
  }, []);

  useLayoutEffect(sync, [value, sync]);

  const text = String(value ?? "");
  const shown = upper ? text.toUpperCase() : text;
  const empty = text.length === 0;

  /**
   * Where the painted text starts.
   *
   * `align` was reaching the real input and nothing else, so a centred field
   * put the caret in the middle of the box while the glyphs stayed pinned to
   * the left. The painted layer has to be placed the same way the input lays
   * its own text out, which means measuring the string and doing the
   * arithmetic here — it is absolutely positioned, so no amount of
   * text-align on an ancestor reaches it.
   *
   * Never past the left edge: once the value outgrows the box the field
   * scrolls instead, and `offset` follows it.
   */
  const inkLeft = (() => {
    const painted = measure(empty ? placeholder : shown, size, weight);
    const slack = Math.max(0, box - painted);
    if (align === "center") return Math.round(slack / 2) - offset;
    if (align === "right") return Math.round(slack) - offset;
    return -offset;
  })();

  return (
    <span
      className={`pxi ${className}`}
      style={{
        "--pxi-cell-h": `${face.height}px`,
        "--pxi-size": `${metric ? face.size : cssSizeFor(size, weight)}px`,
        ...style,
      }}
    >
      <span className="pxi__inner">
        <PixelText
          aria-hidden="true"
          size={size}
          weight={weight}
          className={`pxi__ink${empty ? " pxi__ink--placeholder" : ""}`}
          style={{ left: inkLeft }}
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
            fontFamily: metric
              ? `"${metric}", monospace`
              : `"${face.name}", sans-serif`,
            fontWeight: face.atlas.bold ? 700 : 400,
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
