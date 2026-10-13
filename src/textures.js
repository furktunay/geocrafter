// Procedural 16x16 pixel-art textures. Pure data (no DOM) so the worker can use it too.
// Row 0 is the bottom of the texture (v = 0).
import { STYLES } from './styles.js';

export const TEX_SIZE = 16;
const S = TEX_SIZE;

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const jit = (c, n, r) => {
  const d = (r() - 0.5) * 2 * n;
  return [c[0] + d, c[1] + d, c[2] + d, c[3] ?? 255];
};
const noise = (c, n) => (x, y, r) => jit(c, n, r);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 255];

// Rows of tiles/bricks: w x h cells with a 1px joint, every other row shifted.
function bricks(body, joint, w, h, n, shift = true) {
  return (x, y, r) => {
    const row = Math.floor(y / h);
    const xx = shift && row % 2 ? x + (w >> 1) : x;
    if (y % h === 0 || xx % w === 0) return jit(joint, n * 0.5, r);
    return jit(body, n, r);
  };
}

// Overlapping roof tiles: each row gets a highlight on top and a shadow at the bottom.
function roofTiles(c, n) {
  return (x, y, r) => {
    const m = y % 4;
    const k = m === 3 ? 1.22 : m === 0 ? 0.72 : 1;
    const seam = (x + (Math.floor(y / 4) % 2) * 2) % 4 === 0 ? 0.88 : 1;
    const p = jit(c, n, r);
    return [p[0] * k * seam, p[1] * k * seam, p[2] * k * seam, 255];
  };
}

const CLEAR = [0, 0, 0, 0];
const STONE = [126, 126, 128];
const has = (list, x, y) => list.some(([gx, gy]) => gx === x && gy === y);

// Stone with a few clusters of something in it.
const VEINS = [[3, 3], [4, 3], [4, 4], [10, 5], [11, 5], [11, 6], [6, 9], [7, 9], [7, 10], [12, 11], [13, 11], [2, 12], [3, 12], [9, 13], [13, 2], [8, 1]];
const ore = (a, b) => (x, y, r) => (has(VEINS, x, y) ? jit((x + y) % 2 ? a : b, 8, r) : jit(STONE, r() < 0.12 ? 26 : 11, r));

// A block cast from one material: a dark rim, a bright edge inside it, a facetted middle.
const cast = (rim, edge, a, b) => (x, y, r) => {
  if (x === 0 || y === 0 || x === 15 || y === 15) return jit(rim, 6, r);
  if (x === 1 || y === 14) return jit(edge, 4, r);
  return jit((x * 3 + y * 5) % 7 < 2 ? a : b, 7, r);
};

const wool = (c) => (x, y, r) => {
  const k = (x + y * 3) % 4 === 0 ? 0.88 : (x * 3 + y) % 5 === 0 ? 1.06 : 1;
  const p = jit(c, 6, r);
  return [p[0] * k, p[1] * k, p[2] * k, 255];
};

const planksOf = (body, joint) => (x, y, r) => {
  const row = Math.floor(y / 4);
  if (y % 4 === 0 || (x + row * 5) % 16 === 0) return jit(joint, 6, r);
  return jit(body, 8, r);
};

// Rounded stones packed together, dark mortar between them.
const cobbles = (x, y) => Math.sin(x * 1.25 + y * 0.7 + 1) * Math.cos(y * 1.15 - x * 0.45);

// A door leaf or a hatch: boards in a frame, with openings (see-through) where `hole` says so.
const leaf = (body, frame, hole) => (x, y, r) => {
  if (hole(x, y)) return CLEAR;
  if (x === 0 || x === 15 || y === 0 || y === 15 || hole(x - 1, y) || hole(x + 1, y) || hole(x, y - 1) || hole(x, y + 1)) return jit(frame, 5, r);
  return jit(body, 7, r);
};
const panes = (x, y) => (x >= 3 && x <= 6 || x >= 9 && x <= 12) && (y >= 3 && y <= 6 || y >= 9 && y <= 12);

// The bed, drawn in block space for a bed whose head lies to the north: the top is seen from
// above (north at the bottom row), the sides from beside it (u = how far south). 3 rows of leg,
// 2 of frame, 4 of bedding. Other headings turn or mirror these (see BED_TURNS).
const BLANKET = [176, 36, 38], PILLOW = [238, 238, 234], FRAME = [146, 110, 66], LEG = [112, 82, 48];
const bedding = (x, y, r, pillow) => (pillow ? jit(y === 8 ? [250, 250, 248] : PILLOW, 4, r) : jit(y === 8 ? [204, 48, 50] : BLANKET, 6, r));
// a long side: `pillow` and `leg` say over which columns the pillow lies and the leg stands
const bedSide = (pillow, leg) => (x, y, r) => {
  if (y >= 9) return CLEAR;
  if (y < 3) return leg(x) ? jit(LEG, 6, r) : CLEAR;
  if (y < 5) return jit(FRAME, 6, r);
  return bedding(x, y, r, pillow(x));
};
const turned = (fn, turn) => (x, y, r) => (turn === 1 ? fn(y, 15 - x, r) : turn === 2 ? fn(15 - x, 15 - y, r) : turn === 3 ? fn(15 - y, x, r) : fn(x, y, r));
const bedHeadTop = (x, y, r) => (y < 6 ? jit(x === 0 || x === 15 || y === 0 || y === 5 ? [208, 208, 204] : PILLOW, 4, r) : jit((y + 1) % 5 === 0 ? [150, 28, 30] : [184, 38, 40], 6, r));

// A chest is a little smaller than its cell: one texel of nothing around the wood.
const chestWood = (x, y, r, rim) => (rim ? jit([58, 40, 20], 4, r) : jit(y % 4 === 2 ? [128, 88, 36] : [166, 118, 50], 7, r));

const DIRT = [134, 96, 67];
const GRASS = [96, 158, 56];
const ASPHALT = [58, 58, 63];

// name -> pixel function (x, y, rand) => [r, g, b, a]
const DEFS = {
  stone: (x, y, r) => jit([126, 126, 128], r() < 0.12 ? 26 : 11, r),
  dirt: noise(DIRT, 15),
  grass_top: noise(GRASS, 15),
  grass_side: (x, y, r) => (y >= 13 - ((x * 7 + 3) % 3) ? jit(GRASS, 14, r) : jit(DIRT, 14, r)),
  sand: noise([219, 207, 163], 9),
  gravel: (x, y, r) => jit([128, 124, 122], r() < 0.3 ? 30 : 12, r),
  water: (x, y, r) => {
    const p = jit([46, 104, 204], 9, r);
    p[3] = 172;
    return p;
  },
  asphalt: (x, y, r) => jit(ASPHALT, r() < 0.06 ? 24 : 6, r),
  road_line: (x, y, r) => (r() < 0.07 ? jit(ASPHALT, 6, r) : jit([226, 226, 220], 7, r)),
  pavement: (x, y, r) => (x % 8 === 0 || y % 8 === 0 ? jit([138, 137, 132], 5, r) : jit([170, 168, 162], 6, r)),
  paving: bricks([190, 168, 148], [150, 132, 118], 8, 4, 9),
  concrete: (x, y, r) => jit(y === 0 ? [160, 160, 157] : [180, 180, 176], 5, r),
  concrete_dark: (x, y, r) => jit(y === 0 ? [94, 96, 100] : [110, 112, 117], 5, r),
  white_tile: (x, y, r) => (x % 4 === 0 || y % 4 === 0 ? jit([212, 212, 206], 3, r) : jit([234, 234, 229], 4, r)),
  brick: bricks([152, 76, 60], [190, 184, 172], 8, 4, 14),
  beige_tile: bricks([206, 187, 150], [176, 160, 130], 8, 4, 7),
  steel: (x, y, r) => jit(x === 0 || x === 8 ? [48, 51, 58] : [66, 70, 79], 4, r),
  glass: (x, y, r) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return [214, 228, 238, 235];
    if (x + y === 12 || x + y === 13 || x + y === 20) return [228, 244, 255, 150];
    return [140 + r() * 12, 196 + r() * 10, 232, 92];
  },
  glass_dark: (x, y, r) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return [44, 52, 62, 245];
    if (x + y === 12 || x + y === 13) return [120, 160, 190, 190];
    return [34 + r() * 8, 66 + r() * 8, 92 + r() * 8, 170];
  },
  roof_gray: (x, y, r) => jit([122, 124, 127], r() < 0.2 ? 18 : 7, r),
  roof_kawara: roofTiles([62, 68, 78], 6),
  roof_blue: roofTiles([54, 90, 146], 7),
  roof_brown: roofTiles([146, 84, 54], 8),
  plaster: noise([228, 216, 192], 5),
  planks: (x, y, r) => {
    const row = Math.floor(y / 4);
    if (y % 4 === 0 || (x + row * 5) % 16 === 0) return jit([122, 92, 56], 6, r);
    return jit([172, 137, 86], 8, r);
  },
  log_side: (x, y, r) => jit(x % 3 === 0 ? [80, 62, 40] : [104, 81, 52], 7, r),
  log_top: (x, y, r) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.6) return jit([98, 76, 49], 6, r);
    return jit(Math.floor(d) % 2 ? [158, 124, 78] : [186, 152, 100], 5, r);
  },
  leaves: (x, y, r) => {
    const p = jit([52, 124, 44], 26, r);
    p[1] += 8;
    p[3] = r() < 0.2 ? 0 : 255;
    return p;
  },
  sakura: (x, y, r) => {
    const p = r() < 0.25 ? jit([255, 214, 230], 10, r) : jit([244, 168, 198], 16, r);
    p[3] = r() < 0.2 ? 0 : 255;
    return p;
  },
  floor: (x, y, r) => (x % 8 === 0 || y % 8 === 0 ? jit([176, 171, 160], 3, r) : jit([204, 199, 188], 4, r)),
  rail: (x, y, r) => jit(r() < 0.25 ? [120, 92, 70] : [92, 84, 80], 8, r),
  bedrock: (x, y, r) => jit([58, 58, 60], r() < 0.3 ? 34 : 12, r),
  farmland: (x, y, r) => jit(x % 4 < 2 ? [104, 70, 42] : [124, 86, 54], 9, r),
  turf: (x, y, r) => jit(Math.floor(x / 8) % 2 ? [74, 172, 74] : [66, 160, 68], 5, r),
  blue_panel: (x, y, r) => jit(x % 8 === 0 || y % 8 === 0 ? [70, 96, 124] : [94, 124, 154], 3, r),
  brown_tile: bricks([124, 86, 64], [92, 66, 50], 4, 2, 9, false),
  vermilion: (x, y, r) => jit(y % 8 === 0 ? [168, 44, 30] : [208, 62, 42], 6, r),
  lamp: (x, y, r) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return jit([150, 110, 60], 8, r);
    const d = Math.hypot(x - 7.5, y - 7.5) / 9;
    return mix([255, 250, 214], [246, 206, 120], d);
  },
  copper: roofTiles([92, 158, 136], 8),
  canopy: (x, y, r) => jit(r() < 0.3 ? [38, 96, 36] : [56, 128, 48], 16, r),
  tnt_side: (x, y, r) => {
    // red sticks with a paper band; the band carries three blocky letters
    const LETTERS = ['111.1..1.111', '.1..11.1..1.', '.1..1.11..1.', '.1..1..1..1.', '.1..1..1..1.'];
    if (y >= 5 && y <= 11) {
      const row = LETTERS[10 - y];
      if (row && x >= 2 && x < 14 && row[x - 2] === '1') return [38, 34, 34, 255];
      return jit([232, 226, 214], 5, r);
    }
    return jit(x % 4 === 0 ? [150, 34, 28] : [204, 52, 40], 7, r);
  },
  tnt_top: (x, y, r) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d < 1.6) return [40, 36, 34, 255];
    if (d < 2.6) return jit([150, 140, 126], 6, r);
    return jit((x + y) % 5 === 0 ? [160, 38, 30] : [206, 54, 42], 6, r);
  },
  tnt_bottom: (x, y, r) => jit((x + y) % 5 === 0 ? [140, 32, 26] : [176, 44, 34], 6, r),
  // opaque glazing for real buildings (the photo skin needs a closed surface)
  window: (x, y, r) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return [196, 206, 214, 255];
    if (x + y === 12 || x + y === 13 || x + y === 20) return [190, 214, 232, 255];
    return [96 + r() * 10, 136 + r() * 10, 170 + r() * 8, 255];
  },
  window_dark: (x, y, r) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return [44, 52, 62, 255];
    if (x + y === 12 || x + y === 13) return [84, 110, 130, 255];
    return [34 + r() * 8, 58 + r() * 8, 80 + r() * 8, 255];
  },
  snow: noise([240, 244, 248], 4),
  obsidian: (x, y, r) => jit(r() < 0.1 ? [58, 44, 84] : [22, 16, 32], r() < 0.2 ? 14 : 5, r),
  diamond_ore: (x, y, r) => {
    // stone with a few clusters of pale blue crystal
    const gem = [[3, 3], [4, 3], [4, 4], [10, 5], [11, 5], [11, 6], [6, 9], [7, 9], [7, 10], [12, 11], [13, 11], [2, 12], [3, 12], [9, 13]];
    if (gem.some(([gx, gy]) => gx === x && gy === y)) return jit((x + y) % 2 ? [98, 232, 224] : [200, 252, 250], 8, r);
    return jit([126, 126, 128], r() < 0.12 ? 26 : 11, r);
  },
  diamond_block: (x, y, r) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return jit([52, 160, 158], 6, r);
    if (x === 1 || y === 14) return jit([214, 252, 250], 4, r);
    return jit((x * 3 + y * 5) % 7 < 2 ? [150, 240, 234] : [104, 220, 214], 7, r);
  },
  netherrack: (x, y, r) => jit(r() < 0.22 ? [72, 28, 30] : [116, 52, 52], r() < 0.3 ? 20 : 9, r),
  soul_sand: (x, y, r) => {
    // dull brown sand with hollow-eyed faces sunk into it
    const dark = [[3, 10], [6, 10], [4, 8], [5, 8], [10, 5], [13, 5], [11, 3], [12, 3]];
    if (dark.some(([gx, gy]) => gx === x && gy === y)) return jit([40, 28, 22], 4, r);
    return jit([86, 66, 52], r() < 0.25 ? 16 : 7, r);
  },
  glowstone: (x, y, r) => {
    const k = r();
    return jit(k < 0.3 ? [140, 96, 48] : k < 0.7 ? [226, 170, 84] : [255, 232, 150], 8, r);
  },
  nether_bricks: bricks([50, 24, 30], [26, 12, 16], 8, 4, 6),
  lava: (x, y, r) => {
    const w = Math.sin(x * 0.9 + y * 0.5) + Math.sin(y * 1.1 - x * 0.3);
    return jit(w > 0.9 ? [255, 226, 92] : w > -0.2 ? [240, 126, 26] : [206, 70, 14], 8, r);
  },
  portal: (x, y, r) => {
    const w = Math.sin(x * 0.8 + y * 0.35) + Math.sin(y * 0.9 - x * 0.2);
    const p = jit(w > 1 ? [214, 150, 255] : w > 0 ? [134, 52, 214] : [88, 20, 170], 8, r);
    p[3] = w > 1 ? 210 : 165;
    return p;
  },
  chest_top: (x, y, r) => (x < 1 || x > 14 || y < 1 || y > 14 ? CLEAR : chestWood(x, y, r, x === 1 || x === 14 || y === 1 || y === 14)),
  chest_side: (x, y, r) => (x < 1 || x > 14 || y > 13 ? CLEAR : chestWood(x, y, r, x === 1 || x === 14 || y === 0 || y === 13 || y === 9)),
  // what a filled-in car is made of where the photo does not reach it: plain dark sheet metal
  fill: (x, y, r) => jit(x === 0 || y === 0 ? [44, 48, 54] : y === 15 || x === 15 ? [96, 102, 110] : [70, 75, 82], 4, r),
  // (new textures go at the end, like new blocks)
  magma: (x, y, r) => {
    // dark crust, glowing where it has cracked
    const w = Math.sin(x * 1.3 + y * 0.6) + Math.sin(y * 1.2 - x * 0.5);
    return w > 1.05 ? jit([255, 196, 70], 8, r) : w > 0.6 ? jit([226, 96, 22], 10, r) : jit([64, 26, 22], r() < 0.25 ? 16 : 7, r);
  },
  quartz_ore: (x, y, r) => {
    const vein = [[2, 3], [3, 3], [3, 4], [4, 4], [9, 2], [10, 2], [10, 3], [12, 8], [13, 8], [13, 9], [5, 10], [6, 10], [6, 11], [7, 11], [10, 13], [11, 13]];
    if (vein.some(([gx, gy]) => gx === x && gy === y)) return jit((x + y) % 2 ? [236, 226, 214] : [208, 190, 176], 6, r);
    return jit(r() < 0.22 ? [72, 28, 30] : [116, 52, 52], r() < 0.3 ? 20 : 9, r);
  },
  nether_gold_ore: (x, y, r) => {
    const nug = [[3, 4], [4, 4], [4, 5], [10, 3], [11, 3], [7, 8], [8, 8], [8, 9], [12, 11], [13, 11], [3, 12], [4, 12]];
    if (nug.some(([gx, gy]) => gx === x && gy === y)) return jit((x + y) % 2 ? [252, 222, 80] : [226, 158, 40], 8, r);
    return jit(r() < 0.22 ? [72, 28, 30] : [116, 52, 52], r() < 0.3 ? 20 : 9, r);
  },
  basalt_top: (x, y, r) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    return jit(d > 6.6 ? [58, 58, 62] : Math.floor(d) % 3 ? [96, 96, 102] : [76, 76, 82], 6, r);
  },
  basalt_side: (x, y, r) => jit(x % 4 === 0 ? [52, 52, 57] : (x * 5 + y) % 11 === 0 ? [112, 112, 118] : [82, 82, 88], 6, r),
  blackstone: (x, y, r) => jit(r() < 0.18 ? [62, 54, 62] : [36, 30, 38], r() < 0.3 ? 12 : 5, r),
  soul_soil: (x, y, r) => jit(r() < 0.2 ? [56, 42, 34] : [78, 60, 48], r() < 0.25 ? 12 : 6, r),
  crimson_nylium: (x, y, r) => jit(r() < 0.2 ? [98, 18, 22] : [176, 34, 38], r() < 0.3 ? 18 : 8, r),
  crimson_nylium_side: (x, y, r) => (y >= 13 - ((x * 7 + 3) % 3) ? jit([176, 34, 38], 12, r) : jit(r() < 0.22 ? [72, 28, 30] : [116, 52, 52], 10, r)),
  warped_nylium: (x, y, r) => jit(r() < 0.2 ? [20, 78, 72] : [42, 132, 120], r() < 0.3 ? 16 : 8, r),
  warped_nylium_side: (x, y, r) => (y >= 13 - ((x * 7 + 3) % 3) ? jit([42, 132, 120], 12, r) : jit(r() < 0.22 ? [72, 28, 30] : [116, 52, 52], 10, r)),
  // stems: dark bark with a vein of the fungus's colour running up it
  crimson_stem: (x, y, r) => jit((x * 3 + ((y / 5) | 0)) % 7 === 0 ? [214, 60, 44] : x % 3 === 0 ? [72, 34, 52] : [102, 48, 72], 6, r),
  crimson_stem_top: (x, y, r) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    return jit(d > 6.6 ? [92, 42, 64] : Math.floor(d) % 2 ? [128, 54, 78] : [152, 70, 92], 5, r);
  },
  warped_stem: (x, y, r) => jit((x * 3 + ((y / 5) | 0)) % 7 === 0 ? [38, 190, 160] : x % 3 === 0 ? [44, 34, 58] : [62, 48, 84], 6, r),
  warped_stem_top: (x, y, r) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    return jit(d > 6.6 ? [56, 44, 76] : Math.floor(d) % 2 ? [46, 112, 108] : [58, 140, 130], 5, r);
  },
  nether_wart: (x, y, r) => jit(r() < 0.25 ? [86, 4, 8] : [132, 8, 12], r() < 0.3 ? 16 : 7, r),
  warped_wart: (x, y, r) => jit(r() < 0.25 ? [10, 82, 92] : [22, 126, 134], r() < 0.3 ? 16 : 7, r),
  shroomlight: (x, y, r) => {
    const d = Math.hypot(x - 7.5, y - 7.5) / 10;
    return jit(mix([255, 214, 150], [226, 110, 54], d), 8, r);
  },
  // ---- the shaped blocks (blocks.js: models)
  chest_front: (x, y, r) => {
    if (x < 1 || x > 14 || y > 13) return CLEAR;
    if (x >= 7 && x <= 8 && y >= 7 && y <= 10) return jit(y === 10 || y === 7 ? [120, 124, 128] : [198, 202, 206], 4, r); // the latch
    return chestWood(x, y, r, x === 1 || x === 14 || y === 0 || y === 13 || y === 9);
  },
  chest_bottom: (x, y, r) => (x < 1 || x > 14 || y < 1 || y > 14 ? CLEAR : chestWood(x, y, r, true)),
  bed_top_head_n: bedHeadTop,
  bed_top_head_e: turned(bedHeadTop, 1),
  bed_top_head_s: turned(bedHeadTop, 2),
  bed_top_head_w: turned(bedHeadTop, 3),
  bed_top_foot: (x, y, r) => jit((x + y) % 7 === 0 ? [150, 28, 30] : [184, 38, 40], 6, r),
  bed_side_head_a: bedSide((x) => x < 6, (x) => x < 3),
  bed_side_head_b: bedSide((x) => x > 9, (x) => x > 12),
  bed_side_foot_a: bedSide(() => false, (x) => x > 12),
  bed_side_foot_b: bedSide(() => false, (x) => x < 3),
  bed_end_foot: bedSide(() => false, (x) => x < 3 || x > 12),
  bed_end_head: (x, y, r) => (y >= 9 ? CLEAR : y < 3 ? (x < 3 || x > 12 ? jit(LEG, 6, r) : CLEAR) : jit(y === 8 || y === 3 ? [122, 92, 56] : FRAME, 6, r)),
  bed_bottom: planksOf([150, 116, 70], [112, 86, 52]),
  door_oak_top: leaf([172, 137, 86], [122, 92, 56], (x, y) => panes(x, y) && y >= 3),
  door_oak_bottom: (x, y, r) => {
    if (x >= 12 && x <= 13 && y >= 12 && y <= 13) return jit([196, 200, 204], 4, r); // the handle
    const groove = x >= 3 && x <= 12 && y >= 3 && y <= 12 && (x === 3 || x === 12 || y === 3 || y === 12 || x === 7 || x === 8);
    return groove ? jit([122, 92, 56], 5, r) : leaf([172, 137, 86], [122, 92, 56], () => false)(x, y, r);
  },
  door_iron_top: leaf([206, 208, 210], [150, 152, 156], (x, y) => panes(x, y) && y >= 3),
  door_iron_bottom: (x, y, r) => {
    if (x >= 12 && x <= 13 && y >= 12 && y <= 13) return jit([90, 92, 96], 4, r);
    if (x % 5 === 2 && y % 5 === 2) return jit([150, 152, 156], 4, r); // rivets
    return leaf([206, 208, 210], [150, 152, 156], () => false)(x, y, r);
  },
  trapdoor: leaf([172, 137, 86], [122, 92, 56], panes),
  ladder: (x, y, r) => {
    const rail = x === 2 || x === 3 || x === 12 || x === 13;
    const rung = y % 4 === 1 && x >= 1 && x <= 14;
    return rail ? jit([112, 82, 48], 6, r) : rung ? jit([150, 116, 70], 6, r) : CLEAR;
  },
  torch: (x, y, r) => {
    if (x < 7 || x > 8 || y > 9) return CLEAR;
    return y >= 8 ? jit(y === 9 ? [255, 244, 170] : [255, 196, 60], 4, r) : jit(x === 7 ? [128, 96, 56] : [102, 76, 44], 5, r);
  },
  torch_top: () => [255, 232, 120, 255],
  // the same stick hung on a wall: wherever it can lie against one, a little above the floor
  torch_wall: (x, y, r) => {
    if (!(x < 2 || x > 13 || x === 7 || x === 8) || y < 3 || y > 12) return CLEAR;
    return y >= 11 ? jit(y === 12 ? [255, 244, 170] : [255, 196, 60], 4, r) : jit(x % 2 ? [128, 96, 56] : [102, 76, 44], 5, r);
  },
  // the thin edge of a glass pane, wherever a pane's two-texel thickness can lie
  pane_edge: (x, y, r) => (x === 7 || x === 8 || y === 7 || y === 8 ? [206 + r() * 10, 226, 236, 255] : CLEAR),
  iron_bars: (x, y, r) => {
    const bar = x === 1 || x === 5 || x === 9 || x === 13 || x === 2 || x === 6 || x === 10 || x === 14;
    const rail = (y === 1 || y === 14) && x >= 1 && x <= 14;
    return bar || rail ? jit(x % 4 === 1 ? [150, 152, 156] : [108, 110, 114], 5, r) : CLEAR;
  },
  // ---- more full blocks
  cobblestone: (x, y, r) => {
    const k = cobbles(x, y);
    return jit(Math.abs(k) < 0.17 ? [74, 74, 76] : k > 0 ? [146, 146, 148] : [114, 114, 116], 9, r);
  },
  mossy_cobblestone: (x, y, r) => {
    const k = cobbles(x, y);
    if (Math.sin(x * 0.9 - y * 1.3) + Math.sin(y * 0.6 + x * 0.4) > 0.75) return jit([86, 122, 62], 12, r);
    return jit(Math.abs(k) < 0.17 ? [74, 74, 76] : k > 0 ? [146, 146, 148] : [114, 114, 116], 9, r);
  },
  stone_bricks: bricks([128, 128, 130], [88, 88, 90], 8, 8, 8),
  mossy_stone_bricks: (x, y, r) => (Math.sin(x * 0.8 + y * 1.1) + Math.sin(y * 0.7 - x * 0.5) > 1 ? jit([92, 126, 68], 10, r) : bricks([128, 128, 130], [88, 88, 90], 8, 8, 8)(x, y, r)),
  smooth_stone: (x, y, r) => jit(x === 0 || y === 0 || x === 15 || y === 15 ? [126, 126, 128] : [166, 166, 168], 4, r),
  andesite: (x, y, r) => jit(r() < 0.2 ? [112, 112, 114] : [140, 140, 142], 9, r),
  diorite: (x, y, r) => jit(r() < 0.22 ? [150, 150, 152] : [204, 204, 206], 10, r),
  granite: (x, y, r) => jit(r() < 0.25 ? [128, 84, 70] : [160, 110, 92], 10, r),
  deepslate: (x, y, r) => jit(y % 4 === 0 ? [56, 56, 60] : (x + y * 3) % 9 === 0 ? [96, 96, 100] : [78, 78, 82], 6, r),
  sandstone_top: noise([224, 212, 168], 6),
  sandstone_side: (x, y, r) => jit(y >= 13 ? [230, 218, 176] : y === 12 || y === 3 ? [190, 176, 132] : [216, 203, 158], 6, r),
  sandstone_bottom: noise([200, 188, 146], 6),
  clay: noise([160, 166, 178], 5),
  ice: (x, y, r) => {
    const p = jit((x + y * 2) % 7 === 0 ? [214, 232, 255] : [150, 186, 246], 6, r);
    p[3] = 196;
    return p;
  },
  spruce_planks: planksOf([114, 84, 48], [82, 60, 34]),
  birch_planks: planksOf([196, 179, 123], [160, 144, 96]),
  dark_oak_planks: planksOf([66, 43, 20], [46, 30, 14]),
  bookshelf: (x, y, r) => {
    if (y >= 14 || y <= 1 || y === 7 || y === 8) return jit(y === 7 || y === 14 ? [122, 92, 56] : [172, 137, 86], 7, r);
    const shelf = y > 8 ? 1 : 0;
    const book = [[150, 40, 36], [40, 84, 150], [52, 122, 60], [196, 160, 60], [112, 60, 132], [70, 70, 76]][(x * 7 + shelf * 3 + ((x * x) % 5)) % 6];
    return x === 0 || x === 15 ? jit([122, 92, 56], 6, r) : jit(y === 12 || y === 5 ? [230, 222, 200] : book, 6, r);
  },
  crafting_table_top: (x, y, r) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return jit([92, 66, 38], 5, r);
    return jit(x === 5 || x === 10 || y === 5 || y === 10 ? [112, 82, 48] : [176, 132, 80], 6, r);
  },
  crafting_table_side: (x, y, r) => {
    if (y >= 13) return jit(y === 13 ? [92, 66, 38] : [150, 110, 64], 5, r);
    if (x >= 3 && x <= 5 && y >= 4 && y <= 10) return jit([136, 140, 146], 5, r); // a saw blade
    if (x >= 9 && x <= 12 && y >= 6 && y <= 8) return jit([96, 70, 40], 5, r); // a mallet
    if (x >= 10 && x <= 11 && y >= 2 && y <= 6) return jit([122, 92, 56], 5, r);
    return planksOf([172, 137, 86], [122, 92, 56])(x, y, r);
  },
  crafting_table_front: (x, y, r) => {
    if (y >= 13) return jit(y === 13 ? [92, 66, 38] : [150, 110, 64], 5, r);
    if (x >= 3 && x <= 12 && y >= 3 && y <= 10) return jit(x === 3 || x === 12 || y === 3 || y === 10 ? [92, 66, 38] : (x + y) % 3 === 0 ? [136, 140, 146] : [120, 88, 52], 5, r);
    return planksOf([172, 137, 86], [122, 92, 56])(x, y, r);
  },
  furnace_top: (x, y, r) => jit(x === 0 || y === 0 || x === 15 || y === 15 ? [84, 84, 86] : [118, 118, 120], 7, r),
  furnace_side: (x, y, r) => {
    const k = cobbles(x, y);
    return jit(y === 15 || y === 0 ? [84, 84, 86] : Math.abs(k) < 0.17 ? [80, 80, 82] : [128, 128, 130], 8, r);
  },
  furnace_front: (x, y, r) => {
    if (x >= 4 && x <= 11 && y >= 2 && y <= 6) return jit(y === 2 ? [70, 30, 14] : [24, 22, 22], 4, r); // the fire hole
    if (x >= 4 && x <= 11 && y >= 9 && y <= 12) return jit(y % 2 ? [40, 40, 42] : [96, 96, 98], 4, r); // the grate
    if (x >= 3 && x <= 12 && (y === 1 || y === 7 || y === 8 || y === 13)) return jit([72, 72, 74], 4, r);
    return jit(y === 15 || y === 0 ? [84, 84, 86] : [128, 128, 130], 8, r);
  },
  pumpkin_side: (x, y, r) => jit(x % 4 === 0 ? [176, 96, 14] : x % 4 === 2 ? [232, 146, 30] : [212, 124, 20], 7, r),
  pumpkin_top: (x, y, r) => (Math.hypot(x - 7.5, y - 7.5) < 1.8 ? jit([92, 110, 40], 6, r) : jit((x + y) % 4 === 0 ? [176, 96, 14] : [212, 124, 20], 7, r)),
  melon_side: (x, y, r) => jit(x % 4 === 0 ? [74, 118, 30] : x % 4 === 2 ? [132, 176, 44] : [108, 152, 36], 7, r),
  melon_top: (x, y, r) => jit((x + y) % 5 === 0 ? [74, 118, 30] : [116, 160, 40], 7, r),
  hay_side: (x, y, r) => (y === 4 || y === 5 || y === 10 || y === 11 ? jit([150, 60, 30], 6, r) : jit(x % 3 === 0 ? [176, 140, 20] : [214, 180, 44], 8, r)),
  hay_top: (x, y, r) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    return jit(Math.floor(d) % 2 ? [176, 140, 20] : [222, 190, 60], 7, r);
  },
  gold_block: cast([176, 126, 16], [255, 250, 180], [255, 226, 80], [246, 200, 46]),
  emerald_block: cast([18, 120, 52], [190, 255, 214], [70, 220, 120], [36, 190, 90]),
  lapis_block: cast([18, 44, 122], [130, 160, 240], [46, 86, 190], [30, 66, 160]),
  redstone_block: cast([110, 8, 4], [255, 120, 96], [214, 32, 16], [176, 20, 8]),
  coal_block: (x, y, r) => jit(r() < 0.2 ? [46, 46, 48] : [20, 20, 22], r() < 0.3 ? 10 : 4, r),
  quartz_block: (x, y, r) => jit(y === 0 || x === 0 ? [214, 208, 198] : (x * 5 + y * 3) % 11 === 0 ? [226, 220, 210] : [238, 234, 226], 3, r),
  coal_ore: ore([34, 34, 36], [58, 58, 60]),
  iron_ore: ore([216, 175, 147], [176, 134, 108]),
  gold_ore: ore([252, 222, 80], [226, 158, 40]),
  emerald_ore: ore([60, 214, 110], [176, 250, 200]),
  redstone_ore: ore([226, 30, 16], [150, 12, 6]),
  lapis_ore: ore([40, 84, 190], [110, 146, 232]),
  terracotta: noise([152, 94, 68], 5),
  sea_lantern: (x, y, r) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return jit([104, 150, 150], 6, r);
    return jit((x + y) % 4 < 2 ? [226, 246, 238] : [172, 220, 210], 6, r);
  },
  wool_white: wool([233, 236, 236]),
  wool_orange: wool([240, 118, 19]),
  wool_magenta: wool([189, 68, 179]),
  wool_light_blue: wool([58, 175, 217]),
  wool_yellow: wool([248, 198, 39]),
  wool_lime: wool([112, 185, 25]),
  wool_pink: wool([237, 141, 172]),
  wool_gray: wool([62, 68, 71]),
  wool_light_gray: wool([142, 142, 134]),
  wool_cyan: wool([21, 137, 145]),
  wool_purple: wool([121, 42, 172]),
  wool_blue: wool([53, 57, 157]),
  wool_brown: wool([114, 71, 40]),
  wool_green: wool([84, 109, 27]),
  wool_red: wool([160, 39, 34]),
  wool_black: wool([20, 21, 25]),
};

const BASE_NAMES = Object.keys(DEFS);
// One distant-facade texture per building style: a 4 m x 4 m wall section with its windows baked in.
export const TEX_NAMES = [...BASE_NAMES, ...STYLES.map((s) => `facade_${s.index}`)];
export const T = Object.fromEntries(TEX_NAMES.map((n, i) => [n, i]));
export const FACADE_METRES = 4;
// window texels carry this alpha so the far shader can light them at night
const WINDOW_ALPHA = 200;

function facade(style, wall, glass) {
  const pane = [glass[0] * 0.55 + 22, glass[1] * 0.55 + 26, glass[2] * 0.55 + 32];
  return (x, y, r) => {
    const col = x >> 2; // block column within the section
    let win;
    if (style.curtain) win = y >= 4 && x !== 0;
    else win = y >= 8 && col % style.period < style.win && x % 4 !== 0;
    if (!win) return jit(wall, 5, r);
    const p = jit(pane, 4, r);
    p[3] = WINDOW_ALPHA;
    return p;
  };
}

let cached = null;

// -> { data: Uint8Array (layers * 16 * 16 * 4), layers, avg: Uint8Array (layers * 3) }
export function buildTextures() {
  if (cached) return cached;
  const layers = TEX_NAMES.length;
  const data = new Uint8Array(layers * S * S * 4);
  const avg = new Uint8Array(layers * 3);
  TEX_NAMES.forEach((name, l) => {
    const r = rng(l + 11);
    let fn = DEFS[name];
    if (!fn) {
      const st = STYLES[l - BASE_NAMES.length];
      const w = T[st.wall] * 3, g = T[st.glass] * 3;
      fn = facade(st, [avg[w], avg[w + 1], avg[w + 2]], [avg[g], avg[g + 1], avg[g + 2]]);
    }
    let sr = 0, sg = 0, sb = 0, sa = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const p = fn(x, y, r);
        const o = ((l * S + y) * S + x) * 4;
        const a = p[3] ?? 255;
        data[o] = clamp(p[0]);
        data[o + 1] = clamp(p[1]);
        data[o + 2] = clamp(p[2]);
        data[o + 3] = clamp(a);
        sr += data[o] * a;
        sg += data[o + 1] * a;
        sb += data[o + 2] * a;
        sa += a;
      }
    }
    avg[l * 3] = sr / sa;
    avg[l * 3 + 1] = sg / sa;
    avg[l * 3 + 2] = sb / sa;
  });
  cached = { data, layers, avg };
  return cached;
}

// Replace one texture with pixels from outside (S x S RGBA, top row first), e.g. a texture
// pack's image. Has to happen before anything is drawn with it. False for an unknown name.
export function setLayer(name, rgba) {
  const l = T[name];
  if (l === undefined) return false;
  const { data, avg } = buildTextures();
  let sr = 0, sg = 0, sb = 0, sa = 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = ((S - 1 - y) * S + x) * 4; // our row 0 is the bottom one
      const o = ((l * S + y) * S + x) * 4;
      const a = rgba[i + 3];
      data[o] = rgba[i];
      data[o + 1] = rgba[i + 1];
      data[o + 2] = rgba[i + 2];
      data[o + 3] = a;
      sr += rgba[i] * a;
      sg += rgba[i + 1] * a;
      sb += rgba[i + 2] * a;
      sa += a;
    }
  }
  if (sa) {
    avg[l * 3] = sr / sa;
    avg[l * 3 + 1] = sg / sa;
    avg[l * 3 + 2] = sb / sa;
  }
  return true;
}
