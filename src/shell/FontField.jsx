import { useEffect, useState } from "react";
import {
  Button,
  PixelInput,
  PixelText,
  Row,
  Segmented,
  Stack,
  DEFAULT_FAMILY,
  addRasterizedFamily,
  customFamilies,
  families,
  onFamilyChange,
  removeRasterizedFamily,
} from "../ui";

/**
 * Choose the face the whole UI draws with, and add one the machine has.
 *
 * The shipped faces are atlases exported through GDI — the same machinery
 * the game itself rasterises with, which is why they match it exactly. There
 * are only three, because each one is a file somebody has to generate.
 *
 * So anything else is rasterised here instead: the browser draws each glyph
 * once and the greys are thrown away, which needs nothing installed and no
 * build step. It is not as good — with Windows font smoothing on, the
 * outlines were never fitted to the pixel grid and thresholding them leaves
 * uneven stems at small sizes — so it is offered as a way to try a face
 * rather than a replacement for exporting one.
 *
 * A name the system does not have is not an error anywhere: the browser
 * silently substitutes a default and every glyph comes back as that. Nothing
 * in the result says so, so the preview above is what tells you.
 */

/** "Lucida Console" as shipped, "verdana" as exported. */
const titleCase = (name) =>
  String(name)
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export function FontField({ value, onChange }) {
  const [list, setList] = useState(families);
  const [made, setMade] = useState(customFamilies);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      onFamilyChange(() => {
        setList(families());
        setMade(customFamilies());
      }),
    [],
  );

  const add = () => {
    const name = draft.trim();
    if (!name || busy) return;

    setBusy(true);
    // Four atlases of latin1, each glyph drawn and read back: enough work to
    // hold the thread. A frame first, so the button has said so before it
    // stops answering.
    requestAnimationFrame(() => {
      try {
        const family = addRasterizedFamily(name);
        if (family) {
          setDraft("");
          onChange(family);
        }
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <Stack gap={2}>
      <Segmented
        items={list.map((family) => ({
          value: family,
          label: titleCase(family),
        }))}
        value={value}
        onChange={onChange}
      />

      <Row gap={2}>
        <PixelInput
          value={draft}
          placeholder="Windows font name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button
          size="sm"
          disabled={busy || !draft.trim()}
          title="Rasterise this face from the system, at the sizes the kit uses"
          onClick={add}
        >
          {busy ? "..." : "Add"}
        </Button>
        {made.includes(value) && (
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
        Added faces are drawn by the browser, not exported — good enough to
        try one.
      </PixelText>
    </Stack>
  );
}

export default FontField;
