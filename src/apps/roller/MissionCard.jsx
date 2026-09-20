import { useEffect, useState } from "react";
import { Button, PixelText, Row, Slot } from "../../ui";
import { useResolvedItems } from "../../hooks/useResolvedItems";
import { getIcon } from "../../lib/db";
import { PLAYFIELDS } from "../../lib/data";
import { compact, exact } from "./rollerData";

const REWARD_SLOTS = 6;
const NO_REWARDS = [];

// Card width at the 320px target leaves ~254px beside the icon. The face is
// proportional now, so these are widths rather than a count of cells —
// PixelText measures the string and spends the tail on an ellipsis.
const NAME_PX = 248;
const ZONE_PX = 112;

const playfieldName = (id) =>
  PLAYFIELDS.find((p) => p.id === Number(id))?.name || `PF ${id}`;

/** Pick the template matching the entry's QL — members[0] is the lowest one. */
const iconFor = (item) => {
  if (!item?.members?.length) return item?.iconSrc ?? null;
  const m = item.members.find((x) => x.ql === item.ql) ?? item.members[0];
  return m.iconSrc ?? null;
};

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
export function MissionCard({ mission, onAccept, onPing, noteBind }) {
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
            fit="parent"
            className="rl-mission__name"
            title={mission.name}
          >
            {mission.name}
          </PixelText>

          <PixelText fit="parent" className="rl-mission__zone" title={zone}>
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

      <Row gap={1} className="rl-mission__rewards">
        {Array.from({ length: REWARD_SLOTS }, (_, i) => {
          const item = rewards[i];
          return (
            <Slot
              key={item?.low_id ?? item?.id ?? `empty-${i}`}
              src={iconFor(item)}
              title={item?.name}
              size="sm"
            />
          );
        })}
      </Row>

      <Row gap={1}>
        <Button variant="primary" block onClick={onAccept}>
          <PixelText>ACCEPT</PixelText>
        </Button>
        <Button onClick={onPing} title="Ping this mission in the client">
          <PixelText>PING</PixelText>
        </Button>
      </Row>
    </div>
  );
}

export default MissionCard;
