import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "./cx";
import { PixelText } from "./pixel";
import { measure } from "./fonts";

/** The bare knob, when it is not carrying a number. */
const BAR = 4;
/** Breathing room either side of the number on the knob. */
const KNOB_PAD = 4;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * How wide the knob has to be to hold any value this slider can reach.
 *
 * Reserved from the extremes rather than from the current value, so the knob
 * is one fixed size and the number inside it cannot resize anything as it
 * changes. Rounded up to the 4px grid.
 */
function knobWidth(min, max, showValue) {
  if (!showValue) return BAR;
  const widest = Math.max(measure(String(min)), measure(String(max)));
  return Math.ceil((widest + KNOB_PAD) / 4) * 4;
}

/**
 * Horizontal value picker with optional end captions.
 *
 * The number rides on the knob. It used to sit at the end of the row, where
 * it was the widest thing that could change: "1" and "100" are different
 * widths in a proportional face, so every row's track ended somewhere
 * different and the whole panel looked ragged. On the knob it is also where
 * you are already looking while dragging.
 *
 * The knob is positioned by an integer `left` in pixels, computed from the
 * measured track width. Using a percentage would put it on a half-pixel and
 * smear it.
 */
export function Slider({
  value,
  min,
  max,
  onChange,
  onCommit,
  left,
  right,
  showValue = true,
  className,
}) {
  const trackRef = useRef(null);
  const [width, setWidth] = useState(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width)),
    );
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  const knob = knobWidth(min, max, showValue);
  const span = Math.max(1, width - knob);
  const ratio = (clamp(value, min, max) - min) / (max - min || 1);
  const knobLeft = Math.round(ratio * span);

  const valueAt = useCallback(
    (clientX) => {
      const el = trackRef.current;
      if (!el) return value;
      const rect = el.getBoundingClientRect();
      const x = clamp(clientX - rect.left - knob / 2, 0, span);
      return Math.round(min + (x / span) * (max - min));
    },
    [min, max, span, knob, value],
  );

  const onPointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    onChange?.(valueAt(e.clientX));
  };

  const onPointerMove = (e) => {
    if (!draggingRef.current) return;
    onChange?.(valueAt(e.clientX));
  };

  const onPointerUp = (e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    onCommit?.(valueAt(e.clientX));
  };

  return (
    <div className={cx("ph-slider", className)}>
      {left != null && (
        <span className="ph-slider__cap">
          <PixelText upper>{left}</PixelText>
        </span>
      )}

      <div
        ref={trackRef}
        className="ph-slider__track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="ph-slider__rail" />
        <div className="ph-slider__fill" style={{ width: knobLeft + knob }} />
        <div
          className={cx("ph-slider__knob", showValue && "ph-slider__knob--value")}
          style={{ left: knobLeft, width: knob }}
        >
          {showValue && <PixelText>{String(value)}</PixelText>}
        </div>
      </div>

      {right != null && (
        <span className="ph-slider__cap ph-slider__cap--r">
          <PixelText upper>{right}</PixelText>
        </span>
      )}
    </div>
  );
}

export default Slider;
