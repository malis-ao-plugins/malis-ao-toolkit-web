import { useEffect, useRef, useState } from "react";
import { cx } from "./cx";
import { PixelInput } from "../packages/pixel-text";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Integer field with -/+ buttons and horizontal drag-to-scrub.
 *
 * `onChange` fires continuously while the value moves; `onCommit` fires once
 * the interaction ends (pointer up, blur, Enter) so callers can push config
 * without spamming the socket.
 *
 * Scrubbing steps on whole 4px of travel, matching the layout grid — the
 * value never moves by a fraction of a step.
 */
export function NumberInput({
  value,
  min = -Infinity,
  max = Infinity,
  step = 1,
  onChange,
  onCommit,
  wide = false,
  title,
}) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const dragRef = useRef(null);
  const fieldRef = useRef(null);

  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  const apply = (next, commit) => {
    const v = clamp(next, min, max);
    onChange?.(v);
    if (commit) onCommit?.(v);
    return v;
  };

  const nudge = (dir) => apply(value + dir * step, true);

  const onPointerDown = (e) => {
    if (editing) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, start: value, moved: false, last: value };
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const steps = Math.trunc((e.clientX - d.x) / 4);
    if (steps === 0 && !d.moved) return;
    d.moved = true;
    const next = clamp(d.start + steps * step, min, max);
    if (next !== d.last) {
      d.last = next;
      onChange?.(next);
    }
  };

  const onPointerUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (d.moved) {
      onCommit?.(d.last);
    } else {
      // A click with no travel means "let me type".
      setEditing(true);
      fieldRef.current?.select();
    }
  };

  const commitText = () => {
    setEditing(false);
    const parsed = parseInt(text, 10);
    if (Number.isNaN(parsed)) {
      setText(String(value));
      return;
    }
    const v = apply(parsed, true);
    setText(String(v));
  };

  return (
    <div
      className={cx("ph-num-input", wide && "ph-num-input--wide")}
      title={title}
    >
      <button
        type="button"
        className="ph-num-input__btn"
        tabIndex={-1}
        onClick={() => nudge(-1)}
      >
        {"−"}
      </button>

      <PixelInput
        ref={fieldRef}
        className="ph-num-input__field"
        align="center"
        value={text}
        inputMode="numeric"
        readOnly={!editing}
        onChange={(e) => setText(e.target.value)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setText(String(value));
            setEditing(false);
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            nudge(1);
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            nudge(-1);
          }
        }}
      />

      <button
        type="button"
        className="ph-num-input__btn"
        tabIndex={-1}
        onClick={() => nudge(1)}
      >
        +
      </button>
    </div>
  );
}

export default NumberInput;
