/**
 * The map, on the GPU.
 *
 * Two programs, and they divide along the one line that matters: whether a
 * thing must land on the pixel grid or must move smoothly.
 *
 *   wall2d   the floor fill, the walls and the doors. The centre line is
 *            snapped to whole device pixels in the vertex shader and each
 *            corner is then pushed out by half a stroke, so a wall is exactly
 *            as many pixels wide as asked for at any zoom - and, because the
 *            camera's own translation is rounded before it gets here, a wall
 *            keeps its subpixel phase while the view slides instead of
 *            crawling.
 *   marker   everything that moves - the player, the dynels, spawn points.
 *            Never snapped: these are meant to glide.
 *
 * Geometry is uploaded once per dungeon. A frame sets uniforms and draws
 * ranges out of it.
 */
import { buildFlat, buildPoints, heading } from "./geometry";

const WALL2D_VS = `
attribute vec2 aPos;
attribute vec2 aOff;
uniform vec2 uScale;
uniform vec2 uTranslate;
uniform vec2 uViewport;
uniform float uHalf;
void main() {
  vec2 centre = floor(aPos * uScale + uTranslate + 0.5) + 0.5;
  vec2 p = centre + aOff * uHalf;
  vec2 clip = (p / uViewport) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FLAT_FS = `
precision mediump float;
uniform vec4 uColor;
void main() { gl_FragColor = uColor; }`;

const MARKER_VS = `
attribute vec3 aPos;
attribute vec3 aColor;
uniform mat4 uMVP;
uniform vec3 uTint;
uniform float uPointSize;
varying vec3 vColor;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  gl_PointSize = uPointSize;
  vColor = aColor * uTint;
}`;

const MARKER_FS = `
precision mediump float;
uniform float uAlpha;
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, uAlpha); }`;

function compile(gl, vsSource, fsSource) {
  const make = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };

  const program = gl.createProgram();
  gl.attachShader(program, make(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(program, make(gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program));

  const cache = {};
  const loc = (name) => {
    if (!(name in cache)) {
      cache[name] = name.startsWith("a")
        ? gl.getAttribLocation(program, name)
        : gl.getUniformLocation(program, name);
    }
    return cache[name];
  };

  return { program, loc };
}

/** A CSS colour to 0..1 floats. The tokens are hex, but be forgiving. */
export function rgb(css) {
  const value = String(css ?? "").trim();

  if (value.startsWith("#")) {
    const parts =
      value.length === 4
        ? value.slice(1).split("").map((c) => parseInt(c + c, 16))
        : [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
    return parts.map((v) => (Number.isFinite(v) ? v / 255 : 1));
  }

  const nums = value.match(/[\d.]+/g);
  return nums && nums.length >= 3 ? nums.slice(0, 3).map((v) => +v / 255) : [1, 1, 1];
}

export function createRenderer(canvas) {
  const options = { antialias: true, alpha: true, premultipliedAlpha: false };
  const gl = canvas.getContext("webgl", options) || canvas.getContext("experimental-webgl", options);
  if (!gl) return null;

  const wall2d = compile(gl, WALL2D_VS, FLAT_FS);
  const marker = compile(gl, MARKER_VS, MARKER_FS);

  const buffers = {
    flat: gl.createBuffer(),
    spawns: gl.createBuffer(),
    dynamic: gl.createBuffer(),
  };

  let geo = null;
  let floors = [];

  function setDungeon(rooms) {
    if (!rooms || !rooms.length) {
      geo = null;
      floors = [];
      return;
    }

    floors = [...new Set(rooms.map((r) => r.f))].sort((a, b) => a - b);

    const flat = buildFlat(rooms);
    const spawns = buildPoints(rooms);

    upload(gl, buffers.flat, flat.buffer);
    upload(gl, buffers.spawns, spawns.buffer);

    geo = { flat, spawns };
  }

  /** Triangles for whatever is moving, rebuilt each frame - it is tiny. */
  function markerMesh(scene) {
    const body = [];
    const edge = [];
    const { player, dynels = [], colors, show, floor, markerSize: size } = scene;

    // An arrowhead, like the old plugin drew: a point, two swept-back barbs
    // and a notched tail. Four corners, so it reads as a direction rather
    // than a blob - and it is drawn twice, a dim body and a bright edge.
    const arrowPoints = (x, z, deg, s) => {
      const [dx, dz] = heading(deg);
      const nx = -dz;
      const nz = dx;
      const at = (along, across) => [
        x + dx * s * along + nx * s * across,
        z + dz * s * along + nz * s * across,
      ];
      return [at(1.15, 0), at(-0.75, 0.8), at(-0.35, 0), at(-0.75, -0.8)];
    };

    const arrow = (into, x, z, yy, deg, s, c) => {
      const [tip, left, tail, right] = arrowPoints(x, z, deg, s);

      // body, as two triangles about the notch
      for (const [a, b] of [[tip, left], [tip, right]]) {
        into.push(
          a[0], yy, a[1], c[0], c[1], c[2],
          b[0], yy, b[1], c[0], c[1], c[2],
          tail[0], yy, tail[1], c[0], c[1], c[2],
        );
      }
    };

    const arrowEdge = (into, x, z, yy, deg, s, c, w) => {
      const ring = arrowPoints(x, z, deg, s);

      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const ex = b[0] - a[0];
        const ez = b[1] - a[1];
        const len = Math.hypot(ex, ez) || 1;
        const ox = (-ez / len) * w;
        const oz = (ex / len) * w;

        into.push(
          a[0] - ox, yy, a[1] - oz, c[0], c[1], c[2],
          b[0] - ox, yy, b[1] - oz, c[0], c[1], c[2],
          b[0] + ox, yy, b[1] + oz, c[0], c[1], c[2],
          a[0] - ox, yy, a[1] - oz, c[0], c[1], c[2],
          b[0] + ox, yy, b[1] + oz, c[0], c[1], c[2],
          a[0] + ox, yy, a[1] + oz, c[0], c[1], c[2],
        );
      }
    };

    const tri = (x, z, yy, deg, s, c) => {
      arrow(body, x, z, yy, deg, s, c);
      arrowEdge(edge, x, z, yy, deg, s, c, s * 0.12);
    };

    const line = (x1, z1, x2, z2, w, c) => {
      const ex = x2 - x1;
      const ez = z2 - z1;
      const len = Math.hypot(ex, ez) || 1;
      const ox = (-ez / len) * w;
      const oz = (ex / len) * w;
      edge.push(
        x1 - ox, 0, z1 - oz, c[0], c[1], c[2],
        x2 - ox, 0, z2 - oz, c[0], c[1], c[2],
        x2 + ox, 0, z2 + oz, c[0], c[1], c[2],
        x1 - ox, 0, z1 - oz, c[0], c[1], c[2],
        x2 + ox, 0, z2 + oz, c[0], c[1], c[2],
        x1 + ox, 0, z1 + oz, c[0], c[1], c[2],
      );
    };

    const diamond = (x, z, s, c) => {
      const pts = [[x, z - s], [x + s, z], [x, z + s], [x - s, z]];
      for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
        edge.push(
          x, 0, z, c[0], c[1], c[2],
          pts[a][0], 0, pts[a][1], c[0], c[1], c[2],
          pts[b][0], 0, pts[b][1], c[0], c[1], c[2],
        );
      }
    };

    const box = (x, z, yy, s, c) => {
      edge.push(
        x - s, yy, z - s, c[0], c[1], c[2],
        x + s, yy, z - s, c[0], c[1], c[2],
        x + s, yy, z + s, c[0], c[1], c[2],
        x - s, yy, z - s, c[0], c[1], c[2],
        x + s, yy, z + s, c[0], c[1], c[2],
        x - s, yy, z + s, c[0], c[1], c[2],
      );
    };

    for (const d of dynels) {
      if (d.f !== floor) continue;
      if (d.k === "self") continue;

      const yy = 0;

      if (d.k === "npc" || d.k === "player") {
        if (!show.dynels) continue;
        tri(d.x, d.z, yy, d.a ?? 0, size, rgb(d.k === "npc" ? colors.npc : colors.player));
      } else if (d.k === "chest" || d.k === "chest-open") {
        if (!show.chests) continue;
        box(d.x, d.z, yy, size * 0.6, rgb(d.k === "chest" ? colors.chest : colors.chestOpen));
      } else if (d.k === "terminal") {
        // a terminal in a generated dungeon is the lift
        if (!show.lifts) continue;
        box(d.x, d.z, yy, size * 0.8, rgb(colors.lift));
      }
    }

    if (player && player.f === floor)
      tri(player.x, player.z, 0, player.a ?? 0, size * 1.15, rgb(colors.self));

    // The mission's target, and a thread back to you. A remembered sighting
    // is drawn dimmer, so it never reads as "it is there now".
    const objective = scene.objective;
    if (show.objective && objective && objective.f === floor) {
      const dim = scene.objectiveStale ? 0.45 : 1;
      const c = rgb(colors.objective).map((v) => v * dim);
      if (player && player.f === floor)
        line(player.x, player.z, objective.x, objective.z, size * 0.22, c);
      diamond(objective.x, objective.z, size * 1.1, c);
    }

    return { body: new Float32Array(body), edge: new Float32Array(edge) };
  }

  function draw(scene) {
    const { width, height } = scene;

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    if (!geo) return;

    // Separate alpha: the canvas is cleared transparent, and plain blendFunc
    // would multiply a translucent draw's alpha by itself - a 22% fill landed
    // at 5% once the page composited it.
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );

    drawWalls(scene);
    drawMarkers(scene, flatMatrix(scene));
  }

  function drawWalls(scene) {
    const { camera, colors, width, height, show, visited } = scene;
    const style = scene.style ?? {};
    const wallInk = style.wall || colors.wall;
    const doorInk = style.door || colors.door;
    const group = geo.flat.byFloor[scene.floor];
    if (!group) return;

    gl.useProgram(wall2d.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.flat);
    attrib(gl, wall2d.loc("aPos"), 2, 4, 0);
    attrib(gl, wall2d.loc("aOff"), 2, 4, 2);

    gl.uniform2f(wall2d.loc("uScale"), camera.scale, camera.scale);
    gl.uniform2f(wall2d.loc("uTranslate"), camera.tx, camera.ty);
    gl.uniform2f(wall2d.loc("uViewport"), width, height);

    // Floor first, so the outline sits on top of it. One colour for every
    // room, then the entrance again over the top - the way out is the only
    // room worth telling apart at a glance.
    gl.uniform1f(wall2d.loc("uHalf"), 0);
    gl.uniform4f(wall2d.loc("uColor"), ...rgb(wallInk), 0.45);
    gl.drawArrays(gl.TRIANGLES, group.tiles.start, group.tiles.count);

    const way = group.cats?.entrance;
    if (way?.count) {
      gl.uniform4f(wall2d.loc("uColor"), ...rgb(colors.entrance), 0.75);
      gl.drawArrays(gl.TRIANGLES, way.start, way.count);
    }

    // a room you have walked through: a hint of green, no more
    if (visited?.size) {
      gl.uniform4f(wall2d.loc("uColor"), ...rgb(colors.visited), 0.1);
      for (const room of group.rooms) {
        if (visited.has(room.i)) gl.drawArrays(gl.TRIANGLES, room.start, room.count);
      }
    }

    // uHalf is a half-width, and the width asked for is in device pixels
    gl.uniform1f(wall2d.loc("uHalf"), (camera.stroke * (style.wallWidth ?? 1)) / 2);
    gl.uniform4f(wall2d.loc("uColor"), ...rgb(wallInk), 1);
    gl.drawArrays(gl.TRIANGLES, group.walls.start, group.walls.count);

    if (show.doors !== false) {
      gl.uniform1f(wall2d.loc("uHalf"), (camera.stroke * (style.doorWidth ?? 2)) / 2);
      gl.uniform4f(wall2d.loc("uColor"), ...rgb(doorInk), 1);
      gl.drawArrays(gl.TRIANGLES, group.doors.start, group.doors.count);
    }
  }

  function drawMarkers(scene, mvp) {
    const { colors } = scene;

    gl.useProgram(marker.program);
    gl.uniformMatrix4fv(marker.loc("uMVP"), false, mvp);
    gl.uniform1f(marker.loc("uPointSize"), Math.max(2, 2 * scene.dpr));

    gl.uniform1f(marker.loc("uAlpha"), 1);

    if (scene.show.spawns) {
      const group = geo.spawns.byFloor[scene.floor];
      if (group && group.spawns.count) {
        gl.uniform3f(marker.loc("uTint"), ...rgb(colors.spawn));
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.spawns);
        attrib(gl, marker.loc("aPos"), 3, 3, 0);
        constantColour(gl, marker.loc("aColor"), [1, 1, 1]);
        gl.drawArrays(gl.POINTS, group.spawns.start, group.spawns.count);
      }
    }

    const mesh = markerMesh(scene);

    gl.uniform3f(marker.loc("uTint"), 1, 1, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.dynamic);
    attrib(gl, marker.loc("aPos"), 3, 6, 0);
    attrib(gl, marker.loc("aColor"), 3, 6, 3);

    // the body reads as a wash the map shows through; the edge is the shape
    for (const [part, alpha] of [[mesh.body, 0.35], [mesh.edge, 1]]) {
      if (!part.length) continue;
      gl.uniform1f(marker.loc("uAlpha"), alpha);
      gl.bufferData(gl.ARRAY_BUFFER, part, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, part.length / 6);
    }
  }

  /**
   * Flat view: the snapped pixel camera, as a matrix for everything else.
   *
   * Top-down, so it is world X and world **Z** that reach the screen - height
   * is dropped rather than drawn. An ordinary ortho would send Y to the screen
   * and lay every floor's contents out along one line, which is exactly what
   * it did the first time.
   */
  function flatMatrix(scene) {
    const { camera, width, height } = scene;
    const sx = (2 * camera.scale) / width;
    const sz = (2 * camera.scale) / height;

    return new Float32Array([
      sx, 0, 0, 0,
      0, 0, 0, 0,
      0, -sz, 0, 0,
      (2 * camera.tx) / width - 1, 1 - (2 * camera.ty) / height, 0, 1,
    ]);
  }

  return {
    setDungeon,
    draw,
    floors: () => floors,
    dispose() {
      for (const b of Object.values(buffers)) gl.deleteBuffer(b);
      for (const p of [wall2d, marker]) gl.deleteProgram(p.program);
    },
  };
}

function upload(gl, buffer, data) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
}

function attrib(gl, loc, size, stride, offset) {
  if (loc < 0) return;
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
}

/** An attribute with no array behind it: one value for every vertex. */
function constantColour(gl, loc, value) {
  if (loc < 0) return;
  gl.disableVertexAttribArray(loc);
  gl.vertexAttrib3f(loc, value[0], value[1], value[2]);
}
