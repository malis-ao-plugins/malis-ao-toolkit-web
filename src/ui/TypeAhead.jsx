import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PixelInput } from "./PixelInput";
import { PixelText } from "./pixel";
import { cx } from "./cx";

/**
 * Text field with a filtered drop-down under it.
 *
 * The three filter controls each had their own copy of this — same state, same
 * key handling, same portalled list, three chances to get it subtly different.
 *
 * The list is portalled to the body so it escapes the panel's `overflow`, and
 * positioned from the field's rect. `options` is whatever the caller has
 * already filtered; this component does not search, it only presents.
 *
 *   options: [{ key, label, hint? }]
 */
export const TypeAhead = forwardRef(function TypeAhead(
  {
    value,
    onChange,
    options = [],
    onPick,
    onCancel,
    onKeyDownExtra,
    placeholder = "Search...",
    className,
    emptyHint,
  },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
  }));

  const pick = useCallback(
    (option) => {
      onPick?.(option);
      setActive(-1);
    },
    [onPick],
  );

  const onKeyDown = (e) => {
    // Host first: a tag field wants Backspace before we do anything with it.
    onKeyDownExtra?.(e);
    if (e.defaultPrevented) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setOpen(true);
        setActive((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(i - 1, -1));
        break;
      case "Enter":
        e.preventDefault();
        if (active >= 0 && options[active]) pick(options[active]);
        break;
      case "Escape":
        e.preventDefault();
        if (onCancel?.() === false) return; // the caller handled it
        setOpen(false);
        inputRef.current?.blur();
        break;
      default:
        break;
    }
  };

  const rect = wrapRef.current?.getBoundingClientRect();

  return (
    <div className={cx("ta", className)} ref={wrapRef}>
      <PixelInput
        ref={inputRef}
        className="ph-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // A click on a list item blurs the field first, so the close is
        // deferred long enough for the mousedown to land.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />

      {open &&
        rect &&
        createPortal(
          <div
            className="ta__list ph"
            /* As wide as the field at least, and as wide as its longest
               option at most. Taking the field's width outright cut every
               label in a tag field, where the input is only the sliver left
               over beside the tags. Capped at the window edge so a long
               option cannot push the list off screen. */
            style={{
              position: "fixed",
              top: Math.round(rect.bottom + 2),
              left: Math.round(rect.left),
              minWidth: Math.round(rect.width),
              maxWidth: Math.max(
                Math.round(rect.width),
                Math.round(window.innerWidth - rect.left - 8),
              ),
            }}
          >
            {options.length === 0 ? (
              <div className="ta__empty">
                <PixelText upper>{emptyHint ?? "No match"}</PixelText>
              </div>
            ) : (
              options.map((option, i) => (
                <div
                  key={option.key}
                  className={cx("ta__item", i === active && "ta__item--on")}
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep focus so typing can continue
                    pick(option);
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  <PixelText className="ta__label">{option.label}</PixelText>
                  {option.hint && (
                    <PixelText className="ta__hint">{option.hint}</PixelText>
                  )}
                </div>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
});

export default TypeAhead;
