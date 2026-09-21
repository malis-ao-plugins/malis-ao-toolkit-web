import { flipAngle, flipDungeon, flipMover } from "./payload";
import { heading } from "./gl/geometry";

const room = () => ({
  i: 1,
  f: 0,
  c: [10, 20],
  o: [0, 40],
  u: [2, 0],
  v: [0, 2],
  w: [[1, 2, 3, 4]],
  s: [[5, 6]],
  d: [{ x: 7, z: 8, a: 90, link: 2 }],
  mw: 2,
  mh: 2,
  m: "Aw==",
});

test("every z in a room is negated, and nothing else moves", () => {
  const [out] = flipDungeon({ rooms: [room()] }).rooms;

  expect(out.c).toEqual([10, -20]);
  expect(out.o).toEqual([0, -40]);
  expect(out.u).toEqual([2, -0]);
  expect(out.v).toEqual([0, -2]);
  expect(out.w).toEqual([[1, -2, 3, -4]]);
  expect(out.s).toEqual([[5, -6]]);
  expect(out.d[0]).toMatchObject({ x: 7, z: -8, link: 2 });

  // the mask and its size are untouched - the basis carries the flip
  expect(out.mw).toBe(2);
  expect(out.m).toBe("Aw==");
});

test("the tile basis still lands where the flipped walls are", () => {
  const [out] = flipDungeon({ rooms: [room()] }).rooms;
  const at = (x, z) => [
    out.o[0] + out.u[0] * x + out.v[0] * z,
    out.o[1] + out.u[1] * x + out.v[1] * z,
  ];

  // original grid put tile (1,1) at (2, 42); mirrored, it is at (2, -42)
  expect(at(1, 1)).toEqual([2, -42]);
});

test("a flipped heading keeps its x and reverses its z", () => {
  for (const a of [0, 37, 90, 180, 271]) {
    const [dx, dz] = heading(a);
    const [fx, fz] = heading(flipAngle(a));
    expect(fx).toBeCloseTo(dx, 6);
    expect(fz).toBeCloseTo(-dz, 6);
  }
});

test("a mover flips its z and its facing", () => {
  expect(flipMover({ x: 1, z: 5, a: 30, f: 2 })).toEqual({ x: 1, z: -5, a: 150, f: 2 });
  expect(flipMover(null)).toBeNull();
});

test("a mover with no facing keeps having none", () => {
  expect(flipMover({ x: 1, z: 5, k: "chest" })).toEqual({ x: 1, z: -5, k: "chest" });
});

test("a payload with no rooms passes straight through", () => {
  const empty = { type: "dungeon" };
  expect(flipDungeon(empty)).toBe(empty);
});
