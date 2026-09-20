import { useEffect, useState } from "react";
import {
  Button,
  PixelInput,
  PixelText,
  Row,
  Stack,
  DEFAULT_FAMILY,
  addRasterizedFamily,
  customFamilies,
  families,
  removeRasterizedFamily,
} from "../ui";

/**
 * Name the face the whole UI draws with.
 *
 * A field rather than a list of the faces that happen to be bundled. Three
 * of them are atlases exported through GDI — the same machinery the game
 * rasterises with, which is why they match it exactly — but any other name
 * is rasterised on the spot from what the machine has installed, so a list
 * of three was offering the small part of the answer as if it were all of
 * it. Typing "verdana" still gets the exported atlas; typing anything else
 * gets a face built here.
 *
 * Built here means the browser draws each glyph once and the greys are
 * thrown away. That needs nothing installed and no build step, and it is
 * not as good: with Windows font smoothing on the outlines were never
 * fitted to the pixel grid, and thresholding them leaves uneven stems at
 * small sizes. Good enough to try a face; a face worth keeping wants a real
 * export.
 *
 * A name the system does not have is not an error anywhere. The browser
 * silently substitutes a default and every glyph comes back as that, and
 * nothing in the result says so — the preview above is what tells you.
 */
export function FontField({ value, onChange }) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  // Follows the theme, so Reset and the preview agree with the field.
  useEffect(() => setDraft(value), [value]);

  const apply = () => {
    const name = draft.trim();
    if (!name || busy) return;

    // Already registered — bundled or rasterised earlier. Matched loosely and
    // switched to under its own spelling, so "Verdana" reaches the exported
    // atlas instead of quietly rebuilding it out of the browser.
    const known = families().find(
      (family) => family.toLowerCase() === name.toLowerCase(),
    );
    if (known) {
      setDraft(known);
      onChange(known);
      return;
    }

    setBusy(true);
    // Four atlases of latin1, each glyph drawn and read back: enough work to
    // hold the thread. A frame first, so the button has said so before it
    // stops answering.
    requestAnimationFrame(() => {
      try {
        const family = addRasterizedFamily(name);
        if (family) onChange(family);
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <Stack gap={2}>
      <Row gap={2}>
        <PixelInput
          className="ph-input set__font"
          value={draft}
          placeholder="Windows font name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          onBlur={apply}
        />
        <Button
          size="sm"
          disabled={busy || !draft.trim() || draft.trim() === value}
          title="Draw the UI in this face"
          onClick={apply}
        >
          {busy ? "..." : "Use"}
        </Button>
        {customFamilies().includes(value) && (
          <Button
            size="sm"
            variant="danger"
            title="Forget this face"
            onClick={() => {
              removeRasterizedFamily(value);
              onChange(DEFAULT_FAMILY);
            }}
          >
            Drop
          </Button>
        )}
      </Row>

      <PixelText fit className="set__hint">
        Verdana, Tahoma and Lucida Console are exported; anything else is
        drawn by the browser.
      </PixelText>
    </Stack>
  );
}

export default FontField;
