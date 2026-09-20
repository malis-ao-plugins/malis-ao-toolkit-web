import { useEffect, useRef, useState } from "react";
import { PixelText } from "./pixel";
import "./pixel-select.css";

/**
 * Drop-down whose text is drawn from the atlas.
 *
 * A native <select> cannot be used: its popup is drawn by the operating
 * system, outside the page entirely, so nothing in CSS reaches the option
 * text. This is a button plus a listbox — more code than a <select>, but it
 * is the only way the choices render as pixels.
 *
 * Keyboard support is the part people drop, so it is here: arrows move,
 * Home/End jump, Enter and Space commit, Escape cancels, Tab closes. The
 * trigger carries the ARIA roles a real select would.
 *
 *   options: [{ value, label }]
 *   maxPx:   truncate a long label to this pixel width
 */
export function PixelSelect({
  value,
  options,
  onChange,
  placeholder = "Select...",
  size = 13,
  upper = false,
  maxPx,
  className = "",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);

  const index = options.findIndex((o) => o.value === value);
  const selected = index >= 0 ? options[index] : null;

  useEffect(() => {
    if (!open) return;
    setActive(index >= 0 ? index : 0);
  }, [open, index]);

  // Close on any pointer outside, which is what a real select does.
  useEffect(() => {
    if (!open) return;
    const away = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // Keep the highlighted row in view without smooth scrolling, which would
  // land the list on fractional offsets mid-animation.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[active];
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const commit = (i) => {
    const opt = options[i];
    if (opt) onChange?.(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (disabled) return;

    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(active);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className={`pxs ${className}`} ref={rootRef}>
      <button
        type="button"
        className="pxs__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
      >
        <PixelText
          size={size}
          upper={upper}
          maxPx={maxPx}
          className={`pxs__value${selected ? "" : " pxs__value--empty"}`}
        >
          {selected ? selected.label : placeholder}
        </PixelText>
        {/* Drawn with borders rather than a glyph: the atlases are latin1,
            and a triangle is not in latin1. A border triangle is also exact
            on the pixel grid, which a scaled glyph would not be. */}
        <span className={`pxs__caret${open ? " pxs__caret--open" : ""}`} />
      </button>

      {open && (
        <div className="pxs__list" role="listbox" ref={listRef}>
          {options.map((o, i) => (
            <div
              key={o.value ?? i}
              role="option"
              aria-selected={o.value === value}
              className={
                "pxs__option" +
                (i === active ? " pxs__option--active" : "") +
                (o.value === value ? " pxs__option--on" : "")
              }
              onPointerEnter={() => setActive(i)}
              onClick={() => commit(i)}
            >
              <PixelText size={size} upper={upper} maxPx={maxPx}>
                {o.label}
              </PixelText>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PixelSelect;
