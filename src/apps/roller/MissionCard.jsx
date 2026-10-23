import { useEffect, useState } from "react";
import { Button, PixelText, Row, Slot } from "../../ui";
import { useResolvedItems } from "../../hooks/useResolvedItems";
import { ItemTooltip, useItemHover } from "../../items";
import { getIcon } from "../../lib/db";
import { PLAYFIELDS } from "../../lib/data";
import { compact, exact } from "./rollerData";

const REWARD_SLOTS = 6;
const NO_REWARDS = [];

const playfieldName = (id) =>
  PLAYFIELDS.find((p) => p.id === Number(id))?.name || `PF ${id}`;

/** Pick the template matching the entry's QL — members[0] is the lowest one. */
const iconFor = (item) => {
  if (!item?.members?.length) return item?.iconSrc ?? null;
  const m = item.members.find((x) => x.ql === item.ql) ?? item.members[0];
  return m.iconSrc ?? null;
};

/**
 * A reward, with the same tooltip as an item in Browse: hover to preview,
 * click to pin and pick a QL.
 */
function RewardSlot({ item }) {
  const members = item.members ?? NO_REWARDS;
  const [ql, setQl] = useState(item.ql);
  const hover = useItemHover(item, members, ql, setQl);

  return (
    <>
      <Slot src={iconFor(item)} size="sm" {...hover.handlers} />
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
    </>
  );
}

/**
 * One rolled mission.
 *
 * Three fixed rows — identity, rewards, actions — so a list of cards reads as
 * a column of aligned data rather than a stack of differently-shaped boxes.
 * The identity block is itself three lines: what it is, where it is, and
 * what it pays. The pay used to share a line with the zone, which left both
 * of them fighting for a 320px row.
 *
 * The name and the zone truncate to the column they are in rather than to a
 * width measured once at the 320px target — the window is resizable, and a
 * fixed budget is either short of the room or past the edge of it.
 * Reward icons use the kit's small slot, which is 24px — AO icon art is
 * 48x48, so only its whole divisors resample cleanly.
 *
 * Text goes through PixelText rather than the font, because Chromium on
 * Windows antialiases every glyph it rasterises and offers no way to stop it.
 * See src/pixelfont/README.md.
 */
export function MissionCard({ mission, onAccept, noteBind }) {
  const rewards = useResolvedItems(mission.rewards ?? NO_REWARDS);
  const [icon, setIcon] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getIcon(mission.icon).then((src) => !cancelled && setIcon(src));
    return () => {
      cancelled = true;
    };
  }, [mission.icon]);

  const zone = playfieldName(mission.playfield);

  return (
    <div className="rl-mission">
      <Row gap={2} className="rl-mission__head">
        <Slot
          src={icon}
          className="rl-mission__icon"
          {...noteBind(mission.description)}
        />
        <div className="rl-mission__id">
          <PixelText
            size={16}
            fit
            className="rl-mission__name"
            title={mission.name}
          >
            {mission.name}
          </PixelText>

          <PixelText fit className="rl-mission__zone" title={zone}>
            {zone}
          </PixelText>

          <Row gap={2} className="rl-mission__meta">
            <PixelText
              className="ph-num"
              title={`${exact(mission.credits)} - ${exact(mission.creditsMax)} credits`}
            >
              {`${compact(mission.creditsMax)}cr`}
            </PixelText>
            <PixelText className="ph-num" title={`${exact(mission.xp)} xp`}>
              {`${compact(mission.xp)}xp`}
            </PixelText>
          </Row>
        </div>
      </Row>

      <div className="rl-mission__foot">
        <Row gap={1} className="rl-mission__rewards">
          {Array.from({ length: REWARD_SLOTS }, (_, i) => {
            const item = rewards[i];
            return item ? (
              <RewardSlot key={`${i}-${item.low_id}`} item={item} />
            ) : (
              <Slot key={`empty-${i}`} size="sm" />
            );
          })}
        </Row>

        <Row gap={1} className="rl-mission__go">
          <Button variant="primary" block onClick={onAccept}>
            <PixelText>ACCEPT</PixelText>
          </Button>
        </Row>
      </div>
    </div>
  );
}

export default MissionCard;
