import { Button, Row } from "../ui";
import { PixelText } from "../packages/pixel-text";

/**
 * The identity line under an item's name: which template you are looking at,
 * and the QL span the family covers.
 *
 * A family with more than one template gets a control to open the variant
 * shelf, labelled with the count — the count is the reason to open it.
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
        {low === high ? `QL ${low}` : `QL ${low}–${high}`}
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
          {`${expanded ? "−" : "+"} ${members.length}`}
        </Button>
      )}
    </Row>
  );
}

export default ItemIds;
