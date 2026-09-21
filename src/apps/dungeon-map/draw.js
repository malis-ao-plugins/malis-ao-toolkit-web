/**
 * Where to look, and at what. Pure functions over the payload the plugin
 * sends - the drawing itself is in gl/renderer.js.
 *
 * The plugin sends world X/Z. Screen x is world X and screen y is world Z, so
 * the flat view is the dungeon seen from above with +Z running down.
 */

export const roomsOnFloor = (rooms, floor) =>
  (rooms ?? []).filter((r) => r.f === floor);

export const floorsOf = (rooms) =>
  [...new Set((rooms ?? []).map((r) => r.f))].sort((a, b) => a - b);

/** World bounds of a set of rooms, from their walls. */
export function bounds(rooms) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;

  for (const room of rooms) {
    for (const [x1, z1, x2, z2] of room.w ?? []) {
      minX = Math.min(minX, x1, x2);
      maxX = Math.max(maxX, x1, x2);
      minZ = Math.min(minZ, z1, z2);
      maxZ = Math.max(maxZ, z1, z2);
    }
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minZ, maxX, maxZ };
}

/** Scale and offset that put `box` inside `w` x `h` with a margin. */
export function fit(box, w, h, pad = 12) {
  if (!box) return { scale: 1, cx: 0, cz: 0 };
  const bw = Math.max(box.maxX - box.minX, 1);
  const bh = Math.max(box.maxZ - box.minZ, 1);
  const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  return {
    scale,
    cx: (box.minX + box.maxX) / 2,
    cz: (box.minZ + box.maxZ) / 2,
  };
}

/**
 * The camera, in device pixels, and the one place rounding happens.
 *
 * Rounding each wall to the pixel grid as it is drawn looks stable while the
 * view is still and crawls the moment it moves: every wall crosses its own
 * rounding boundary at its own time, so the picture squirms instead of
 * sliding. Two rules fix it, and they are the usual pair for a pixel-grid
 * camera:
 *
 *   the scale is quantised so one tile is a whole number of device pixels,
 *   which puts every wall of a room on the same subpixel phase;
 *
 *   the translation is rounded once, here, so the whole scene shifts as one
 *   rigid thing - by a whole pixel or not at all, never by a fraction, and
 *   never by a different amount in one corner than another.
 *
 * What moves smoothly after that is the player and the dynels, which are
 * filled shapes rather than hairlines and are meant to glide.
 */
export function cameraFor(view, w, h, dpr = 1, step = 2) {
  const wanted = view.scale * dpr;
  // whole device pixels per tile, and never less than one
  const unit = Math.max(1, Math.round(step * wanted));
  const scale = unit / step;

  return {
    scale,
    dpr,
    unit,
    tx: Math.round((w * dpr) / 2 - view.cx * scale),
    ty: Math.round((h * dpr) / 2 - view.cz * scale),
    /** device px width for a hairline, and the offset that centres it */
    stroke: Math.max(1, Math.round(dpr)),
  };
}

/** World -> device pixels, under a camera. */
export const project = (camera) => (x, z) => [
  x * camera.scale + camera.tx,
  z * camera.scale + camera.ty,
];

/** Device pixels -> world, the same camera read backwards. */
export const unproject = (camera) => (px, py) => [
  (px - camera.tx) / camera.scale,
  (py - camera.ty) / camera.scale,
];

/** The room whose walls enclose a world point, for hover. */
export function roomAt(rooms, floor, x, z) {
  for (const room of roomsOnFloor(rooms, floor)) {
    const box = bounds([room]);
    if (!box) continue;
    if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) return room;
  }
  return null;
}
