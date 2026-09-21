/**
 * The payload turned into vertex buffers.
 *
 * Built once per dungeon, grouped by floor, so switching floors or redrawing
 * as the player moves is a uniform change and a draw call - never a rebuild.
 * Two kinds come out of one pass over the rooms:
 *
 *   flat      every walkable tile as a filled quad, then the wall segments as
 *             quads expanded to a screen-space thickness in the vertex shader,
 *             which is how a hairline stays one pixel wide at any zoom
 *   points    spawn points and anything else that is a dot
 *
 * Nothing here knows about the camera. Positions are world units and the
 * shader does the rest.
 */

/** Unpack the base64 tile bitmap the plugin sends with each room. */
export function tilesOf(room) {
  if (!room.m || !room.mw || !room.mh) return null;

  const raw = atob(room.m);
  const bits = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bits[i] = raw.charCodeAt(i);

  return {
    w: room.mw,
    h: room.mh,
    at: (x, z) => {
      const bit = z * room.mw + x;
      return (bits[bit >> 3] >> (bit & 7)) & 1;
    },
  };
}

/**
 * What a room is, read off its name - the same test the floorplan page uses.
 * The template names are descriptive and the plugin already sends them, so
 * this needs nothing from the game.
 */
export function category(name) {
  if (!name) return "room";
  if (/_mh\d|mainhall/.test(name)) return "mainhall";
  if (/boss/.test(name)) return "boss";
  if (/entrance/.test(name)) return "entrance";
  if (/endblock/.test(name)) return "endblock";
  if (/^cor_|^sew_|hallway|stair|corridor|docking/.test(name)) return "circulation";
  return "room";
}

/** Drawn in this order, so each category is one contiguous run of vertices. */
export const CATEGORIES = ["room", "circulation", "endblock", "entrance", "mainhall", "boss"];

const floorsIn = (rooms) => [...new Set(rooms.map((r) => r.f))].sort((a, b) => a - b);

/**
 * Walls and doors as flat quads: position, and the unit perpendicular the
 * shader pushes each corner along.
 */
export function buildFlat(rooms) {
  const floors = floorsIn(rooms);
  const data = [];
  const byFloor = {};

  for (const floor of floors) {
    const onFloor = rooms.filter((r) => r.f === floor);
    const group = {};

    // The floor itself, one quad per walkable tile. The client's own map fills
    // its rooms rather than outlining them, and the mask that says which tiles
    // are floor is already in the payload.
    // Emitted a category at a time, so the floor is six draw calls rather than
    // one per room - and kept per room as well, so a room you have walked
    // through can be shaded without rebuilding anything.
    const perRoom = [];
    const cats = {};

    group.tiles = span(data, 4, () => {
      for (const cat of CATEGORIES) {
        cats[cat] = span(data, 4, () => {
          for (const room of onFloor) {
            if (category(room.n) !== cat) continue;

            const tiles = tilesOf(room);
            if (!tiles) continue;

            const [ox, oz] = room.o;
            const [ux, uz] = room.u;
            const [vx, vz] = room.v;

            const one = span(data, 4, () => {
              for (let z = 0; z < tiles.h; z++) {
                for (let x = 0; x < tiles.w; x++) {
                  if (!tiles.at(x, z)) continue;
                  const p = (tx, tz) => [ox + ux * tx + vx * tz, oz + uz * tx + vz * tz];
                  fill(data, p(x, z), p(x + 1, z), p(x + 1, z + 1), p(x, z + 1));
                }
              }
            });

            if (one.count) perRoom.push({ i: room.i, ...one });
          }
        });
      }
    });

    group.cats = cats;
    group.rooms = perRoom;

    group.walls = span(data, 4, () => {
      for (const room of onFloor) {
        for (const [x1, z1, x2, z2] of room.w ?? []) quad(data, x1, z1, x2, z2);
      }
    });

    group.doors = span(data, 4, () => {
      for (const room of onFloor) {
        for (const d of room.d ?? []) {
          const [dx, dz] = heading(d.a);
          // a tick across the opening, so along the wall, not through it
          quad(data, d.x - dz * 2.2, d.z + dx * 2.2, d.x + dz * 2.2, d.z - dx * 2.2);
        }
      }
    });

    byFloor[floor] = group;
  }

  return { buffer: new Float32Array(data), byFloor, stride: 4 };
}

/** Spawn points, as positions with a size. */
export function buildPoints(rooms) {
  const floors = floorsIn(rooms);
  const data = [];
  const byFloor = {};

  for (const floor of floors) {
    const group = {};

    group.spawns = span(data, 3, () => {
      for (const room of rooms.filter((r) => r.f === floor)) {
        for (const [x, z] of room.s ?? []) data.push(x, 0, z);
      }
    });

    byFloor[floor] = group;
  }

  return { buffer: new Float32Array(data), byFloor, stride: 3 };
}

/* ── the small stuff ─────────────────────────────────────────────────────── */

export const heading = (deg) => {
  const r = (deg * Math.PI) / 180;
  return [Math.sin(r), Math.cos(r)];
};

/** Record where a group starts and how many vertices it added. */
function span(data, stride, fill) {
  const start = data.length / stride;
  fill();
  return { start, count: data.length / stride - start };
}

/**
 * A solid quad in the flat buffer. The perpendicular is zero, so the shader
 * expands it by nothing and every corner lands on the same pixel grid the
 * walls snap to - which is what keeps neighbouring tiles seamless.
 */
function fill(data, a, b, c, d) {
  for (const v of [a, b, c, a, c, d]) data.push(v[0], v[1], 0, 0);
}

/** A segment as two triangles, each corner carrying its own perpendicular. */
function quad(data, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz) || 1;
  const nx = dz / len;
  const nz = -dx / len;

  data.push(
    x1, z1, nx, nz,
    x2, z2, nx, nz,
    x2, z2, -nx, -nz,
    x1, z1, nx, nz,
    x2, z2, -nx, -nz,
    x1, z1, -nx, -nz,
  );
}


