import { bounds, cameraFor, fit, floorsOf, project, roomAt, roomsOnFloor, unproject } from "./draw";

const room = (i, f, x, z) => ({
  i,
  f,
  n: `room${i}`,
  w: [
    [x, z, x + 10, z],
    [x + 10, z, x + 10, z + 10],
    [x + 10, z + 10, x, z + 10],
    [x, z + 10, x, z],
  ],
});

const rooms = [room(1, 0, 0, 0), room(2, 0, 20, 0), room(3, 1, 0, 40)];

test("floors come back sorted and deduplicated", () => {
  expect(floorsOf(rooms)).toEqual([0, 1]);
  expect(floorsOf([])).toEqual([]);
  expect(floorsOf(undefined)).toEqual([]);
});

test("a floor holds only its own rooms", () => {
  expect(roomsOnFloor(rooms, 0).map((r) => r.i)).toEqual([1, 2]);
  expect(roomsOnFloor(rooms, 9)).toEqual([]);
});

test("bounds span every wall on the floor", () => {
  expect(bounds(roomsOnFloor(rooms, 0))).toEqual({
    minX: 0,
    minZ: 0,
    maxX: 30,
    maxZ: 10,
  });
});

test("bounds of nothing is null, so the view can tell empty from zero-sized", () => {
  expect(bounds([])).toBeNull();
  expect(bounds([{ w: [] }])).toBeNull();
});

test("fit centres the box and leaves the margin", () => {
  const view = fit({ minX: 0, minZ: 0, maxX: 100, maxZ: 50 }, 220, 120, 10);
  expect(view.cx).toBe(50);
  expect(view.cz).toBe(25);
  // 200px of room for 100 units across, 100px for 50 down: the tighter wins
  expect(view.scale).toBe(2);
});

test("the camera puts the view centre in the middle of the canvas", () => {
  const to = project(cameraFor({ scale: 2, cx: 10, cz: 20 }, 200, 100, 1, 2));
  expect(to(10, 20)).toEqual([100, 50]);
  expect(to(15, 20)).toEqual([110, 50]);
  expect(to(10, 25)).toEqual([100, 60]);
});

test("unproject is project backwards", () => {
  const camera = cameraFor({ scale: 2.5, cx: 40, cz: 17 }, 300, 220, 2, 5);
  const to = project(camera);
  const from = unproject(camera);
  const [px, py] = to(123, 45);
  const [x, z] = from(px, py);
  expect(x).toBeCloseTo(123);
  expect(z).toBeCloseTo(45);
});

// The two properties that stop the picture crawling while the view moves.
test("a tile is always a whole number of device pixels", () => {
  for (const scale of [0.07, 0.3, 1, 1.37, 2.5, 6.2]) {
    for (const dpr of [1, 1.25, 2]) {
      for (const step of [2, 5]) {
        const camera = cameraFor({ scale, cx: 3.3, cz: -7.9 }, 301, 199, dpr, step);
        expect(Number.isInteger(camera.unit)).toBe(true);
        expect(camera.unit).toBeGreaterThanOrEqual(1);
        expect(camera.scale * step).toBeCloseTo(camera.unit);
      }
    }
  }
});

test("the camera never translates by a fraction of a pixel", () => {
  for (let i = 0; i < 40; i++) {
    const camera = cameraFor(
      { scale: 1.9, cx: 100 + i * 0.137, cz: 40 - i * 0.041 },
      321,
      207,
      1.25,
      2,
    );
    expect(Number.isInteger(camera.tx)).toBe(true);
    expect(Number.isInteger(camera.ty)).toBe(true);
  }
});

test("walls hold their subpixel phase as the camera slides", () => {
  // The same wall, seen from cameras a fraction of a world unit apart: the
  // distance between them must come out as a whole number of pixels, or the
  // wall crosses a rounding boundary that its neighbours do not.
  const at = (cx) => project(cameraFor({ scale: 3, cx, cz: 0 }, 400, 300, 1, 2))(57, 13)[0];
  const base = at(10);
  for (const cx of [10.03, 10.19, 10.5, 11.77, 12.4]) {
    expect(at(cx) - base).toBeCloseTo(Math.round(at(cx) - base));
  }
});

test("roomAt finds the room under a point, on that floor only", () => {
  expect(roomAt(rooms, 0, 5, 5)?.i).toBe(1);
  expect(roomAt(rooms, 0, 25, 5)?.i).toBe(2);
  expect(roomAt(rooms, 0, 15, 5)).toBeNull();
  expect(roomAt(rooms, 1, 5, 5)).toBeNull();
});
