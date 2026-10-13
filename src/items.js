// Things the player can hold: every block, plus a few tools. Also their icons.
import { tx } from './i18n.js';
import { B, NAMES, PALETTE, TEX_DIR, MODEL, PLACE, COLOURS, CARPET } from './blocks.js';
import { buildTextures, TEX_SIZE, T } from './textures.js';

export const I = { PICKAXE: 300, SWORD: 301, FLINT: 302, BREAD: 303, EGG: 304, BOW: 305, DIAMOND: 306, EGG_CREEPER: 307, EGG_ZOMBIE: 308, EGG_PIGLIN: 309, CAR: 310, EGG_PORTAL: 311 };
const TOOL_NAMES = {
  [I.PICKAXE]: 'Pickaxe', [I.SWORD]: 'Sword', [I.FLINT]: 'Flint and steel', [I.BREAD]: 'Bread', [I.EGG]: 'Skeleton egg', [I.BOW]: 'Bow',
  [I.DIAMOND]: 'Diamond', [I.EGG_CREEPER]: 'Creeper egg', [I.EGG_ZOMBIE]: 'Zombie egg', [I.EGG_PIGLIN]: 'Zombified piglin egg',
  [I.CAR]: 'Car body (4×2×2)', [I.EGG_PORTAL]: 'Portal egg',
};
// which creature climbs out of which egg (see mobs.js)
export const EGGS = { [I.EGG]: 'skeleton', [I.EGG_CREEPER]: 'creeper', [I.EGG_ZOMBIE]: 'zombie', [I.EGG_PIGLIN]: 'piglin' };

// What eating an item gives back (hunger points out of 20).
export const FOOD = { [I.BREAD]: 5 };

export const isBlock = (id) => id > 0 && id < 256;
export const itemName = (id) => (isBlock(id) ? NAMES[id] : tx(TOOL_NAMES[id] || ''));

// Creative catalogue, in display order.
export const CATALOG = [I.SWORD, I.BOW, I.PICKAXE, I.FLINT, B.TNT, I.BREAD, B.CHEST, B.BED, I.DIAMOND, I.EGG, I.EGG_CREEPER, I.EGG_ZOMBIE, I.EGG_PIGLIN, I.EGG_PORTAL, I.CAR, ...PALETTE];

// The catalogue's tabs, as in the creative inventory: a row above the window and two below it.
// Whatever block fits no other tab is a building block.
const COLOURED = [...COLOURS.map(([key]) => B[`WOOL_${key}`]), ...CARPET, B.TERRACOTTA];
const NATURAL = [B.GRASS, B.DIRT, B.STONE, B.SAND, B.GRAVEL, B.CLAY, B.LOG, B.LEAVES, B.SAKURA, B.TURF, B.FARMLAND, B.SNOW, B.ICE, B.WATER, B.PUMPKIN, B.MELON, B.HAY,
  B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.REDSTONE_ORE, B.LAPIS_ORE, B.EMERALD_ORE, B.DIAMOND_ORE];
const USEFUL = [B.TORCH, B.LAMP, B.SEA_LANTERN, B.CRAFTING_TABLE, B.FURNACE, B.CHEST, B.BED, B.OAK_DOOR, B.IRON_DOOR, B.TRAPDOOR, B.LADDER, B.FENCE, B.TNT];
const STREET = [B.ASPHALT, B.ROAD_LINE, B.PAVEMENT, B.PAVING, I.CAR, B.FILL];
const NETHER = [I.EGG_PORTAL, B.OBSIDIAN, B.NETHERRACK, B.SOUL_SAND, B.SOUL_SOIL, B.GLOWSTONE, B.NETHER_BRICKS, B.LAVA, B.MAGMA, B.QUARTZ_ORE, B.NETHER_GOLD_ORE,
  B.BASALT, B.BLACKSTONE, B.CRIMSON_NYLIUM, B.WARPED_NYLIUM, B.CRIMSON_STEM, B.WARPED_STEM, B.NETHER_WART, B.WARPED_WART, B.SHROOMLIGHT];
const TOOLS = [I.SWORD, I.BOW, I.PICKAXE, I.FLINT, I.BREAD, I.DIAMOND];
const SPAWN = [I.EGG, I.EGG_CREEPER, I.EGG_ZOMBIE, I.EGG_PIGLIN, I.EGG_PORTAL];
const sorted = new Set([...COLOURED, ...NATURAL, ...USEFUL, ...STREET, ...NETHER, ...TOOLS, ...SPAWN]);
// [name, icon, items, in the row below the window]
export const TABS = [
  ['All items', B.BOOKSHELF, CATALOG, true],
  ['Building blocks', B.BRICK, PALETTE.filter((id) => !sorted.has(id))],
  ['Coloured blocks', B.WOOL_CYAN, COLOURED],
  ['Natural blocks', B.GRASS, NATURAL],
  ['Useful blocks', B.CRAFTING_TABLE, USEFUL],
  ['Streets', B.ASPHALT, STREET],
  ['Nether', B.NETHERRACK, NETHER],
  ['Tools and combat', I.PICKAXE, TOOLS],
  ['Spawn eggs', I.EGG_CREEPER, SPAWN, true],
].map(([name, icon, items, below]) => ({ name, icon, below: !!below, items: items.filter((id) => id !== undefined && CATALOG.includes(id)) }));

// 9 hotbar slots followed by 27 storage slots.
export const DEFAULT_SLOTS = [I.SWORD, I.BOW, I.PICKAXE, I.FLINT, B.TNT, I.EGG_CREEPER, B.BRICK, B.PLANKS, I.BREAD, I.EGG_PORTAL, ...new Array(26).fill(0)];

// Shapeless 2x2 recipes: sorted ingredient ids -> result.
const RECIPES = [
  [[B.LOG], B.PLANKS],
  [[B.SAND, B.GRAVEL], B.TNT],
  [[B.SAND, B.SAND, B.SAND, B.SAND], B.GLASS],
  [[B.STONE, B.STONE, B.STONE, B.STONE], B.CONCRETE],
  [[B.STEEL, B.GRAVEL], I.FLINT],
  [[B.STEEL, B.STEEL, B.PLANKS], I.SWORD],
  [[B.STEEL, B.STEEL, B.STEEL, B.PLANKS], I.PICKAXE],
  [[B.PLANKS, B.PLANKS, B.PLANKS, B.PLANKS], B.CHEST],
  [[B.PLANKS, B.PLANKS, B.BRICK], B.BED], // no wool here: the red comes from brick dust
  [[I.DIAMOND, I.DIAMOND, I.DIAMOND, I.DIAMOND], B.DIAMOND_BLOCK],
  [[B.DIAMOND_BLOCK], I.DIAMOND],
  [[B.STONE], B.COBBLESTONE],
  [[B.COBBLESTONE, B.COBBLESTONE, B.COBBLESTONE, B.COBBLESTONE], B.STONE_BRICKS],
  [[B.PLANKS, B.PLANKS], B.OAK_SLAB],
  [[B.PLANKS, B.PLANKS, B.PLANKS], B.OAK_STAIRS],
  [[B.COBBLESTONE, B.COBBLESTONE], B.COBBLESTONE_SLAB],
  [[B.COBBLESTONE, B.COBBLESTONE, B.COBBLESTONE], B.COBBLESTONE_STAIRS],
  [[B.LOG, B.PLANKS], B.FENCE],
  [[B.LOG, B.LOG], B.LADDER],
  [[B.LOG, B.GRAVEL], B.TORCH],
  [[B.PLANKS, B.LOG, B.LOG], B.OAK_DOOR],
  [[B.STEEL, B.STEEL, B.STEEL, B.STEEL], B.IRON_DOOR],
  [[B.PLANKS, B.PLANKS, B.LOG], B.TRAPDOOR],
  [[B.GLASS, B.GLASS], B.GLASS_PANE],
  [[B.STEEL, B.STEEL], B.IRON_BARS],
  [[B.PLANKS, B.PLANKS, B.LOG, B.LOG], B.CRAFTING_TABLE],
  [[B.COBBLESTONE, B.COBBLESTONE, B.COBBLESTONE, B.GRAVEL], B.FURNACE],
  [[B.SAND, B.SAND, B.SAND], B.SANDSTONE],
].map(([a, r]) => [a.slice().sort((p, q) => p - q).join(','), r]);

export function craft(grid) {
  const key = grid.filter(Boolean).sort((p, q) => p - q).join(',');
  const hit = RECIPES.find(([k]) => k === key);
  return hit ? hit[1] : 0;
}

// ---------------------------------------------------------------- icons

const S = TEX_SIZE;
const layers = new Map();

// One texture layer as a canvas (texture row 0 is the bottom).
export function layerCanvas(layer) {
  let c = layers.get(layer);
  if (!c) {
    const { data } = buildTextures();
    c = document.createElement('canvas');
    c.width = c.height = S;
    const img = new ImageData(S, S);
    for (let y = 0; y < S; y++) {
      const src = (layer * S + (S - 1 - y)) * S * 4;
      img.data.set(data.subarray(src, src + S * 4), y * S * 4);
    }
    c.getContext('2d').putImageData(img, 0, 0);
    layers.set(layer, c);
  }
  return c;
}

// 16x16 pixel sprites for the tools, drawn here (rows top to bottom, one char per pixel).
const SPRITES = {
  [I.SWORD]: {
    pal: { w: '#f6f6f6', l: '#d4d8dc', g: '#8f979e', k: '#2e3338', d: '#4b3a23', b: '#8a5a2b' },
    rows: [
      '.............kkk', '............kwlk', '...........kwlgk', '..........kwlgk.', '.........kwlgk..', '........kwlgk...',
      '.......kwlgk....', '..kk..kwlgk.....', '.kddkkwlgk......', '..kddklgk.......', '...kddkk........', '..kbkddk........',
      '.kbbk.kddk......', 'kbbk...kk.......', 'kbk.............', '.k..............',
    ],
  },
  [I.PICKAXE]: {
    pal: { l: '#dfe3e6', g: '#9aa2a9', k: '#2e3338', b: '#8a5a2b', d: '#5e3c1c' },
    rows: [
      '....kkkkkk......', '...kllllllkk....', '..klggggggglk...', '..kgkkkkkbglk...', '...k....kbdkglk.', '.......kbdk.kgk.',
      '......kbdk..kgk.', '.....kbdk...kgk.', '....kbdk....kgk.', '...kbdk......k..', '..kbdk..........', '.kbdk...........',
      'kbdk............', 'kdk.............', '.k..............', '................',
    ],
  },
  [I.BREAD]: {
    pal: { k: '#4a2f12', l: '#e0b060', b: '#c8923e', d: '#9a6a25' },
    rows: [
      '................', '................', '................', '................', '.....kkkkkkk....', '...kkllllllbkk..',
      '..klllblllbbbbk.', '.kllbllbllbblbbk', '.klllbllbllbbbbk', '.kbblllllllbbbdk', '..kbbbbbbbbbbdk.', '...kkdddddddkk..',
      '.....kkkkkkk....', '................', '................', '................',
    ],
  },
  // a wooden stave bent by its string
  [I.BOW]: {
    pal: { b: '#8a5a2b', d: '#5e3c1c', s: '#e6e6e0' },
    rows: [
      '................', '.......bbbbbb...', '.....bbdd..s....', '....bbd...s.....', '...bbd...s......', '..bbd...s.......',
      '..bd...s........', '.bbd..s.........', '.bd..s..........', '.bd.s...........', '.bds............', '.bs.............',
      '.b..............', '................', '................', '................',
    ],
  },
  // a steel striker and a piece of flint, sparks between them
  [I.FLINT]: {
    pal: { l: '#e2e6ea', g: '#8f979e', k: '#2e3338', f: '#565b63', h: '#8a9099', s: '#ffd23f' },
    rows: [
      '................', '..kkkkkk........', '.kllllllk.......', '.klgkkkglk......', '.klgk..kglk.....', '.klgk...kk......',
      '.klgk.....s.....', '.klgkk...s.s....', '..klggk...kkk...', '...kkkk..khhfk..', '.........khfffk.', '........khfffffk',
      '........kfffffk.', '.........kfffk..', '..........kkk...', '................',
    ],
  },
  // put it down and a skeleton archer climbs out (see mobs.js)
  [I.EGG]: {
    pal: { k: '#3a3a36', g: '#d9d9d0', l: '#f2f2ea', d: '#77776f' },
    rows: [
      '................', '......kkkk......', '.....kgllgk.....', '....kglgdggk....', '....kggggggk....', '...kgdgggggdk...',
      '...kggggdgggk...', '..kggggggggggk..', '..kgdggggggdgk..', '..kggggdgggggk..', '..kggggggggggk..', '..kgggdggggdgk..',
      '...kggggggggk...', '....kkggggkk....', '......kkkk......', '................',
    ],
  },
};

// a cut stone, pale blue
SPRITES[I.DIAMOND] = {
  pal: { k: '#145a5a', l: '#d6fffb', g: '#6fe9df', d: '#2fb8b0' },
  rows: [
    '................', '................', '.....kkkkkk.....', '....klllgggk....', '...kllgggggdk...', '..klgggggggddk..',
    '..kggggggggddk..', '..kdgggggggddk..', '...kdggggddddk..', '....kdgggdddk...', '.....kdgdddk....', '......kdddk.....',
    '.......kdk......', '........k.......', '................', '................',
  ],
};
// a little car from the side: gives the car in the photo a body (see carBody in main.js)
SPRITES[I.CAR] = {
  pal: { k: '#1c2026', b: '#3f78c4', l: '#7fb0ee', w: '#cfe6f6', t: '#2a2d33', h: '#9aa2a9' },
  rows: [
    '................', '................', '................', '.....kkkkkk.....', '....kwwkwwwk....', '...kwwwkwwwwk...',
    '.kkkbbbbbbbbbkk.', 'kllbbbbbbbbbbbbk', 'kbbbbbbbbbbbbbbk', 'kbbkkkbbbbkkkbbk', '.kkkttkkkkkttkk.', '...ktthk..ktthk.',
    '....kkk....kkk..', '................', '................', '................',
  ],
};
// the other eggs: the same shell in each creature's colours
for (const [id, pal] of [
  [I.EGG_CREEPER, { k: '#12360f', g: '#3fae2e', l: '#7fe064', d: '#0e0e0e' }],
  [I.EGG_ZOMBIE, { k: '#0e3a3f', g: '#2aa7b0', l: '#6fd8de', d: '#5f8f3c' }],
  [I.EGG_PIGLIN, { k: '#4a2a2a', g: '#e79a8f', l: '#f6c2b8', d: '#4c7129' }],
  // nothing climbs out of this one: a whole portal stands where it is put down (main.js: openPortal)
  [I.EGG_PORTAL, { k: '#150d21', g: '#7a2ed6', l: '#c58bff', d: '#1b1230' }],
]) SPRITES[id] = { pal, rows: SPRITES[I.EGG].rows };

// Sprites a texture pack supplies instead of the drawings above (item id -> 16x16 canvas).
export const packSprites = new Map();

const sprites = new Map();
export function toolSprite(id) {
  let c = packSprites.get(id) || sprites.get(id);
  if (!c) {
    const def = SPRITES[id] || { pal: {}, rows: [] }; // an unknown item draws as nothing
    c = document.createElement('canvas');
    c.width = c.height = 16;
    const ctx = c.getContext('2d');
    def.rows.forEach((row, y) => {
      for (let x = 0; x < 16; x++) {
        const col = def.pal[row[x]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    });
    sprites.set(id, c);
  }
  return c;
}

// ---- how an item is shown in the hand and in a slot

// Items that are a flat picture although they are blocks: the textures they are made of, top to
// bottom (a door is its upper and its lower half).
const FLAT = new Map([
  [B.LADDER, [T.ladder]], [B.TORCH, [T.torch]], [B.IRON_BARS, [T.iron_bars]], [B.GLASS_PANE, [T.glass]],
  [B.OAK_DOOR, [T.door_oak_top, T.door_oak_bottom]], [B.IRON_DOOR, [T.door_iron_top, T.door_iron_bottom]],
]);

function flatSprite(id) {
  let c = packSprites.get(id) || sprites.get(id);
  if (c) return c;
  const list = FLAT.get(id);
  if (list.length === 1) c = layerCanvas(list[0]);
  else {
    c = document.createElement('canvas');
    c.width = c.height = 16;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    list.forEach((l, i) => ctx.drawImage(layerCanvas(l), 4, i * 8, 8, 8));
  }
  sprites.set(id, c);
  return c;
}

// What an item looks like: { flat: 16 px canvas }, or { parts, span } for anything with a shape
// of its own (parts: [{ boxes, tex, off }] in block units, span: how far they reach along x, y, z),
// or { cube: its six face textures } (order as TEX_DIR). Seen from the north-west and above, as
// the slots show it: an item with a front turns it that way.
export function itemLook(id) {
  if (!isBlock(id)) return { flat: toolSprite(id) };
  if (FLAT.has(id)) return { flat: flatSprite(id) };
  const p = PLACE[id];
  if (id === B.BED) {
    // lying along x, its foot towards the viewer
    return { parts: [{ ...MODEL[p.ids[1]], off: [0, 0, 0] }, { ...MODEL[p.heads[1]], off: [1, 0, 0] }], span: [2, 0.5625, 1] };
  }
  const shown = p && p.how === 'front' ? p.ids[0] : p && p.how === 'away' ? p.ids[2] : id;
  const m = MODEL[shown];
  if (!m) return { cube: TEX_DIR.map((t) => t[shown]) };
  const boxes = m.byMask ? m.byMask[10] : m.boxes; // a fence: the stretch between two posts
  let top = 0;
  for (const b of boxes) top = Math.max(top, b[4]);
  return { parts: [{ boxes, tex: m.tex, off: [0, 0, 0] }], span: [1, top, 1] };
}

const shadedLayers = new Map();
// A texture darkened as a whole, see-through texels left alone.
function shaded(layer, shade) {
  if (!shade) return layerCanvas(layer);
  const key = `${layer}:${shade}`;
  let c = shadedLayers.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.drawImage(layerCanvas(layer), 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(0,0,0,${shade})`;
    ctx.fillRect(0, 0, S, S);
    shadedLayers.set(key, c);
  }
  return c;
}

// The shaped blocks, box by box, in the same view as the cubes: the top, the west face on the
// left, the north face on the right. Each face shows the part of its texture that lies where
// the face does, as in the world.
function drawParts(ctx, parts, span) {
  // screen = (X0 + 22 s (x + span.z - z), Y0 + 11 s (span.z - z - x) - 22 s y)
  const wide = 22 * (span[0] + span[2]), high = 11 * (span[0] + span[2]) + 22 * span[1];
  const s = Math.min(1, 44 / wide, 44 / high);
  const X0 = 24 - (wide * s) / 2, Y0 = 24 - (high * s) / 2 + 11 * s * span[0] + 22 * s * span[1];
  const k = (22 * s) / S, h = (11 * s) / S;
  const faces = [];
  for (const part of parts) {
    const [px, py, pz] = part.off;
    for (const b of part.boxes) {
      const t = b[6] || part.tex;
      const near = -(px + (b[0] + b[3]) / 2) - (pz + (b[2] + b[5]) / 2) + py + (b[1] + b[4]) / 2;
      const sx = b[0] * S, sw = (b[3] - b[0]) * S, sy = (1 - b[4]) * S, sh = (b[4] - b[1]) * S;
      const zx = b[2] * S, zw = (b[5] - b[2]) * S;
      if (sw > 0 && zw > 0) {
        faces.push([near + 0.001, shaded(t[2], 0), [k, -h, k, h, X0 + 22 * s * (px + span[2] - pz - 1), Y0 + 11 * s * (span[2] - pz - 1 - px) - 22 * s * (py + b[4])], sx, (1 - b[5]) * S, sw, zw]);
      }
      if (zw > 0 && sh > 0) {
        faces.push([near, shaded(t[1], 0.22), [-k, -h, 0, k, X0 + 22 * s * (px + b[0] + span[2] - pz), Y0 + 11 * s * (span[2] - pz - px - b[0]) - 22 * s * (py + 1)], zx, sy, zw, sh]);
      }
      if (sw > 0 && sh > 0) {
        faces.push([near, shaded(t[5], 0.42), [k, -h, 0, k, X0 + 22 * s * (px + span[2] - pz - b[2]), Y0 + 11 * s * (span[2] - pz - b[2] - px) - 22 * s * (py + 1)], sx, sy, sw, sh]);
      }
    }
  }
  faces.sort((p, q) => p[0] - q[0]); // far to near
  for (const [, img, m, x, y, w, hh] of faces) {
    ctx.setTransform(...m);
    ctx.drawImage(img, x, y, w, hh, x, y, w, hh);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Isometric cube for blocks, flat sprite for tools; 48 px square.
const icons = new Map();
export function itemIcon(id) {
  let c = icons.get(id);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 48;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const look = isBlock(id) || SPRITES[id] || packSprites.has(id) ? itemLook(id) : null;
  if (!look) {
    // an unknown item draws as nothing
  } else if (look.flat) ctx.drawImage(look.flat, 0, 0, 48, 48);
  else if (look.parts) drawParts(ctx, look.parts, look.span);
  else {
    const k = 22 / S, h = 11 / S;
    const face = (layer, a, b, cc, d, e, f, shade) => {
      ctx.setTransform(a, b, cc, d, e, f);
      ctx.drawImage(shaded(layer, shade), 0, 0);
    };
    face(look.cube[1], k, h, 0, k, 2, 13, 0.22);
    face(look.cube[5], k, -h, 0, k, 24, 24, 0.42);
    face(look.cube[2], k, -h, k, h, 2, 13, 0);
  }
  icons.set(id, c);
  return c;
}
