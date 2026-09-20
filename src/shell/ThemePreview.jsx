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
        <div className="set__surface-panel">
          <PixelText>A line between them</PixelText>
        </div>
      </div>
    </div>
  );
}

const PREVIEWS = {
  accent: AccentPreview,
  data: DataPreview,
  text: TextPreview,
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
