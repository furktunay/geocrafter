// Facade styles, named by texture so both the texture builder and the generator can use them.
// curtain = glass wall with thin mullions, otherwise punched windows (period / win in blocks).
const TOWERS = [
  { wall: 'steel', glass: 'glass', roof: 'roof_gray', fh: 4, curtain: true },
  { wall: 'steel', glass: 'glass_dark', roof: 'roof_gray', fh: 4, curtain: true },
  { wall: 'concrete_dark', glass: 'glass', roof: 'roof_gray', fh: 4, curtain: true },
  { wall: 'concrete', glass: 'glass_dark', roof: 'roof_gray', fh: 4, period: 3, win: 2 },
  { wall: 'white_tile', glass: 'glass', roof: 'roof_gray', fh: 4, period: 3, win: 2 },
  { wall: 'beige_tile', glass: 'glass_dark', roof: 'roof_gray', fh: 4, period: 4, win: 3 },
];
const MIDRISE = [
  { wall: 'concrete', glass: 'glass', roof: 'roof_gray', fh: 4, period: 3, win: 2 },
  { wall: 'white_tile', glass: 'glass_dark', roof: 'roof_gray', fh: 4, period: 4, win: 2 },
  { wall: 'beige_tile', glass: 'glass', roof: 'roof_gray', fh: 4, period: 3, win: 2 },
  { wall: 'brick', glass: 'glass', roof: 'roof_gray', fh: 4, period: 4, win: 2 },
  { wall: 'brown_tile', glass: 'glass_dark', roof: 'roof_gray', fh: 4, period: 3, win: 2 },
  { wall: 'concrete_dark', glass: 'glass', roof: 'roof_gray', fh: 4, period: 2, win: 1 },
  { wall: 'blue_panel', glass: 'glass', roof: 'roof_gray', fh: 4, period: 4, win: 3 },
  { wall: 'white_tile', glass: 'glass', roof: 'roof_gray', fh: 4, period: 2, win: 1 },
  { wall: 'steel', glass: 'glass', roof: 'roof_gray', fh: 4, curtain: true },
];
const LOWRISE = [
  { wall: 'plaster', glass: 'glass', roof: 'roof_kawara', fh: 3, period: 4, win: 2 },
  { wall: 'white_tile', glass: 'glass', roof: 'roof_gray', fh: 3, period: 4, win: 2 },
  { wall: 'beige_tile', glass: 'glass', roof: 'roof_brown', fh: 3, period: 4, win: 2 },
  { wall: 'planks', glass: 'glass', roof: 'roof_kawara', fh: 3, period: 4, win: 2 },
  { wall: 'concrete', glass: 'glass_dark', roof: 'roof_gray', fh: 3, period: 3, win: 2 },
  { wall: 'plaster', glass: 'glass', roof: 'roof_blue', fh: 3, period: 4, win: 2 },
  { wall: 'brown_tile', glass: 'glass', roof: 'roof_kawara', fh: 3, period: 4, win: 2 },
  { wall: 'white_tile', glass: 'glass', roof: 'roof_kawara', fh: 3, period: 3, win: 1 },
];

export const STYLE_SETS = { TOWERS, MIDRISE, LOWRISE };
export const STYLES = [...TOWERS, ...MIDRISE, ...LOWRISE];
STYLES.forEach((s, i) => (s.index = i));

export function styleForBuilding(height, hash) {
  const set = height >= 60 ? TOWERS : height >= 12 ? MIDRISE : LOWRISE;
  return set[(hash >>> 4) % set.length];
}
