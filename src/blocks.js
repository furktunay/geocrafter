import { tx } from './i18n.js';
import { T } from './textures.js';

// [key, display name, top, side, bottom, options]
// options: pass 0 = opaque mesh (cutout allowed), 1 = translucent mesh
//          solid (collision), opaque (hides neighbour faces), shade (blocks sky light / casts AO)
//          glow: 1 = window that lights up at night, 2 = always emissive
//          sound: what it sounds like dug, placed or walked on (stone unless said)
//          front: the texture of the sides facing north and west, where it differs
// The sixteen dyes, in the order the wool and the carpets are numbered.
export const COLOURS = [
  ['WHITE', 'White'], ['ORANGE', 'Orange'], ['MAGENTA', 'Magenta'], ['LIGHT_BLUE', 'Light blue'], ['YELLOW', 'Yellow'], ['LIME', 'Lime'],
  ['PINK', 'Pink'], ['GRAY', 'Gray'], ['LIGHT_GRAY', 'Light gray'], ['CYAN', 'Cyan'], ['PURPLE', 'Purple'], ['BLUE', 'Blue'],
  ['BROWN', 'Brown'], ['GREEN', 'Green'], ['RED', 'Red'], ['BLACK', 'Black'],
];

const DEFS = [
  ['AIR', 'Air', 0, 0, 0, { solid: false, opaque: false, shade: false }],
  ['STONE', 'Stone', T.stone],
  ['DIRT', 'Dirt', T.dirt],
  ['GRASS', 'Grass', T.grass_top, T.grass_side, T.dirt],
  ['SAND', 'Sand', T.sand],
  ['GRAVEL', 'Gravel', T.gravel],
  ['WATER', 'Water', T.water, T.water, T.water, { pass: 1, solid: false, opaque: false, shade: false }],
  ['ASPHALT', 'Asphalt', T.asphalt],
  ['ROAD_LINE', 'Road marking', T.road_line, T.asphalt, T.asphalt],
  ['PAVEMENT', 'Pavement', T.pavement],
  ['PAVING', 'Paving bricks', T.paving],
  ['CONCRETE', 'Concrete', T.concrete],
  ['CONCRETE_DARK', 'Dark concrete', T.concrete_dark],
  ['WHITE_TILE', 'White tile', T.white_tile],
  ['BRICK', 'Bricks', T.brick],
  ['BEIGE_TILE', 'Beige tile', T.beige_tile],
  ['STEEL', 'Steel', T.steel],
  ['GLASS', 'Glass', T.glass, T.glass, T.glass, { pass: 1, opaque: false, shade: false, glow: 1 }],
  ['GLASS_DARK', 'Tinted glass', T.glass_dark, T.glass_dark, T.glass_dark, { pass: 1, opaque: false, shade: false, glow: 1 }],
  ['ROOF_GRAY', 'Roof concrete', T.roof_gray],
  ['ROOF_KAWARA', 'Kawara roof tile', T.roof_kawara],
  ['ROOF_BLUE', 'Blue roof tile', T.roof_blue],
  ['ROOF_BROWN', 'Brown roof tile', T.roof_brown],
  ['PLASTER', 'Plaster', T.plaster],
  ['PLANKS', 'Planks', T.planks],
  ['LOG', 'Log', T.log_top, T.log_side, T.log_top],
  ['LEAVES', 'Leaves', T.leaves, T.leaves, T.leaves, { opaque: false }],
  ['SAKURA', 'Sakura', T.sakura, T.sakura, T.sakura, { opaque: false }],
  ['FLOOR', 'Floor tile', T.floor],
  ['RAIL', 'Rail', T.rail, T.gravel, T.gravel],
  ['BEDROCK', 'Bedrock', T.bedrock],
  ['FARMLAND', 'Farmland', T.farmland, T.dirt, T.dirt],
  ['TURF', 'Turf', T.turf, T.dirt, T.dirt],
  ['BLUE_PANEL', 'Blue panel', T.blue_panel],
  ['BROWN_TILE', 'Brown tile', T.brown_tile],
  ['VERMILION', 'Torii red', T.vermilion],
  ['LAMP', 'Lamp', T.lamp, T.lamp, T.lamp, { glow: 2 }],
  ['COPPER', 'Copper roof', T.copper],
  ['SNOW', 'Snow', T.snow],
  ['DECK', 'Viaduct', T.asphalt, T.concrete, T.concrete],
  ['DECK_LINE', 'Viaduct marking', T.road_line, T.concrete, T.concrete],
  ['DECK_RAIL', 'Rail viaduct', T.gravel, T.concrete, T.concrete],
  ['DECK_TRACK', 'Viaduct track', T.rail, T.concrete, T.concrete],
  ['WINDOW', 'Window', T.window, T.window, T.window, { glow: 1 }],
  ['WINDOW_DARK', 'Tinted window', T.window_dark, T.window_dark, T.window_dark, { glow: 1 }],
  ['CANOPY', 'Tree crown', T.canopy],
  ['TNT', 'TNT', T.tnt_top, T.tnt_side, T.tnt_bottom],
  // (new blocks go at the end: saved changes hold these numbers)
  ['OBSIDIAN', 'Obsidian', T.obsidian],
  ['DIAMOND_ORE', 'Diamond ore', T.diamond_ore],
  ['DIAMOND_BLOCK', 'Block of diamond', T.diamond_block],
  ['NETHERRACK', 'Netherrack', T.netherrack],
  ['SOUL_SAND', 'Soul sand', T.soul_sand],
  ['GLOWSTONE', 'Glowstone', T.glowstone, T.glowstone, T.glowstone, { glow: 2 }],
  ['NETHER_BRICKS', 'Nether bricks', T.nether_bricks],
  ['LAVA', 'Lava', T.lava, T.lava, T.lava, { solid: false, shade: false, glow: 2 }],
  ['PORTAL', 'Nether portal', T.portal, T.portal, T.portal, { pass: 1, solid: false, opaque: false, shade: false, glow: 2, touch: true }],
  // these two are shaped (see the models below): the chest with its front to the south, the
  // foot half of a bed whose head lies to the north
  ['CHEST', 'Chest', T.chest_top, T.chest_side, T.chest_bottom, { sound: 'wood' }],
  ['BED', 'Bed', T.bed_top_foot, T.bed_side_foot_a, T.bed_bottom, { sound: 'wood' }],
  // what the body of a car in a photo is made of (World.addBody). Unlike every other block the
  // player can place it wears the photo (see mesher.js): its own texture only shows where the
  // camera could not see, the inside of a car that has been broken open
  ['FILL', 'Photo fill', T.fill],
  // the rest of the Nether (nether.js)
  ['MAGMA', 'Magma block', T.magma, T.magma, T.magma, { glow: 2 }],
  ['QUARTZ_ORE', 'Nether quartz ore', T.quartz_ore],
  ['NETHER_GOLD_ORE', 'Nether gold ore', T.nether_gold_ore],
  ['BASALT', 'Basalt', T.basalt_top, T.basalt_side, T.basalt_top],
  ['BLACKSTONE', 'Blackstone', T.blackstone],
  ['SOUL_SOIL', 'Soul soil', T.soul_soil],
  ['CRIMSON_NYLIUM', 'Crimson nylium', T.crimson_nylium, T.crimson_nylium_side, T.netherrack],
  ['WARPED_NYLIUM', 'Warped nylium', T.warped_nylium, T.warped_nylium_side, T.netherrack],
  ['CRIMSON_STEM', 'Crimson stem', T.crimson_stem_top, T.crimson_stem, T.crimson_stem_top],
  ['WARPED_STEM', 'Warped stem', T.warped_stem_top, T.warped_stem, T.warped_stem_top],
  ['NETHER_WART', 'Nether wart block', T.nether_wart],
  ['WARPED_WART', 'Warped wart block', T.warped_wart],
  ['SHROOMLIGHT', 'Shroomlight', T.shroomlight, T.shroomlight, T.shroomlight, { glow: 2 }],
  // more to build with
  ['COBBLESTONE', 'Cobblestone', T.cobblestone],
  ['MOSSY_COBBLESTONE', 'Mossy cobblestone', T.mossy_cobblestone],
  ['STONE_BRICKS', 'Stone bricks', T.stone_bricks],
  ['MOSSY_STONE_BRICKS', 'Mossy stone bricks', T.mossy_stone_bricks],
  ['SMOOTH_STONE', 'Smooth stone', T.smooth_stone],
  ['ANDESITE', 'Andesite', T.andesite],
  ['DIORITE', 'Diorite', T.diorite],
  ['GRANITE', 'Granite', T.granite],
  ['DEEPSLATE', 'Deepslate', T.deepslate],
  ['SANDSTONE', 'Sandstone', T.sandstone_top, T.sandstone_side, T.sandstone_bottom],
  ['CLAY', 'Clay', T.clay, T.clay, T.clay, { sound: 'gravel' }],
  ['ICE', 'Ice', T.ice, T.ice, T.ice, { pass: 1, opaque: false, shade: false, sound: 'glass' }],
  ['SPRUCE_PLANKS', 'Spruce planks', T.spruce_planks, T.spruce_planks, T.spruce_planks, { sound: 'wood' }],
  ['BIRCH_PLANKS', 'Birch planks', T.birch_planks, T.birch_planks, T.birch_planks, { sound: 'wood' }],
  ['DARK_OAK_PLANKS', 'Dark oak planks', T.dark_oak_planks, T.dark_oak_planks, T.dark_oak_planks, { sound: 'wood' }],
  ['BOOKSHELF', 'Bookshelf', T.planks, T.bookshelf, T.planks, { sound: 'wood' }],
  ['CRAFTING_TABLE', 'Crafting table', T.crafting_table_top, T.crafting_table_side, T.planks, { sound: 'wood', front: T.crafting_table_front }],
  ['PUMPKIN', 'Pumpkin', T.pumpkin_top, T.pumpkin_side, T.pumpkin_top, { sound: 'wood' }],
  ['MELON', 'Melon', T.melon_top, T.melon_side, T.melon_top, { sound: 'wood' }],
  ['HAY', 'Hay bale', T.hay_top, T.hay_side, T.hay_top, { sound: 'grass' }],
  ['GOLD_BLOCK', 'Block of gold', T.gold_block],
  ['EMERALD_BLOCK', 'Block of emerald', T.emerald_block],
  ['LAPIS_BLOCK', 'Block of lapis lazuli', T.lapis_block],
  ['REDSTONE_BLOCK', 'Block of redstone', T.redstone_block],
  ['COAL_BLOCK', 'Block of coal', T.coal_block],
  ['QUARTZ', 'Block of quartz', T.quartz_block],
  ['COAL_ORE', 'Coal ore', T.coal_ore],
  ['IRON_ORE', 'Iron ore', T.iron_ore],
  ['GOLD_ORE', 'Gold ore', T.gold_ore],
  ['EMERALD_ORE', 'Emerald ore', T.emerald_ore],
  ['REDSTONE_ORE', 'Redstone ore', T.redstone_ore],
  ['LAPIS_ORE', 'Lapis lazuli ore', T.lapis_ore],
  ['TERRACOTTA', 'Terracotta', T.terracotta],
  ['SEA_LANTERN', 'Sea lantern', T.sea_lantern, T.sea_lantern, T.sea_lantern, { glow: 2, sound: 'glass' }],
  ...COLOURS.map(([key, name]) => [`WOOL_${key}`, `${name} wool`, T[`wool_${key.toLowerCase()}`], undefined, undefined, { sound: 'grass' }]),
];

export const B = {};
export const NAMES = [];
export const TEX_TOP = new Uint8Array(256);
export const TEX_SIDE = new Uint8Array(256);
export const TEX_BOTTOM = new Uint8Array(256);
// The texture of each face, by the direction it looks: +x, -x, +y, -y, +z, -z.
export const TEX_DIR = [0, 1, 2, 3, 4, 5].map(() => new Uint8Array(256));
export const SOLID = new Uint8Array(256);
export const OPAQUE = new Uint8Array(256);
export const SHADE = new Uint8Array(256);
export const PASS = new Uint8Array(256);
export const GLOW = new Uint8Array(256);
export const TOUCH = new Uint8Array(256); // a look or a swing stops at it: every solid block, and the portal
export const SOUND = new Array(256).fill('stone');
// Shaped blocks. One block number per shape and heading: the saved changes are numbers and
// nothing else, so the number has to say all of it.
// MODEL[id]: null for a plain cube, else { boxes, tex, sel?, byMask? } with boxes as
// [x0, y0, z0, x1, y1, z1, tex?] in block units and tex the six face textures (order as TEX_DIR).
export const MODEL = new Array(256).fill(null);
export const ITEM_OF = new Uint8Array(256); // the block as it is carried: a door is one item, whichever way it hangs
export const KIND = new Array(256).fill(''); // what sort of shaped block ('stairs', 'door', ...)
export const FACING = new Int8Array(256).fill(-1); // 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x)
export const MATE = new Array(256).fill(null); // the other half of a two-cell thing: [dx, dy, dz, its block number]
export const PLACE = new Array(256).fill(null); // by item: how it goes into the world (see place() in main.js)
export const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];

let count = 0;
function register(key, name, tex, o = {}) {
  const id = count++;
  if (id > 255) throw new Error('out of block numbers');
  if (key) B[key] = id;
  NAMES[id] = tx(name);
  for (let d = 0; d < 6; d++) TEX_DIR[d][id] = tex[d];
  TEX_TOP[id] = tex[2];
  TEX_SIDE[id] = tex[4];
  TEX_BOTTOM[id] = tex[3];
  SOLID[id] = o.solid === false ? 0 : 1;
  OPAQUE[id] = o.opaque === false ? 0 : 1;
  SHADE[id] = o.shade === false ? 0 : 1;
  PASS[id] = o.pass || 0;
  GLOW[id] = o.glow || 0;
  TOUCH[id] = SOLID[id] || o.touch ? 1 : 0;
  SOUND[id] = o.sound || 'stone';
  ITEM_OF[id] = id;
  return id;
}

DEFS.forEach(([key, name, top, side = top, bottom = side, o = {}]) => {
  const front = o.front ?? side;
  register(key, name, [side, front, top, bottom, side, front], o);
});
for (const k of ['PLANKS', 'LOG']) SOUND[B[k]] = 'wood';
for (const k of ['GRASS', 'TURF', 'LEAVES', 'SAKURA', 'CANOPY', 'TNT']) SOUND[B[k]] = 'grass';
for (const k of ['DIRT', 'FARMLAND', 'GRAVEL', 'RAIL']) SOUND[B[k]] = 'gravel';
for (const k of ['GLASS', 'GLASS_DARK', 'WINDOW', 'WINDOW_DARK', 'LAMP']) SOUND[B[k]] = 'glass';
SOUND[B.SAND] = 'sand';
SOUND[B.SNOW] = 'snow';

// ---------------------------------------------------------------- shapes

const HEADINGS = ['N', 'E', 'S', 'W'];
const FACE_OF = [5, 0, 4, 1]; // the face direction (as in TEX_DIR) that looks towards each heading
const unit = (b) => [b[0] / 16, b[1] / 16, b[2] / 16, b[3] / 16, b[4] / 16, b[5] / 16, b[6]];
// Boxes are written for a heading of north, in sixteenths, and turned clockwise from there.
const turn = ([x0, y0, z0, x1, y1, z1, t], f) => {
  for (let i = 0; i < f; i++) [x0, z0, x1, z1] = [16 - z1, x0, 16 - z0, x1];
  return [x0, y0, z0, x1, y1, z1, t];
};
const all = (layer) => [layer, layer, layer, layer, layer, layer];
const texOf = (id) => TEX_DIR.map((t) => t[id]);

// A shaped block: not opaque and casting no shade (its neighbours draw their faces towards it),
// and its faces never wear the street photo.
function shape(id, kind, boxes, tex, o = {}) {
  MODEL[id] = { boxes: boxes.map(unit), tex, sel: o.sel ? o.sel.map(unit) : null, byMask: null };
  for (let d = 0; d < 6; d++) TEX_DIR[d][id] = tex[d];
  TEX_TOP[id] = tex[2];
  TEX_SIDE[id] = tex[4];
  TEX_BOTTOM[id] = tex[3];
  KIND[id] = kind;
  OPAQUE[id] = 0;
  SHADE[id] = 0;
  SOLID[id] = o.solid === false ? 0 : 1;
  TOUCH[id] = 1;
  if (o.facing !== undefined) FACING[id] = o.facing;
  return id;
}
// A further number for an item that already has one: the same thing, another way round.
function variant(item, kind, boxes, tex, o = {}) {
  const id = register(null, '', tex, o);
  NAMES[id] = NAMES[item];
  ITEM_OF[id] = item;
  SOUND[id] = o.sound || SOUND[item];
  PASS[id] = o.pass ?? PASS[item];
  GLOW[id] = o.glow ?? GLOW[item];
  return kind ? shape(id, kind, boxes, tex, o) : id;
}
const mates = (a, b, dx, dy, dz) => {
  MATE[a] = [dx, dy, dz, b];
  MATE[b] = [-dx, -dy, -dz, a];
};

// ---- a furnace has a front: one number for each way it can look (the first looks south)
{
  const tex = (f) => {
    const t = [T.furnace_side, T.furnace_side, T.furnace_top, T.furnace_top, T.furnace_side, T.furnace_side];
    t[FACE_OF[f]] = T.furnace_front;
    return t;
  };
  const item = register('FURNACE', 'Furnace', tex(2));
  FACING[item] = 2;
  const ids = [0, 0, item, 0];
  for (const f of [3, 0, 1]) {
    ids[f] = variant(item, '', null, tex(f));
    FACING[ids[f]] = f;
  }
  PLACE[item] = { how: 'front', ids };
}

// ---- slabs and stairs of six materials
export const SLAB_OF = new Uint8Array(256); // the full block two slabs of a kind make
for (const [key, name, base] of [
  ['OAK', 'Oak', B.PLANKS], ['COBBLESTONE', 'Cobblestone', B.COBBLESTONE], ['STONE_BRICK', 'Stone brick', B.STONE_BRICKS],
  ['BRICK', 'Brick', B.BRICK], ['SANDSTONE', 'Sandstone', B.SANDSTONE], ['QUARTZ', 'Quartz', B.QUARTZ],
]) {
  const tex = texOf(base), o = { sound: SOUND[base] };
  const slab = register(`${key}_SLAB`, `${name} slab`, tex, o);
  shape(slab, 'slab', [[0, 0, 0, 16, 8, 16]], tex);
  const top = variant(slab, 'slab', [[0, 8, 0, 16, 16, 16]], tex);
  SLAB_OF[slab] = SLAB_OF[top] = base;
  PLACE[slab] = { how: 'slab', ids: [slab, top] };
  // the steps climb towards the heading: the high half lies on that side
  const steps = (f) => [[0, 0, 0, 16, 8, 16], [0, 8, 0, 16, 16, 8]].map((b) => turn(b, f));
  const stairs = register(`${key}_STAIRS`, `${name} stairs`, tex, o);
  shape(stairs, 'stairs', steps(0), tex, { facing: 0 });
  const ids = [stairs];
  for (let f = 1; f < 4; f++) ids.push(variant(stairs, 'stairs', steps(f), tex, { facing: f }));
  PLACE[stairs] = { how: 'away', ids };
}

// ---- doors: a leaf three texels thick along one edge of its cell, two cells high. Opening one
// swings it to the next edge round the hinge (north <-> east, south <-> west), so the edge it
// hangs on is all there is to know.
export const SWING = new Uint8Array(256); // a door or hatch as it is after a push
for (const [key, name, low, high, sound] of [['OAK', 'Oak', T.door_oak_bottom, T.door_oak_top, 'wood'], ['IRON', 'Iron', T.door_iron_bottom, T.door_iron_top, 'stone']]) {
  const leaf = (f) => [turn([0, 0, 0, 16, 16, 3], f)];
  const lower = [], upper = [];
  const item = register(`${key}_DOOR`, `${name} door`, all(low), { sound });
  for (let f = 0; f < 4; f++) {
    lower.push(f ? variant(item, 'door', leaf(f), all(low), { facing: f }) : shape(item, 'door', leaf(0), all(low), { facing: 0 }));
  }
  for (let f = 0; f < 4; f++) {
    upper.push(variant(item, 'door', leaf(f), all(high), { facing: f }));
    mates(lower[f], upper[f], 0, 1, 0);
  }
  for (let f = 0; f < 4; f++) {
    SWING[lower[f]] = lower[f ^ 1];
    SWING[upper[f]] = upper[f ^ 1];
  }
  PLACE[item] = { how: 'door', ids: lower, upper };
}

// ---- a hatch: lying in the bottom of its cell, or standing open against one side
{
  const tex = all(T.trapdoor);
  const item = register('TRAPDOOR', 'Oak trapdoor', tex, { sound: 'wood' });
  shape(item, 'trapdoor', [[0, 0, 0, 16, 3, 16]], tex);
  const open = [];
  for (let f = 0; f < 4; f++) open.push(variant(item, 'trapdoor', [turn([0, 0, 0, 16, 16, 3], f)], tex, { facing: f }));
  PLACE[item] = { how: 'plain', ids: [item], open };
}

// ---- fences and panes reach out to their neighbours: sixteen shapes each, by which of the four
// sides (1 north, 2 east, 4 south, 8 west) there is something to join
export const LINKS = new Uint8Array(256); // 1: a fence joins it, 2: a pane or bars join it
function joined(id, kind, post, arms, tex, lone) {
  const m = MODEL[shape(id, kind, post, tex)];
  m.byMask = [];
  for (let mask = 0; mask < 16; mask++) {
    const boxes = post.slice();
    for (let f = 0; f < 4; f++) {
      // standing alone, a pane is a cross: something of it shows from every side
      if (mask ? (mask >> f) & 1 : lone) for (const a of arms(f)) boxes.push(turn(a, f));
    }
    m.byMask.push(boxes.map(unit));
  }
}
{
  const tex = texOf(B.PLANKS);
  const fence = register('FENCE', 'Oak fence', tex, { sound: 'wood' });
  joined(fence, 'fence', [[6, 0, 6, 10, 16, 10]], () => [[7, 12, 0, 9, 15, 6], [7, 6, 0, 9, 9, 6]], tex, false);
  PLACE[fence] = { how: 'plain', ids: [fence] };

  // a pane shows its glass on the two broad faces of each arm and its edge on the rest
  const paneTex = (glass, edge) => (f) => (f % 2 ? [edge, edge, edge, edge, glass, glass] : [glass, glass, edge, edge, edge, edge]);
  for (const [key, name, glass, edge, o] of [
    ['GLASS_PANE', 'Glass pane', T.glass, T.pane_edge, { pass: 1, sound: 'glass' }],
    ['IRON_BARS', 'Iron bars', T.iron_bars, T.iron_bars, {}],
  ]) {
    const side = paneTex(glass, edge);
    const id = register(key, name, all(glass), o);
    joined(id, 'pane', [[7, 0, 7, 9, 16, 9, all(edge)]], (f) => [[7, 0, 0, 9, 16, 7, side(f)]], all(glass), true);
    PLACE[id] = { how: 'plain', ids: [id] };
  }
}

// ---- things that hang on a wall or stand on the floor
{
  const tex = all(T.ladder);
  const rung = (f) => [turn([0, 0, 1, 16, 16, 1], f)], grip = (f) => [turn([0, 0, 0, 16, 16, 2], f)];
  const item = register('LADDER', 'Ladder', tex, { sound: 'wood', solid: false });
  shape(item, 'ladder', rung(0), tex, { facing: 0, solid: false, sel: grip(0) });
  const ids = [item];
  for (let f = 1; f < 4; f++) ids.push(variant(item, 'ladder', rung(f), tex, { facing: f, solid: false, sel: grip(f) }));
  PLACE[item] = { how: 'wall', ids };
}
{
  const tex = [T.torch, T.torch, T.torch_top, T.torch, T.torch, T.torch];
  const o = { sound: 'wood', solid: false, glow: 2 };
  const item = register('TORCH', 'Torch', tex, o);
  shape(item, 'torch', [[7, 0, 7, 9, 10, 9]], tex, { solid: false, sel: [[6, 0, 6, 10, 11, 10]] });
  const wall = [];
  // on a wall: the same stick, upright against it
  const hung = [T.torch_wall, T.torch_wall, T.torch_top, T.torch_wall, T.torch_wall, T.torch_wall];
  for (let f = 0; f < 4; f++) wall.push(variant(item, 'torch', [turn([7, 3, 0, 9, 13, 2], f)], hung, { ...o, facing: f, sel: [turn([6, 2, 0, 10, 14, 3], f)] }));
  PLACE[item] = { how: 'torch', ids: [item], wall };
}
export const CARPET = [];
for (const [key, name] of COLOURS) {
  const tex = all(T[`wool_${key.toLowerCase()}`]);
  const id = register(`CARPET_${key}`, `${name} carpet`, tex, { sound: 'grass', solid: false });
  shape(id, 'carpet', [[0, 0, 0, 16, 1, 16]], tex, { solid: false });
  PLACE[id] = { how: 'plain', ids: [id] };
  CARPET.push(id);
}

// ---- the bed: two cells, the foot where it is put down and the head beyond it
{
  const AB = ['a', 'b', 'b', 'a']; // which way round the pictures of the long sides lie, by heading
  const tex = (part, f) => {
    const side = T[`bed_side_${part}_${AB[f]}`], end = T[`bed_end_${part}`];
    const t = [side, side, part === 'head' ? T[`bed_top_head_${HEADINGS[f].toLowerCase()}`] : T.bed_top_foot, T.bed_bottom, side, side];
    t[FACE_OF[f]] = t[FACE_OF[(f + 2) % 4]] = end;
    return t;
  };
  const foot = (f) => [[0, 3, 0, 16, 9, 16], [0, 0, 13, 3, 3, 16], [13, 0, 13, 16, 3, 16]].map((b) => turn(b, f));
  const head = (f) => [[0, 3, 0, 16, 9, 16], [0, 0, 0, 3, 3, 3], [13, 0, 0, 16, 3, 3]].map((b) => turn(b, f));
  const feet = [shape(B.BED, 'bed', foot(0), tex('foot', 0), { facing: 0 })];
  for (let f = 1; f < 4; f++) feet.push(variant(B.BED, 'bed', foot(f), tex('foot', f), { facing: f }));
  const heads = [];
  for (let f = 0; f < 4; f++) {
    heads.push(variant(B.BED, 'bed', head(f), tex('head', f), { facing: f }));
    mates(feet[f], heads[f], DX[f], 0, DZ[f]);
  }
  PLACE[B.BED] = { how: 'bed', ids: feet, heads };
}

// ---- the chest: a little smaller than its cell, the latch on the side it faces
{
  const tex = (f) => {
    const t = [T.chest_side, T.chest_side, T.chest_top, T.chest_bottom, T.chest_side, T.chest_side];
    t[FACE_OF[f]] = T.chest_front;
    return t;
  };
  const boxes = (f) => [[1, 0, 1, 15, 14, 15], [7, 7, 0, 9, 11, 1]].map((b) => turn(b, f));
  const sel = [[1, 0, 1, 15, 14, 15]];
  const ids = [0, 0, shape(B.CHEST, 'chest', boxes(2), tex(2), { facing: 2, sel }), 0];
  for (const f of [3, 0, 1]) ids[f] = variant(B.CHEST, 'chest', boxes(f), tex(f), { facing: f, sel });
  PLACE[B.CHEST] = { how: 'front', ids };
}

export const BLOCK_COUNT = count;

for (let id = 0; id < 256; id++) {
  if (KIND[id] === 'fence') LINKS[id] |= 1;
  else if (KIND[id] === 'pane') LINKS[id] |= 2;
  else if (id < count && SOLID[id] && !MODEL[id] && id !== B.LEAVES && id !== B.SAKURA) LINKS[id] |= 3;
}
// glass joins glass: a pane runs on into a window
for (const k of ['GLASS', 'GLASS_DARK', 'ICE']) LINKS[B[k]] |= 2;

// The boxes of a shaped block, given its four neighbours (north, east, south, west): a fence or
// a pane grows an arm towards each one it can join.
export function boxesOf(id, n, e, s, w) {
  const m = MODEL[id];
  if (!m.byMask) return m.boxes;
  const bit = KIND[id] === 'fence' ? 1 : 2;
  return m.byMask[(LINKS[n] & bit ? 1 : 0) | (LINKS[e] & bit ? 2 : 0) | (LINKS[s] & bit ? 4 : 0) | (LINKS[w] & bit ? 8 : 0)];
}

// What an explosion leaves standing.
export const BLASTPROOF = new Set([B.BEDROCK, B.OBSIDIAN, B.PORTAL, B.WATER, B.LAVA]);

// Blocks offered in the creative inventory, in display order.
export const PALETTE = [
  B.GRASS, B.DIRT, B.STONE, B.COBBLESTONE, B.MOSSY_COBBLESTONE, B.STONE_BRICKS, B.MOSSY_STONE_BRICKS, B.SMOOTH_STONE, B.ANDESITE,
  B.DIORITE, B.GRANITE, B.DEEPSLATE, B.SAND, B.SANDSTONE, B.GRAVEL, B.CLAY, B.CONCRETE, B.CONCRETE_DARK,
  B.WHITE_TILE, B.BEIGE_TILE, B.BRICK, B.BROWN_TILE, B.BLUE_PANEL, B.PLASTER, B.TERRACOTTA, B.QUARTZ, B.STEEL,
  B.GLASS, B.GLASS_DARK, B.GLASS_PANE, B.IRON_BARS, B.ICE, B.PLANKS, B.SPRUCE_PLANKS, B.BIRCH_PLANKS, B.DARK_OAK_PLANKS,
  B.LOG, B.LEAVES, B.SAKURA, B.BOOKSHELF, B.HAY, B.PUMPKIN, B.MELON, B.FLOOR, B.PAVEMENT,
  B.PAVING, B.ASPHALT, B.ROAD_LINE, B.ROOF_GRAY, B.ROOF_KAWARA, B.ROOF_BLUE, B.ROOF_BROWN, B.COPPER, B.VERMILION,
  B.OAK_SLAB, B.OAK_STAIRS, B.COBBLESTONE_SLAB, B.COBBLESTONE_STAIRS, B.STONE_BRICK_SLAB, B.STONE_BRICK_STAIRS, B.BRICK_SLAB, B.BRICK_STAIRS, B.SANDSTONE_SLAB,
  B.SANDSTONE_STAIRS, B.QUARTZ_SLAB, B.QUARTZ_STAIRS, B.FENCE, B.OAK_DOOR, B.IRON_DOOR, B.TRAPDOOR, B.LADDER, B.TORCH,
  B.LAMP, B.SEA_LANTERN, B.CRAFTING_TABLE, B.FURNACE, B.TURF, B.FARMLAND, B.SNOW, B.WATER,
  B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.REDSTONE_ORE, B.LAPIS_ORE, B.EMERALD_ORE, B.DIAMOND_ORE,
  B.COAL_BLOCK, B.GOLD_BLOCK, B.REDSTONE_BLOCK, B.LAPIS_BLOCK, B.EMERALD_BLOCK, B.DIAMOND_BLOCK,
  ...COLOURS.map(([key]) => B[`WOOL_${key}`]), ...CARPET,
  B.OBSIDIAN, B.NETHERRACK, B.SOUL_SAND, B.GLOWSTONE, B.NETHER_BRICKS, B.LAVA,
  B.FILL,
  B.MAGMA, B.QUARTZ_ORE, B.NETHER_GOLD_ORE, B.BASALT, B.BLACKSTONE, B.SOUL_SOIL, B.CRIMSON_NYLIUM, B.WARPED_NYLIUM,
  B.CRIMSON_STEM, B.WARPED_STEM, B.NETHER_WART, B.WARPED_WART, B.SHROOMLIGHT,
];

export const DEFAULT_HOTBAR = [
  B.CONCRETE, B.GLASS, B.BRICK, B.PLANKS, B.GRASS, B.SAKURA, B.VERMILION, B.ROOF_KAWARA, B.LAMP,
];
