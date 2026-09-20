import { useState } from "react";

/**
 * Cursor-following note for mission descriptions.
 *
 * The old build faked an item-tooltip payload to show this text, which meant a
 * mission had to pretend it had requirements, mods and stats. This just shows
 * the text.
 *
 * Coordinates are rounded to whole pixels so the panel never lands on a half
 * pixel and blurs the glyphs inside it.
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
      {note.text}
    </div>
  ) : null;

  return { bind, element };
}

export default useHoverNote;
