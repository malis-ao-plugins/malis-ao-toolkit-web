import { useState } from "react";
import { PixelText, wrapToWidth } from "../../ui";

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
 */
export function useHoverNote() {
  const [note, setNote] = useState(null);

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

  const element = note ? (
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
    </div>
  ) : null;

  return { bind, element };
}

export default useHoverNote;
