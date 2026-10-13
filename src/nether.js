// The Nether, and what else lies deep under the streets. It is not another world: it is a
// cavern of red rock and lava in the stone under every place, as wide as a neighbourhood and
// sealed all round, with forests of giant fungus, a valley of soul sand, fields of basalt and
// two brick bridges across it. A lit portal takes the player down to a ledge of rock in its
// middle, where the portal back stands: a hill behind it, a drop to a lake of lava beside it,
// lava running down from the ceiling beyond. Whoever digs straight down far enough breaks in
// through the ceiling. Pure data, shared by the worker (which builds it into the chunks) and
// the game.
import { B } from './blocks.js';

export const NETHER = {
  R: 112, // the cavern reaches this many blocks from the starting point each way
  FLOOR: 5, // about the lowest floor
  TOP: 34, // highest ceiling
  LAVA: 8, // lava stands up to this level
  PLAT: 15, // the ledge the portal back stands on: feet stand at this height, well above the lava
  WALK: 10, // the bridges: feet stand at this height, just above it
  ROOF: 9, // the rock that must lie between the ceiling and the street
};
// where one arrives: on the ledge, a few steps in front of the portal back
export const NETHER_SPAWN = [0.5, NETHER.PLAT, 1.5];
// the portal back: an obsidian frame standing on the ledge, the opening inside it
const GATE = { z: -3, x0: -2, x1: 1, y0: NETHER.PLAT, y1: NETHER.PLAT + 4 };
const ENTRY = 30; // the way in is laid out by hand as far as this from the middle
// lava that is sure to run down from the ceiling within sight of the portal: [x, z]
const FALLS = [[-13, -15], [-7, -22], [17, -17], [23, -3], [-20, 6], [12, 19]];
// two bridges, well clear of the way in: one east-west along z = at, one north-south along
// x = -at; they meet at a crossing and stop short of the wall
const BRIDGE = { at: 44, reach: NETHER.R - 10, pier: 8 };
const FUNGUS = 6; // one giant fungus at most in every square of this many blocks
const BASIN = 0.42; // how much of the slow noise lies under the lava seas

const hash2 = (x, z, seed) => {
  let h = Math.imul(x, 0x9e3779b1) ^ Math.imul(z, 0x85ebca6b) ^ Math.imul(seed, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
const smooth = (t) => t * t * (3 - 2 * t);
// value noise, 0..1
function noise(x, z, seed) {
  const x0 = Math.floor(x), z0 = Math.floor(z), fx = smooth(x - x0), fz = smooth(z - z0);
  const a = hash2(x0, z0, seed), b = hash2(x0 + 1, z0, seed), c = hash2(x0, z0 + 1, seed), d = hash2(x0 + 1, z0 + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// Is the player (or anything) inside the cavern?
export function inNether(x, y, z) {
  return y < NETHER.TOP + 3 && Math.abs(x) < NETHER.R + 2 && Math.abs(z) < NETHER.R + 2;
}

// A diamond in the stone? Only deep down, and rare.
export function diamondAt(wx, y, wz) {
  return y < 15 && hash2(wx * 31 + y, wz * 17 - y, 7) < 0.0045;
}

// The regions of the cavern. Around the way in it is the wastes; beyond, the cavern is shared
// out among points scattered one to a square, every column going with the point nearest to it
// (seen through a slow wobble, so the borders wander). The kinds follow each other in a fixed
// order, so each gets its share and no two neighbours are alike.
export const REGION = { WASTES: 0, CRIMSON: 1, WARPED: 2, SOUL: 3, BASALT: 4 };
// the murk each region stands in: [r, g, b]
export const REGION_FOG = [[0.2, 0.03, 0.03], [0.2, 0.012, 0.012], [0.1, 0.02, 0.1], [0.106, 0.278, 0.27], [0.41, 0.37, 0.44]];
const PLOT = 46;
export function netherRegion(wx, wz) {
  if (Math.max(Math.abs(wx), Math.abs(wz)) < 20 + noise(wx / 9, wz / 9, 34) * 14) return REGION.WASTES;
  const px = wx + (noise(wx / 17, wz / 17, 31) - 0.5) * 22, pz = wz + (noise(wx / 17, wz / 17, 32) - 0.5) * 22;
  const gx = Math.floor(px / PLOT), gz = Math.floor(pz / PLOT);
  let best = 0, bd = Infinity;
  for (let j = gz - 1; j <= gz + 1; j++) {
    for (let i = gx - 1; i <= gx + 1; i++) {
      const d = Math.hypot((i + 0.2 + hash2(i, j, 33) * 0.6) * PLOT - px, (j + 0.2 + hash2(j, i, 35) * 0.6) * PLOT - pz);
      if (d < bd) {
        bd = d;
        best = (((i + 2 * j) % 5) + 5) % 5;
      }
    }
  }
  return best;
}

// A column on a bridge: [how far from the middle line, how far along], or null.
function bridgeAt(wx, wz) {
  const a = Math.abs(wz - BRIDGE.at), b = Math.abs(wx + BRIDGE.at);
  const ew = a <= 2 && Math.abs(wx) <= BRIDGE.reach, ns = b <= 2 && Math.abs(wz) <= BRIDGE.reach;
  if (ew && ns) return [Math.min(a, b), 1]; // the crossing: open both ways, a post at each corner
  return ew ? [a, wx] : ns ? [b, wz] : null;
}

// The floor of the way in, `r` blocks from the middle: a ledge of rock the portal stands on;
// to the west the ground climbs away in steps, to the east it drops to a lake of lava, and
// north and south it goes down more gently.
function entry(wx, wz, r) {
  const N = NETHER;
  const lip = 6.5 + noise(wx / 5, wz / 5, 40) * 2.5;
  if (r < lip) return N.PLAT;
  const past = Math.floor((r - lip) / 2.5) + 1, east = wx / r;
  const down = N.PLAT - Math.min(4, past);
  return east > 0 ? down + (N.LAVA - 2 - down) * Math.min(1, east * 2.2) : down + (N.PLAT + Math.min(7, past) - down) * Math.min(1, -east * 1.6);
}

// Does lava run down from the ceiling over this column?
function lavafall(wx, wz) {
  return hash2(wx, wz, 41) < 0.0022 || FALLS.some(([x, z]) => x === wx && z === wz);
}

// The cavern over one column: { edge, region, floor, ceil, solid }. floor: the lowest open
// level; ceil: the highest; solid: rock from floor to ceiling (a pillar, or the wall).
function shape(wx, wz) {
  const N = NETHER;
  const edge = N.R - Math.max(Math.abs(wx + 0.5), Math.abs(wz + 0.5)); // blocks inside the wall
  const region = netherRegion(wx, wz);
  if (edge < 0) return { edge, region, floor: N.TOP, ceil: N.TOP, solid: true };
  // broad swells with a finer grain over them
  let floor = N.FLOOR + noise(wx / 30, wz / 30, 1) * 11 + noise(wx / 9, wz / 9, 6) * 4 - 2.5;
  let ceil = N.TOP - noise(wx / 24, wz / 24, 2) * 8 - noise(wx / 7, wz / 7, 7) * 3;
  if (region === REGION.BASALT && hash2(wx, wz, 10) < 0.3) floor += 1 + hash2(wx, wz, 11) * 3; // columns of basalt
  if (region === REGION.SOUL) floor = floor * 0.55 + (N.LAVA + 1.8) * 0.45; // a flatter valley floor
  if (region === REGION.CRIMSON || region === REGION.WARPED) floor += 1.5; // forests stand a little higher
  // and here and there a wide basin, deep under the lava
  floor -= Math.max(0, BASIN - noise(wx / 46, wz / 46, 18)) * 34;
  const near = Math.min(1, edge / 8); // towards the wall the floor rises and the ceiling sinks
  floor += (1 - near) * 6;
  ceil -= (1 - near) * 8;
  // the way in, running out into the cavern as it comes
  const r = Math.hypot(wx, wz);
  if (r < ENTRY) {
    const k = smooth(Math.min(1, Math.max(0, (r - 17) / (ENTRY - 17))));
    floor = entry(wx, wz, r || 1) * (1 - k) + floor * k;
    ceil = Math.max(ceil, (N.TOP - 1) * (1 - k) + ceil * k); // and plenty of room over it
  }
  floor = Math.max(3, Math.round(floor));
  ceil = Math.round(ceil);
  if (ceil < floor + 5) ceil = floor + 5;
  // here and there the rock stands from floor to ceiling
  const solid = r >= ENTRY && !bridgeAt(wx, wz) && noise(wx / 11, wz / 11, 3) > 0.84;
  return { edge, region, floor, ceil, solid };
}

// Rock with its ores, by region.
function rock(region, wx, y, wz) {
  if (region === REGION.BASALT) return noise(wx / 6 + y * 0.3, wz / 6, 13) > 0.55 ? B.BLACKSTONE : B.BASALT;
  const h = hash2(wx * 31 + y, wz * 17 - y, 14);
  return h < 0.012 ? B.QUARTZ_ORE : h < 0.017 ? B.NETHER_GOLD_ORE : B.NETHERRACK;
}

// What the floor is made of: the block on top, and the few under it.
function ground(region, wx, wz, floor) {
  const N = NETHER;
  if (floor - 1 === N.LAVA && hash2(wx, wz, 15) < 0.18) return [B.MAGMA, B.NETHERRACK]; // on the shore
  if (floor <= N.LAVA) return region === REGION.SOUL ? [B.SOUL_SOIL, B.SOUL_SOIL] : [B.NETHERRACK, B.NETHERRACK];
  if (region === REGION.CRIMSON) return [B.CRIMSON_NYLIUM, B.NETHERRACK];
  if (region === REGION.WARPED) return [B.WARPED_NYLIUM, B.NETHERRACK];
  if (region === REGION.SOUL) return [noise(wx / 6, wz / 6, 16) > 0.5 ? B.SOUL_SAND : B.SOUL_SOIL, B.SOUL_SOIL];
  if (region === REGION.BASALT) return [rock(region, wx, floor - 1, wz), B.BASALT];
  return [noise(wx / 5, wz / 5, 5) > 0.68 ? B.SOUL_SAND : B.NETHERRACK, B.NETHERRACK];
}

// The giant fungi whose caps may reach a column: fn(dx, dz, foot, top, region) for each, with
// (dx, dz) the column's offset from the stem, foot the stem's lowest block and top its highest.
function fungi(wx, wz, fn) {
  const gx = Math.floor(wx / FUNGUS), gz = Math.floor(wz / FUNGUS);
  for (let j = gz - 1; j <= gz + 1; j++) {
    for (let i = gx - 1; i <= gx + 1; i++) {
      if (hash2(i, j, 20) > 0.7) continue;
      const tx = i * FUNGUS + 1 + Math.floor(hash2(i, j, 21) * (FUNGUS - 2)), tz = j * FUNGUS + 1 + Math.floor(hash2(i, j, 22) * (FUNGUS - 2));
      const dx = wx - tx, dz = wz - tz;
      if (Math.abs(dx) > 2 || Math.abs(dz) > 2) continue;
      const s = shape(tx, tz);
      if (s.region !== REGION.CRIMSON && s.region !== REGION.WARPED) continue;
      const high = 4 + Math.floor(hash2(i, j, 23) * 4);
      if (s.solid || s.floor <= NETHER.LAVA || s.ceil - s.floor < high + 4 || bridgeAt(tx, tz)) continue;
      fn(dx, dz, s.floor, s.floor + high - 1, s.region);
    }
  }
}

// Carve the cavern into one column of a chunk's voxels (`vox[y * sy + col]`), world column
// (wx, wz), whose ground surface is at `groundTop`. Leaves bedrock and everything above alone.
export function netherColumn(vox, sy, col, wx, wz, groundTop) {
  const N = NETHER;
  if (N.R - Math.max(Math.abs(wx + 0.5), Math.abs(wz + 0.5)) < -2) return;
  // under low ground (deep water) the ceiling comes down with it; too low and the stone stays
  const lid = groundTop - N.ROOF;
  if (lid < N.LAVA + 4) return;
  const s = shape(wx, wz);
  const region = s.region, floor = s.floor, ceil = Math.min(s.ceil, lid), top = Math.min(N.TOP + 2, lid + 2);
  const at = (y) => vox[y * sy + col];
  const set = (y, id) => {
    if (vox[y * sy + col] !== B.BEDROCK) vox[y * sy + col] = id;
  };
  if (s.solid || ceil < floor + 3) {
    // the wall, or a pillar: rock right through, so a tunnel from outside meets something strange
    for (let y = 2; y <= top; y++) set(y, rock(region, wx, y, wz));
    return;
  }
  const [cover, under] = ground(region, wx, wz, floor);
  const lamp = hash2(wx >> 1, wz >> 1, 4) < 0.035 ? 1 + Math.floor(hash2(wx >> 1, wz >> 1, 17) * 3) : 0; // glowstone hanging from the ceiling
  const fall = lavafall(wx, wz) && !bridgeAt(wx, wz);
  for (let y = 2; y <= top; y++) {
    let id;
    if (y < floor) id = y === floor - 1 ? cover : y >= floor - 3 ? under : rock(region, wx, y, wz);
    else if (y > ceil) id = rock(region, wx, y, wz);
    else if (y <= N.LAVA || fall) id = B.LAVA;
    else if (lamp && y > ceil - lamp) id = B.GLOWSTONE;
    else id = B.AIR;
    set(y, id);
  }

  // giant fungi: a stem, and a cap of wart with a hanging rim and a light or two in it
  fungi(wx, wz, (dx, dz, foot, head, kind) => {
    const wart = kind === REGION.CRIMSON ? B.NETHER_WART : B.WARPED_WART;
    const m = Math.max(Math.abs(dx), Math.abs(dz));
    const put = (y) => {
      if (y <= ceil && at(y) === B.AIR) set(y, hash2(wx * 7 + y, wz * 13 - y, 24) < 0.1 ? B.SHROOMLIGHT : wart);
    };
    if (m === 0) for (let y = foot; y < head; y++) set(y, kind === REGION.CRIMSON ? B.CRIMSON_STEM : B.WARPED_STEM);
    if (m <= 1) {
      put(head);
      put(head + 1);
    } else if (Math.abs(dx) !== Math.abs(dz)) {
      put(head);
      put(head - 1);
    }
  });

  // a bridge: the walk, a low wall each side, a pier down into the lava now and then
  const b = bridgeAt(wx, wz);
  if (b) {
    const [across, along] = b;
    set(N.WALK - 1, B.NETHER_BRICKS);
    if (across === 2) set(N.WALK, B.NETHER_BRICKS);
    else {
      for (let y = N.WALK; y <= N.WALK + 3 && y <= top; y++) set(y, B.AIR);
      if (((along % BRIDGE.pier) + BRIDGE.pier) % BRIDGE.pier === 0) for (let y = 3; y < N.WALK - 1; y++) set(y, B.NETHER_BRICKS);
    }
  }

  // the way back
  if (wz === GATE.z && wx >= GATE.x0 && wx <= GATE.x1) {
    const post = wx === GATE.x0 || wx === GATE.x1;
    for (let y = GATE.y0; y <= GATE.y1; y++) set(y, post || y === GATE.y0 || y === GATE.y1 ? B.OBSIDIAN : B.PORTAL);
  }
}
