import { T } from './textures.js';

// [key, Turkish display name, top, side, bottom, options]
// options: pass 0 = opaque mesh (cutout allowed), 1 = translucent mesh
//          solid (collision), opaque (hides neighbour faces), shade (blocks sky light / casts AO)
//          glow: 1 = window that lights up at night, 2 = always emissive
const DEFS = [
  ['AIR', 'Hava', 0, 0, 0, { solid: false, opaque: false, shade: false }],
  ['STONE', 'Taş', T.stone],
  ['DIRT', 'Toprak', T.dirt],
  ['GRASS', 'Çim', T.grass_top, T.grass_side, T.dirt],
  ['SAND', 'Kum', T.sand],
  ['GRAVEL', 'Çakıl', T.gravel],
  ['WATER', 'Su', T.water, T.water, T.water, { pass: 1, solid: false, opaque: false, shade: false }],
  ['ASPHALT', 'Asfalt', T.asphalt],
  ['ROAD_LINE', 'Yol çizgisi', T.road_line, T.asphalt, T.asphalt],
  ['PAVEMENT', 'Kaldırım', T.pavement],
  ['PAVING', 'Parke taşı', T.paving],
  ['CONCRETE', 'Beton', T.concrete],
  ['CONCRETE_DARK', 'Koyu beton', T.concrete_dark],
  ['WHITE_TILE', 'Beyaz karo', T.white_tile],
  ['BRICK', 'Tuğla', T.brick],
  ['BEIGE_TILE', 'Bej karo', T.beige_tile],
  ['STEEL', 'Çelik', T.steel],
  ['GLASS', 'Cam', T.glass, T.glass, T.glass, { pass: 1, opaque: false, shade: false, glow: 1 }],
  ['GLASS_DARK', 'Füme cam', T.glass_dark, T.glass_dark, T.glass_dark, { pass: 1, opaque: false, shade: false, glow: 1 }],
  ['ROOF_GRAY', 'Çatı betonu', T.roof_gray],
  ['ROOF_KAWARA', 'Kawara kiremit', T.roof_kawara],
  ['ROOF_BLUE', 'Mavi kiremit', T.roof_blue],
  ['ROOF_BROWN', 'Kahverengi kiremit', T.roof_brown],
  ['PLASTER', 'Sıva', T.plaster],
  ['PLANKS', 'Tahta', T.planks],
  ['LOG', 'Kütük', T.log_top, T.log_side, T.log_top],
  ['LEAVES', 'Yaprak', T.leaves, T.leaves, T.leaves, { opaque: false }],
  ['SAKURA', 'Sakura', T.sakura, T.sakura, T.sakura, { opaque: false }],
  ['FLOOR', 'Zemin karosu', T.floor],
  ['RAIL', 'Ray', T.rail, T.gravel, T.gravel],
  ['BEDROCK', 'Ana kaya', T.bedrock],
  ['FARMLAND', 'Tarla', T.farmland, T.dirt, T.dirt],
  ['TURF', 'Saha çimi', T.turf, T.dirt, T.dirt],
  ['BLUE_PANEL', 'Mavi panel', T.blue_panel],
  ['BROWN_TILE', 'Kahve karo', T.brown_tile],
  ['VERMILION', 'Torii kırmızısı', T.vermilion],
  ['LAMP', 'Lamba', T.lamp, T.lamp, T.lamp, { glow: 2 }],
  ['COPPER', 'Bakır çatı', T.copper],
  ['SNOW', 'Kar', T.snow],
  ['DECK', 'Viyadük', T.asphalt, T.concrete, T.concrete],
  ['DECK_LINE', 'Viyadük çizgisi', T.road_line, T.concrete, T.concrete],
  ['DECK_RAIL', 'Demiryolu viyadüğü', T.gravel, T.concrete, T.concrete],
  ['DECK_TRACK', 'Viyadük rayı', T.rail, T.concrete, T.concrete],
  ['WINDOW', 'Pencere', T.window, T.window, T.window, { glow: 1 }],
  ['WINDOW_DARK', 'Füme pencere', T.window_dark, T.window_dark, T.window_dark, { glow: 1 }],
  ['CANOPY', 'Ağaç tacı', T.canopy],
  ['TNT', 'TNT', T.tnt_top, T.tnt_side, T.tnt_bottom],
];

export const B = {};
export const BLOCK_COUNT = DEFS.length;
export const NAMES = [];
export const TEX_TOP = new Uint8Array(256);
export const TEX_SIDE = new Uint8Array(256);
export const TEX_BOTTOM = new Uint8Array(256);
export const SOLID = new Uint8Array(256);
export const OPAQUE = new Uint8Array(256);
export const SHADE = new Uint8Array(256);
export const PASS = new Uint8Array(256);
export const GLOW = new Uint8Array(256);

DEFS.forEach(([key, name, top, side = top, bottom = side, o = {}], id) => {
  B[key] = id;
  NAMES[id] = name;
  TEX_TOP[id] = top;
  TEX_SIDE[id] = side;
  TEX_BOTTOM[id] = bottom;
  SOLID[id] = o.solid === false ? 0 : 1;
  OPAQUE[id] = o.opaque === false ? 0 : 1;
  SHADE[id] = o.shade === false ? 0 : 1;
  PASS[id] = o.pass || 0;
  GLOW[id] = o.glow || 0;
});

// Blocks offered in the creative inventory, in display order.
export const PALETTE = [
  B.GRASS, B.DIRT, B.STONE, B.SAND, B.GRAVEL, B.CONCRETE, B.CONCRETE_DARK, B.WHITE_TILE, B.BEIGE_TILE,
  B.BRICK, B.BROWN_TILE, B.BLUE_PANEL, B.PLASTER, B.STEEL, B.GLASS, B.GLASS_DARK, B.PLANKS, B.LOG,
  B.LEAVES, B.SAKURA, B.FLOOR, B.PAVEMENT, B.PAVING, B.ASPHALT, B.ROAD_LINE, B.ROOF_GRAY, B.ROOF_KAWARA,
  B.ROOF_BLUE, B.ROOF_BROWN, B.COPPER, B.VERMILION, B.LAMP, B.TURF, B.FARMLAND, B.SNOW, B.WATER,
];

export const DEFAULT_HOTBAR = [
  B.CONCRETE, B.GLASS, B.BRICK, B.PLANKS, B.GRASS, B.SAKURA, B.VERMILION, B.ROOF_KAWARA, B.LAMP,
];
