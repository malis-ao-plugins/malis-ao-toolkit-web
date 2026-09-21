/* ============================================================================
   Dev harness: stand-ins for the backends the UI talks to.

     ws://localhost:7069/ws   Mission Roller plugin
     ws://localhost:7071/ws   Dungeon Map plugin
     ws://localhost:7068/ws   Item Assistant plugin
     http://localhost:7068    Item Assistant inventory
     http://localhost:7070    AOItemQueryService

   Run it with `npm run mock` when the game is not up. It exists so the UI can
   be built and looked at on its own — it is not a simulator, and it makes no
   attempt to be faithful beyond the shapes the front end reads.

     node tools/mock-backends.js
   ========================================================================= */

const fs = require("fs");
const path = require("path");
const http = require("http");
const zlib = require("zlib");
const WebSocket = require("ws");

// ─── A real 32x32 PNG, built here so the harness has no binary assets ──────

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 48x48 RGBA icon — a bordered block whose hue is derived from `seed`.
    48 is the real art size the service returns; the kit sizes every icon
    cell from it, so a mock at 32 would be resampled in a way the real one
    never is. */
function makeIcon(seed) {
  const S = 48;
  const hue = (seed * 47) % 360;
  const rgb = (h, v) => {
    const f = (n) => {
      const k = (n + h / 60) % 6;
      return Math.round(255 * v * Math.max(0, Math.min(k, 4 - k, 1)));
    };
    return [f(5), f(3), f(1)];
  };
  const [r, g, b] = rgb(hue, 0.75);

  const raw = Buffer.alloc(S * (S * 4 + 1));
  let p = 0;
  for (let y = 0; y < S; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < S; x++) {
      const edge = x < 2 || y < 2 || x > S - 3 || y > S - 3;
      const dot = (x + y + seed) % 7 === 0;
      raw[p++] = edge ? 20 : dot ? 255 : r;
      raw[p++] = edge ? 26 : dot ? 255 : g;
      raw[p++] = edge ? 34 : dot ? 255 : b;
      raw[p++] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

// ─── Synthetic item catalogue ─────────────────────────────────────────────

const ADJECTIVES = [
  "Rusted", "Pristine", "Notum-Laced", "Scorched", "Ancient", "Prototype",
  "Bootleg", "Sealed", "Cracked", "Gleaming",
];
const NOUNS = [
  "Memory Loop", "Combat Sleeve", "Targeting Chip", "Nano Crystal",
  "Filigree Ring", "Kevlar Vest", "Plasma Cutter", "Bio-Comm Device",
  "Cyber Deck", "Grid Anchor",
];

const itemName = (id) =>
  `${ADJECTIVES[id % ADJECTIVES.length]} ${NOUNS[(id >> 3) % NOUNS.length]}`;

const QL_STEPS = [1, 50, 100, 150, 200, 300];

/** Six QL steps per item family, ids allocated 100 apart so they never clash.
    Each template carries its own name, as the real service does — the item
    row reads the name off whichever template the QL lands on. */
const membersFor = (lowId) => {
  const base = Math.floor(lowId / 100) * 100;
  return QL_STEPS.map((ql, i) => ({
    id: base + i,
    ql,
    name: itemName(base + i),
  }));
};

const CATALOGUE = Array.from({ length: 40 }, (_, i) => {
  const lowId = 100000 + i * 100;
  const members = membersFor(lowId);
  return {
    low_id: lowId,
    high_id: members[members.length - 1].id,
    name: itemName(lowId),
    ql: members[0].ql,
    members,
    // Arbitrary but stable bitfields, so the flag filters have something to
    // actually filter on. Every item can be carried (bit 0); the rest vary.
    canBits: 1 | ((i % 4) << 2),
    itemBits: 1 | ((i % 3) << 1),
  };
});

// ─── AOItemQueryService stand-in (7070) ───────────────────────────────────

function json(res, body, status = 200) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

const itemApi = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    return res.end();
  }

  const url = new URL(req.url, "http://localhost");
  const q = url.searchParams;
  const ids = (q.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter(Boolean);

  switch (url.pathname) {
    case "/search": {
      const body = await readBody(req);
      const needle = (body.name ?? "").toLowerCase();

      // The real service ANDs the requested bits; so does this, so that a
      // flag filter visibly narrows the list in the dev harness.
      const hasBits = (have, want) => !want || (have & want) === want;

      // The Item Assistant looks items up by id pair rather than by name.
      const wanted = body.idPairs?.length
        ? new Set(body.idPairs.map((p) => p.lowId))
        : null;

      const hits = CATALOGUE.filter(
        (i) =>
          (!wanted || wanted.has(i.low_id)) &&
          i.name.toLowerCase().includes(needle) &&
          hasBits(i.canBits, body.canBits) &&
          hasBits(i.itemBits, body.itemBits),
      ).slice(0, body.limit ?? 50);
      // The real service hands `members` back as a JSON string.
      return json(
        res,
        hits.map((i) => ({ ...i, members: JSON.stringify(i.members) })),
      );
    }

    case "/item/members":
      return json(res, membersFor(Number(q.get("lowId"))));

    case "/items/names":
      return json(res, ids.map((id) => ({ id, name: itemName(id) })));

    case "/items/icons":
      return json(
        res,
        ids.map((id) => ({ item_id: id, iconData: makeIcon(id % 97) })),
      );

    case "/icons":
      return json(res, { iconData: makeIcon(Number(q.get("id")) % 97) });

    case "/item": {
      // Stat rows, which is what the front end reads it as - not a record
      // about the item. Stat 54 is Level, which a tooltip shows as QL.
      const id = Number(q.get("id"));
      const ql = QL_STEPS[id % 100] ?? 1;
      return json(res, [{ stat_id: 54, value: ql }]);
    }

    case "/item/modifiers":
    case "/item/modifiers/criteria":
    case "/item/modifiers/text":
    case "/item/requirements":
    case "/item/skillchecks":
      return json(res, []);

    default:
      return json(res, { error: "not found" }, 404);
  }
});

// ─── Item Assistant stand-in (7068) ───────────────────────────────────────

const CHARACTERS = [
  { id: 1, name: "Malisondre", last_seen: Date.now() },
  { id: 2, name: "Bagmule", last_seen: Date.now() },
  { id: 3, name: "Doctorwho", last_seen: Date.now() },
];

// parent_type 104 is Inventory and 105 is Bank; anything else is a container
// the client has catalogued separately.
const CONTAINERS = {
  1: [
    { type: 106, instance: 5001, name: "Large Backpack - Cold Front", parent_type: 104, parent_instance: 0, parent_slot: 1 },
    { type: 106, instance: 5002, name: "Notum Satchel", parent_type: 105, parent_instance: 0, parent_slot: 2 },
  ],
  2: [
    { type: 106, instance: 5003, name: "Quartermaster Crate", parent_type: 105, parent_instance: 0, parent_slot: 1 },
    { type: 106, instance: 5004, name: "Spare Parts Bag", parent_type: 106, parent_instance: 5003, parent_slot: 3 },
  ],
  3: [],
};

const inventoryFor = (charid) => {
  const homes = [
    { parent_type: 104, parent_instance: 0 },
    { parent_type: 105, parent_instance: 0 },
    ...CONTAINERS[charid].map((c) => ({
      parent_type: c.type,
      parent_instance: c.instance,
    })),
  ];

  return Array.from({ length: 6 + charid * 3 }, (_, i) => {
    const item = CATALOGUE[(charid * 7 + i * 3) % CATALOGUE.length];
    const home = homes[i % homes.length];
    return {
      slot: 10 + i,
      item_id: item.low_id,
      item_high_id: item.high_id,
      ql: item.members[i % item.members.length].ql,
      container_name: null,
      ...home,
    };
  });
};

const inventoryHttp = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const charid = Number(url.searchParams.get("characterId"));

  switch (url.pathname) {
    case "/characters":
      return json(res, CHARACTERS);
    case "/character/items":
      return json(res, CHARACTERS.some((c) => c.id === charid) ? inventoryFor(charid) : []);
    case "/character/containers":
      return json(res, CONTAINERS[charid] ?? []);
    default:
      return json(res, { error: "not found" }, 404);
  }
});

const inventoryWss = new WebSocket.Server({ server: inventoryHttp, path: "/ws" });

inventoryWss.on("connection", (ws) => {
  console.log("[7068] client connected");
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      console.log("[7068] <-", msg.type, msg.charid ?? "", msg.slot ?? "");
    } catch {
      /* ignore */
    }
  });
  ws.on("close", () => console.log("[7068] client gone"));
});

// ─── Mission Roller stand-in (7069) ───────────────────────────────────────

const ZONES = [760, 585, 655, 550, 545, 605, 800, 665, 590, 670, 625, 560];

const MISSION_NAMES = [
  "Retrieve the stolen data cube",
  "Eliminate the rogue engineer",
  "Recover a shipment from the wrecked transport",
  "Plant the tracer on the supply crate",
  "Locate the missing survey team",
  "Destroy the unregistered nano-brewery",
];

const DESCRIPTIONS = [
  "A clanner cell has been moving notum through the district. Get in, take the cube, get out before the patrol loops back.",
  "Omni-Pol wants this one quiet. No witnesses, no report.",
  "The transport went down three days ago. Whatever is still aboard is yours to keep.",
];

let missionSeq = 0;

function rollMissions(n = 6) {
  return Array.from({ length: n }, () => {
    const seed = missionSeq++;
    const creditsMax = 40000 + ((seed * 7919) % 900000);
    return {
      id: `m${seed}`,
      name: MISSION_NAMES[seed % MISSION_NAMES.length],
      description: DESCRIPTIONS[seed % DESCRIPTIONS.length],
      icon: 100 + (seed % 50),
      playfield: ZONES[seed % ZONES.length],
      credits: Math.round(creditsMax * 0.62),
      creditsMax,
      xp: 2000 + ((seed * 104729) % 40000),
      rewards: Array.from({ length: 1 + (seed % 4) }, (_, i) => {
        const item = CATALOGUE[(seed * 3 + i) % CATALOGUE.length];
        return { ids: [item.low_id, item.high_id], ql: item.members[1].ql };
      }),
    };
  });
}

const rollerHttp = http.createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("mock mission roller");
});

const wss = new WebSocket.Server({ server: rollerHttp, path: "/ws" });

wss.on("connection", (ws) => {
  console.log("[7069] client connected");
  let timer = null;

  const push = () =>
    ws.send(JSON.stringify({ type: "missionResults", missions: rollMissions() }));

  push();

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    console.log("[7069] <-", msg.type, msg.id ?? "");

    if (msg.type === "start") {
      clearInterval(timer);
      timer = setInterval(push, 2500);
    }
    if (msg.type === "stop") {
      clearInterval(timer);
      timer = null;
    }
    if (msg.type === "accept") push();
  });

  ws.on("close", () => {
    clearInterval(timer);
    console.log("[7069] client gone");
  });
});


// ─── Dungeon Map stand-in (7071) ──────────────────────────────────────────
//
// Replays a real capture: the 30-room clan mission in `fixtures/dungeon-clan
// .json`, built from the template's own tilemap, in the same shape the plugin
// sends. The player walks the room centres so the follow mode has something
// to follow.

const dungeon = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "dungeon-clan.json"), "utf8"),
);

const mapHttp = http.createServer();
const mapWss = new WebSocket.Server({ server: mapHttp, path: "/ws" });

mapWss.on("connection", (ws) => {
  console.log("[7071] client connected");
  ws.send(JSON.stringify(dungeon));

  const route = dungeon.rooms.filter((r) => r.f === 0).map((r) => r.c);
  let leg = 0;
  let t = 0;

  const walk = setInterval(() => {
    const from = route[leg % route.length];
    const to = route[(leg + 1) % route.length];
    t += 0.0064;
    if (t >= 1) {
      t = 0;
      leg++;
    }

    const x = from[0] + (to[0] - from[0]) * t;
    const z = from[1] + (to[1] - from[1]) * t;
    const a = (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI;

    // one message a frame, the way the plugin sends it
    const d = dungeon.rooms
      .filter((r) => r.f === 0)
      .slice(0, 12)
      .map((r, i) => ({
        k: i % 4 === 0 ? "chest" : "npc",
        x: r.c[0] + Math.sin(Date.now() / 900 + i) * 3,
        z: r.c[1] + Math.cos(Date.now() / 900 + i) * 3,
        a: ((Date.now() / 20 + i * 40) % 360) - 180,
        f: 0,
        n: i % 4 === 0 ? "Locked Chest" : "Clan Guard",
      }));

    ws.send(JSON.stringify({ type: "frame", p: { x, z, a, f: 0, room: 1 }, d }));
  }, 16);

  ws.on("message", (raw) => {
    try {
      console.log("[7071] <-", JSON.parse(raw).type);
    } catch {
      /* ignore */
    }
  });

  ws.on("close", () => {
    clearInterval(walk);
    console.log("[7071] client gone");
  });
});

/**
 * Start one stand-in.
 *
 * A port already in use means the real plugin is up, which is the better
 * thing to be talking to - so say so and carry on. Each of these is
 * independent, and one being taken used to kill the whole harness before the
 * others had started, which left the apps behind them greyed out in the
 * launcher with nothing to explain it.
 */
function serve(server, port, what, wss) {
  const onError = (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`port ${port} is taken - leaving ${what.trim()} to the real plugin`);
    } else {
      console.error(`[${port}]`, err.message);
    }
  };

  server.on("error", onError);
  // ws forwards the http server's error onto the WebSocketServer as well, and
  // an emitter with no listener for 'error' throws. Both need one.
  wss?.on("error", () => {});

  server.listen(port, () => console.log(`mock ${what}`));
}

serve(itemApi, 7070, "item api   http://localhost:7070");
serve(rollerHttp, 7069, "roller     ws://localhost:7069/ws", wss);
serve(inventoryHttp, 7068, "inventory  ws://localhost:7068/ws + http://localhost:7068", inventoryWss);
serve(mapHttp, 7071, "dungeon    ws://localhost:7071/ws", mapWss);
