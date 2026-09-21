/**
 * The payload, turned the right way up.
 *
 * The game's coordinates are left-handed: seen from above with +X to the
 * right, +Z runs *up* the screen. Every projection in here is the ordinary
 * screen kind, where +Z runs down - so the map came out mirrored against the
 * client's own PF Map, with the entrance at the bottom instead of the top.
 *
 * Flipping Z once, here at the door, is the whole of the fix. The walls, the
 * tile basis, the spawn dots, the markers and the hit test all then read the
 * same numbers, and nothing downstream has to know which way round the game
 * holds its world.
 */

/** Headings are read as [sin, cos], so mirroring Z is 180 - a. */
export const flipAngle = (deg) => (typeof deg === "number" ? 180 - deg : deg);

const flipPair = (p) => (Array.isArray(p) ? [p[0], -p[1]] : p);

/** A dungeon message. Rooms are rewritten; everything else is passed through. */
export function flipDungeon(payload) {
  if (!payload?.rooms) return payload;

  return {
    ...payload,
    rooms: payload.rooms.map((room) => ({
      ...room,
      c: flipPair(room.c),
      // the tile grid's origin and its two basis vectors
      o: flipPair(room.o),
      u: flipPair(room.u),
      v: flipPair(room.v),
      w: room.w?.map(([x1, z1, x2, z2]) => [x1, -z1, x2, -z2]),
      s: room.s?.map(flipPair),
      d: room.d?.map((door) => ({ ...door, z: -door.z, a: flipAngle(door.a) })),
    })),
  };
}

/** Anything that stands somewhere and may be facing: the player, a dynel. */
export const flipMover = (m) =>
  m == null ? m : { ...m, z: -m.z, ...("a" in m ? { a: flipAngle(m.a) } : {}) };
