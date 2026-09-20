import { memo, useState } from "react";
import { Button, Collapse, NumberInput } from "../ui";
import { PixelText } from "../packages/pixel-text";
import { ItemIcon } from "./ItemIcon";
import { ItemIds } from "./ItemIds";
import { VariantTable } from "./VariantTable";
import { ItemTooltip } from "./ItemTooltip";
import { useItemHover } from "./useItemHover";
import "./items.css";

/**
 * One item in a list: icon, name, identity line, QL control, an action, and a
 * shelf of every template in the family.
 *
 * Memoised because these arrive in hundreds. Without it, expanding one row's
 * shelf re-renders every sibling, and each sibling holds a tooltip data hook
 * — so one click would churn the whole list.
 *
 *   qlMode "pick"  a QL control (the finder: choose what to add)
 *   qlMode "show"  a readout (the inventory: the QL is a fact, not a choice)
 */
export const ItemRow = memo(function ItemRow({
  item,
  onAction,
  actionLabel = "Add",
  showAction = true,
  qlMode = "pick",
  children,
}) {
  const members = item.members?.length
    ? item.members
    : [{ id: item.ids?.[0], name: item.name, ql: item.ql, iconSrc: item.iconSrc }];

  const qls = members.map((m) => m.ql);
  const low = Math.min(...qls);
  const high = Math.max(...qls);

  const [ql, setQl] = useState(item.ql ?? low);
  const [expanded, setExpanded] = useState(false);
  const [flash, setFlash] = useState(0);

  const active = members.findLast((m) => m.ql <= ql) ?? members[0];
  const hover = useItemHover(item, members, ql, setQl);

  const act = () => {
    onAction?.({ ...item, ql });
    // Keyed remount of the flash class, so repeated clicks each register.
    setFlash((n) => n + 1);
  };

  return (
    <div className="irow">
      <div key={flash} className={flash ? "irow__main irow__main--hit" : "irow__main"}>
        <ItemIcon
          src={active.iconSrc}
          alt={active.name ?? ""}
          className="irow__icon"
          {...hover.handlers}
        />

        <div className="irow__id">
          <PixelText className="irow__name">{active.name ?? ""}</PixelText>
          <ItemIds
            members={members}
            active={active}
            expanded={expanded}
            onToggle={members.length > 1 ? () => setExpanded((v) => !v) : undefined}
          />
        </div>

        {children}

        {showAction && (
          <div className="irow__actions">
            {qlMode === "pick" ? (
              <NumberInput
                value={ql}
                min={low}
                max={high}
                onChange={hover.setQl}
                title="Quality level"
              />
            ) : (
              <PixelText className="irow__ql ph-num">{String(ql)}</PixelText>
            )}
            <Button variant="primary" size="sm" onClick={act}>
              {actionLabel}
            </Button>
          </div>
        )}
      </div>

      {members.length > 1 && (
        <Collapse open={expanded}>
          <VariantTable members={members} />
        </Collapse>
      )}

      {hover.open && (
        <ItemTooltip
          item={item}
          data={hover.data}
          loading={hover.loading}
          at={hover.at}
          ql={ql}
          setQl={hover.setQl}
          pinned={hover.pinned}
          panelRef={hover.panelRef}
        />
      )}
    </div>
  );
});

export default ItemRow;
