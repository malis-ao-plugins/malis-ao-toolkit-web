import { useState } from "react";
import { createPortal } from "react-dom";
import { PixelText, useFontRefresh, wrapToWidth } from "../../ui";

/** Matches .rl-note's box in roller.css: 264px less 8px of padding each side. */
const NOTE_PX = 248;

/**
 * Cursor-following note for mission descriptions.
 *
 * The old build faked an item-tooltip payload to show this text, which meant a
 * mission had to pretend it had requirements, mods and stats. This just shows
 * the text.
 *
 * Coordinates are rounded to whole pixels so the panel never lands on a half
 * pixel and blurs the glyphs inside it.
 *
 * The text was the last raw string left in the app, rendering in the
 * fallback font while everything around it came from the atlas. A mask
 * cannot wrap, so it is broken into lines here and drawn a line at a time.
 *
 * Portalled to the body, like the item tooltip. The app window has
 * `contain: layout paint`, which makes it the box a fixed element inside it
 * is placed against, so the note sat a whole window's offset away from the
 * pointer and was clipped at the window's edge.
 */
export function useHoverNote() {
  const [note, setNote] = useState(null);

  // The lines are broken here, so a change of face has to re-break them.
  useFontRefresh();

  const bind = (text) =>
    text
      ? {
          onMouseEnter: (e) =>
            setNote({ text, x: Math.round(e.clientX), y: Math.round(e.clientY) }),
          onMouseMove: (e) =>
            setNote((n) =>
              n ? { ...n, x: Math.round(e.clientX), y: Math.round(e.clientY) } : n,
            ),
          onMouseLeave: () => setNote(null),
        }
      : {};

  const element = note ? createPortal(
    <div
      className="rl-note"
      style={{
        position: "fixed",
        left: Math.min(note.x + 12, window.innerWidth - 280),
        top: Math.min(note.y + 12, window.innerHeight - 120),
      }}
    >
      {wrapToWidth(note.text, NOTE_PX).map((line, i) => (
        <PixelText key={i}>{line}</PixelText>
      ))}
    </div>,
    document.body,
  ) : null;

  return { bind, element };
}

export default useHoverNote;
