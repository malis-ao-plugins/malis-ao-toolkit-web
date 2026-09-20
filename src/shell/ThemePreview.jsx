import { useState } from "react";
import {
  Badge,
  Button,
  NumberInput,
  PixelText,
  Row,
  SearchInput,
  Stack,
  Stat,
  Toggle,
} from "../ui";
import Tabs from "../components/Tabs";
import { ItemIcon } from "../items";

/**
 * A live example of what a group of colours actually drives.
 *
 * Real components, not a drawing of them: they read the same tokens
 * everything else does, so the example cannot drift from the app and a
 * change shows up here the instant it is made. Interactive too, because
 * half of what a colour does is only visible on hover or when something is
 * on.
 */

const PREVIEW_TABS = [
  { id: "a", label: "Roll" },
  { id: "b", label: "Browse" },
];

/**
 * The three steps the kit asks for, so a family's range — or lack of one —
 * is visible before it is chosen. A family with a single exported size
 * draws all three the same.
 */
function TypePreview() {
  return (
    <Stack gap={1}>
      <PixelText size={20}>Retrieve the data cube</PixelText>
      <PixelText size={16}>Pristine Kevlar Vest</PixelText>
      <PixelText>ID 100201 &middot; QL 1-300 &middot; 842.5k credits</PixelText>
    </Stack>
  );
}

function AccentPreview() {
  const [on, setOn] = useState(true);
  const [tab, setTab] = useState("a");

  return (
    <Stack gap={2}>
      <Tabs tabs={PREVIEW_TABS} activeId={tab} onSelect={setTab} />
      <Row gap={1} wrap>
        <Button variant="primary">Roll</Button>
        <Button>Ping</Button>
        <Button variant="danger">Stop</Button>
      </Row>
      <Row gap={1} wrap>
        <Toggle label="Auto accept" on={on} onChange={setOn} />
        <Badge tone="accent">Nodrop</Badge>
      </Row>
    </Stack>
  );
}

function DataPreview() {
  return (
    <Stack gap={2}>
      <Row gap={2} wrap>
        <Stat k="Credits" v="842.5k" num />
        <Stat k="XP" v="31.2k" num />
      </Row>
      <Row gap={1} wrap>
        <Badge tone="info">QL 200</Badge>
        <NumberInput value={200} min={1} max={300} onChange={() => {}} />
      </Row>
    </Stack>
  );
}

function TextPreview() {
  return (
    <Stack gap={2}>
      <PixelText size={16}>Pristine Kevlar Vest</PixelText>
      <Stat k="Slot" v="Chest" />
      <SearchInput value="" onChange={() => {}} placeholder="Search..." count={9} />
    </Stack>
  );
}

/**
 * An item row and two lines of its tooltip.
 *
 * Assembled from the real classes rather than from ItemRow itself: a real
 * row carries a hover that fetches the item's stats, and a preview has no
 * business opening sockets to demonstrate a colour.
 */
function ItemsPreview() {
  return (
    <Stack gap={2}>
      <div className="irow">
        <div className="irow__main">
          <ItemIcon className="irow__icon" />
          <div className="irow__id">
            <PixelText fit className="irow__name">
              Pristine Kevlar Vest
            </PixelText>
            <Row gap={1} className="iids">
              <PixelText className="iids__tag">ID 100201</PixelText>
              <PixelText className="iids__tag">QL 1-300</PixelText>
            </Row>
          </div>
          <div className="irow__actions">
            <PixelText className="irow__ql">200</PixelText>
          </div>
        </div>
      </div>

      <Stack gap={1}>
        <div className="tt-row">
          <PixelText className="tt-label">Agility</PixelText>
          <PixelText style={{ color: "var(--c-good)" }}>+12</PixelText>
        </div>
        <div className="tt-row">
          <PixelText className="tt-label">Damage</PixelText>
          <PixelText style={{ color: "var(--c-bad)" }}>10-20</PixelText>
        </div>
      </Stack>
    </Stack>
  );
}

function SurfacePreview() {
  return (
    <div className="set__surface">
      <div className="set__surface-head">
        <PixelText upper>Window</PixelText>
      </div>
      <div className="set__surface-body">
        <div className="set__surface-panel">
          <PixelText upper>Panel</PixelText>
        </div>
        {/* Overflowing on purpose: a scrollbar cannot be previewed without
            something to scroll. */}
        <div className="set__surface-scroll">
          <PixelText>A line between them</PixelText>
          <PixelText>And something to scroll</PixelText>
          <PixelText>So the bar has a reason to appear</PixelText>
        </div>
      </div>
    </div>
  );
}

const PREVIEWS = {
  type: TypePreview,
  accent: AccentPreview,
  data: DataPreview,
  text: TextPreview,
  items: ItemsPreview,
  surface: SurfacePreview,
};

export function ThemePreview({ group }) {
  const Preview = PREVIEWS[group];
  if (!Preview) return null;

  return (
    <div className="set__preview">
      <Preview />
    </div>
  );
}

export default ThemePreview;
