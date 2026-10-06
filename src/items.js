// Things the player can hold: every block, plus a few tools. Also their icons.
import { B, NAMES, PALETTE, TEX_TOP, TEX_SIDE } from './blocks.js';
import { buildTextures, TEX_SIZE } from './textures.js';

export const I = { PICKAXE: 300, SWORD: 301, FLINT: 302, BREAD: 303, EGG: 304, BOW: 305 };
const TOOL_NAMES = { [I.PICKAXE]: 'Kazma', [I.SWORD]: 'Kılıç', [I.FLINT]: 'Çakmak', [I.BREAD]: 'Ekmek', [I.EGG]: 'İskelet yumurtası', [I.BOW]: 'Yay' };

// What eating an item gives back (hunger points out of 20).
export const FOOD = { [I.BREAD]: 5 };

export const isBlock = (id) => id > 0 && id < 256;
export const itemName = (id) => (isBlock(id) ? NAMES[id] : TOOL_NAMES[id] || '');

// Creative catalogue, in display order.
export const CATALOG = [I.SWORD, I.BOW, I.PICKAXE, I.FLINT, B.TNT, I.EGG, I.BREAD, ...PALETTE];

// 9 hotbar slots followed by 27 storage slots.
export const DEFAULT_SLOTS = [I.SWORD, I.BOW, I.PICKAXE, I.FLINT, B.TNT, I.EGG, B.BRICK, B.PLANKS, I.BREAD, ...new Array(27).fill(0)];

// Shapeless 2x2 recipes: sorted ingredient ids -> result.
const RECIPES = [
  [[B.LOG], B.PLANKS],
  [[B.SAND, B.GRAVEL], B.TNT],
  [[B.SAND, B.SAND, B.SAND, B.SAND], B.GLASS],
  [[B.STONE, B.STONE, B.STONE, B.STONE], B.CONCRETE],
  [[B.STEEL, B.GRAVEL], I.FLINT],
  [[B.STEEL, B.STEEL, B.PLANKS], I.SWORD],
  [[B.STEEL, B.STEEL, B.STEEL, B.PLANKS], I.PICKAXE],
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

// Isometric cube for blocks, flat sprite for tools; 48 px square.
const icons = new Map();
export function itemIcon(id) {
  let c = icons.get(id);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 48;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (isBlock(id)) {
    const k = 22 / S, h = 11 / S;
    const face = (layer, a, b, cc, d, e, f, shade) => {
      ctx.setTransform(a, b, cc, d, e, f);
      ctx.drawImage(layerCanvas(layer), 0, 0);
      if (shade) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = `rgba(0,0,0,${shade})`;
        ctx.fillRect(0, 0, S, S);
        ctx.globalCompositeOperation = 'source-over';
      }
    };
    face(TEX_SIDE[id], k, h, 0, k, 2, 13, 0.22);
    face(TEX_SIDE[id], k, -h, 0, k, 24, 24, 0.42);
    face(TEX_TOP[id], k, -h, k, h, 2, 13, 0);
  } else if (SPRITES[id]) {
    ctx.drawImage(toolSprite(id), 0, 0, 48, 48);
  }
  icons.set(id, c);
  return c;
}
