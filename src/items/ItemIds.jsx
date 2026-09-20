import { Button, PixelText, Row } from "../ui";

/**
 * The identity line under an item's name: which template you are looking at,
 * and the QL span the family covers.
 *
 * A family with more than one template gets a control to open the variant
 * shelf, labelled with the count — the count is the reason to open it. The
 * caret is the same one the character select uses, so a thing that opens
 * looks like a thing that opens wherever it appears.
 */
export function ItemIds({ members, active, expanded, onToggle }) {
  const qls = members.map((m) => m.ql);
  const low = Math.min(...qls);
  const high = Math.max(...qls);

  return (
    <Row gap={1} className="iids">
      <PixelText className="iids__tag">
        {`ID ${(active ?? members[0]).id}`}
      </PixelText>
      <PixelText className="iids__tag">
        {low === high ? `QL ${low}` : `QL ${low}-${high}`}
      </PixelText>

      {onToggle && (
        <Button
          size="sm"
          variant="ghost"
          className="iids__more"
          title={expanded ? "Hide variants" : "Show every template"}
          onMouseDown={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <span className={`ph-caret${expanded ? " ph-caret--open" : ""}`} />
          <PixelText>{String(members.length)}</PixelText>
        </Button>
      )}
    </Row>
  );
}

export default ItemIds;
