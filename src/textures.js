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
