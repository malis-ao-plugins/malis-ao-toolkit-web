import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "./cx";
import { PixelText } from "./pixel";

const KNOB = 4; // keep in sync with --u in ui.css

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Horizontal value picker with optional end captions.
 *
 * The knob is positioned by an integer `left` in pixels, computed from the
 * measured track width. Using a percentage would put it on a half-pixel and
 * smear the 4px bar.
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

  const span = Math.max(1, width - KNOB);
  const ratio = (clamp(value, min, max) - min) / (max - min || 1);
  const knobLeft = Math.round(ratio * span);

  const valueAt = useCallback(
    (clientX) => {
      const el = trackRef.current;
      if (!el) return value;
      const rect = el.getBoundingClientRect();
      const x = clamp(clientX - rect.left - KNOB / 2, 0, span);
      return Math.round(min + (x / span) * (max - min));
    },
    [min, max, span, value],
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
        <PixelText upper className="ph-slider__cap">
          {left}
        </PixelText>
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
        <div className="ph-slider__fill" style={{ width: knobLeft + KNOB }} />
        <div className="ph-slider__knob" style={{ left: knobLeft }} />
      </div>

      {right != null && (
        <PixelText upper className="ph-slider__cap ph-slider__cap--r">
          {right}
        </PixelText>
      )}
      {showValue && (
        <PixelText className="ph-slider__val">{String(value)}</PixelText>
      )}
    </div>
  );
}

export default Slider;
