import { useState } from "react";
import { PixelText } from "../ui";
import { ItemIcon } from "./ItemIcon";
import { ItemTooltip } from "./ItemTooltip";
import { useItemData } from "./useItemData";

/**
 * Every template in an item family, so you can see exactly which one a QL
 * lands on.
 *
 * One tooltip serves the whole table rather than one per row — the rows share
 * a single data hook, so hovering down the list reuses one fetch slot instead
 * of mounting and tearing down a hook per row.
 */
export function VariantTable({ members }) {
  const { data, loading, show, hide } = useItemData();
  const [at, setAt] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(null);

  const track = (e) =>
    setAt({ x: Math.round(e.clientX), y: Math.round(e.clientY) });

  const enter = (e, member) => {
    track(e);
    setHovered(member);
    show({ low_id: member.id, ...member, members: [member] }, member.ql);
  };

  const leave = () => {
    setHovered(null);
    hide();
  };

  return (
    <div className="ivar">
      <div className="ivar__head">
        <PixelText className="ivar__name">Template</PixelText>
        <PixelText className="ivar__id">ID</PixelText>
        <PixelText className="ivar__ql">QL</PixelText>
      </div>

      {members.map((member) => (
        <div
          key={`${member.id}-${member.ql}`}
          className="ivar__row"
          onMouseEnter={(e) => enter(e, member)}
          onMouseMove={track}
          onMouseLeave={leave}
        >
          <ItemIcon src={member.iconSrc} size="tiny" />
          <PixelText className="ivar__name">{member.name ?? ""}</PixelText>
          <PixelText className="ivar__id ph-num">{String(member.id)}</PixelText>
          <PixelText className="ivar__ql ph-num">{String(member.ql)}</PixelText>
        </div>
      ))}

      {hovered && (
        <ItemTooltip
          item={{ low_id: hovered.id, ...hovered, members: [hovered] }}
          data={data}
          loading={loading}
          at={at}
          ql={hovered.ql}
        />
      )}
    </div>
  );
}

export default VariantTable;
