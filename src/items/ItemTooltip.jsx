import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, NumberInput, PixelText, Row } from "../ui";
import { TooltipBody } from "./TooltipBody";

const MAX_H = 600;
const GAP = 12;
const EDGE = 8;

/**
 * The floating item panel.
 *
 * Portalled to the body so no panel's `overflow` can clip it, and flipped to
 * the other side of the pointer when it would otherwise run off an edge. Its
 * own size is measured after paint, because the contents are fetched and the
 * height is not known until they arrive.
 *
 * Coordinates are rounded: the panel is full of pixel-drawn text, and half a
 * pixel of offset would soften every glyph in it.
 */
export function ItemTooltip({
  item,
  data,
  loading,
  at,
  ql,
  setQl,
  pinned = false,
  panelRef,
}) {
  const innerRef = useRef(null);
  const ref = panelRef ?? innerRef;
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setSize({ w: el.offsetWidth, h: Math.min(el.offsetHeight, MAX_H) });
  }, [data, loading, ref]);

  if (!item) return null;

  const flipX = at.x + GAP + size.w > window.innerWidth - EDGE;
  const flipY = at.y + GAP + size.h > window.innerHeight - EDGE;

  const left = Math.round(
    Math.max(EDGE, flipX ? at.x - GAP - size.w : at.x + GAP),
  );
  const top = Math.round(
    Math.max(EDGE, flipY ? Math.max(EDGE, at.y - GAP - size.h) : at.y + GAP),
  );

  const members = item.members ?? [];
  const low = members[0]?.ql;
  const high = members[members.length - 1]?.ql;
  const hasRange = low != null && high != null && low !== high;

  const active = members.findLast?.((m) => m.ql <= ql) ?? members[0];
  const flags = (data?.flags ?? []).filter((f) =>
    ["No Drop", "Unique"].includes(f),
  );

  return createPortal(
    <div
      ref={ref}
      className="itt ph"
      style={{ left, top, maxHeight: MAX_H, pointerEvents: pinned ? "auto" : "none" }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="itt__head">
        <div className="itt__title">
          <PixelText size={16} className="itt__name">
            {active?.name ?? item.name ?? ""}
          </PixelText>

          {flags.length > 0 && (
            <Row gap={1}>
              {flags.map((flag) => (
                <Badge key={flag} tone="accent">
                  {flag === "No Drop" ? "NODROP" : flag.toUpperCase()}
                </Badge>
              ))}
            </Row>
          )}
        </div>

        {/* Only offered when pinned — an unpinned tooltip cannot be reached
            with the pointer, so a control on it would be a tease. */}
        {hasRange && pinned && setQl && (
          <NumberInput value={ql} min={low} max={high} onChange={setQl} />
        )}
      </div>

      <div className="itt__body">
        {loading && !data ? (
          <PixelText upper className="itt__loading">
            Loading...
          </PixelText>
        ) : data ? (
          <TooltipBody data={data} />
        ) : (
          <PixelText upper className="itt__loading">
            No data
          </PixelText>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default ItemTooltip;
