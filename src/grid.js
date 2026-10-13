// Which way do the streets run? Blocks laid out north-up cut every street of a city that was not
// built north-up into a staircase, and whatever the player builds stands askew to the houses.
// So the block grid is turned to the streets around the starting point: the street map of the
// neighbourhood is read once, and the direction its streets share (taking a street and the ones
// crossing it at right angles as the same direction) becomes the grid's.
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { URLS } from './config.js';
import { lonLatToMerc, EARTH_C } from './geo.js';

const ZOOM = 14;
// How far to look, and how much the streets within that range must agree. A planned city agrees
// over the whole neighbourhood; in an old town only the street one stands in and its side
// streets do, so the look narrows until something clear turns up. [metres, agreement 0..1]
const RANGES = [[140, 0.45], [70, 0.4], [40, 0.3]];
const STREETS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'busway']);
const TURN_KEY = 'geocrafter:turn:v1:';
export const ALIGN_KEY = 'geocrafter:align'; // '0' = keep the grid north-up

// Compass bearing (degrees, -45..45) for the grid's -z axis at a place; 0 if the streets have
// no common direction or the map cannot be read. Remembered per place: the player's blocks are
// stored in grid coordinates, so the grid must never come out differently for the same place.
export async function gridTurn(lon, lat) {
  if (localStorage.getItem(ALIGN_KEY) === '0') return 0;
  const key = `${TURN_KEY}${lat.toFixed(5)},${lon.toFixed(5)}`;
  const saved = localStorage.getItem(key);
  if (saved !== null && Number.isFinite(+saved)) return +saved;
  let turn = 0;
  try {
    turn = await streetBearing(lon, lat);
  } catch (e) {
    return 0; // not remembered: asked again next time
  }
  localStorage.setItem(key, turn);
  return turn;
}

export async function streetBearing(lon, lat) {
  const template = (await (await fetch(URLS.osmTileJson)).json()).tiles[0];
  const n = 2 ** ZOOM;
  const [mx, my] = lonLatToMerc(lon, lat);
  const fx = mx * n, fy = my * n;
  const tx = Math.floor(fx), ty = Math.floor(fy);
  // the tile under the place, and the ones beside it if the place is near its edge
  const tiles = [[tx, ty]];
  const sx = fx - tx < 0.25 ? -1 : fx - tx > 0.75 ? 1 : 0, sy = fy - ty < 0.25 ? -1 : fy - ty > 0.75 ? 1 : 0;
  if (sx) tiles.push([tx + sx, ty]);
  if (sy) tiles.push([tx, ty + sy]);
  if (sx && sy) tiles.push([tx + sx, ty + sy]);
  const metres = (EARTH_C * Math.cos((lat * Math.PI) / 180)) / n; // across one tile
  const sums = RANGES.map(() => [0, 0, 0]); // cos, sin, weight
  await Promise.all(tiles.map(async ([x, y]) => {
    const res = await fetch(template.replace('{z}', ZOOM).replace('{x}', x).replace('{y}', y));
    if (!res.ok) return;
    const layer = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer()))).layers.transportation;
    if (!layer) return;
    const unit = metres / layer.extent;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const p = f.properties;
      if (f.type !== 2 || !STREETS.has(p.class) || p.brunnel === 'tunnel') continue;
      for (const line of f.loadGeometry()) {
        for (let k = 1; k < line.length; k++) {
          // metres east and south of the place
          const ax = (x - fx) * metres + line[k - 1].x * unit, ay = (y - fy) * metres + line[k - 1].y * unit;
          const bx = (x - fx) * metres + line[k].x * unit, by = (y - fy) * metres + line[k].y * unit;
          const len = Math.hypot(bx - ax, by - ay);
          if (len < 1) continue;
          const far = Math.hypot((ax + bx) / 2, (ay + by) / 2);
          // four times the bearing: a street, the same street the other way and its cross streets all agree
          const a4 = 4 * Math.atan2(bx - ax, ay - by);
          RANGES.forEach(([near], r) => {
            const w = len * Math.exp(-far / near); // streets this close count fully, farther ones less and less
            sums[r][0] += w * Math.cos(a4);
            sums[r][1] += w * Math.sin(a4);
            sums[r][2] += w;
          });
        }
      }
    }
  }));
  for (let r = 0; r < RANGES.length; r++) {
    const [c, sn, total] = sums[r];
    if (total < 40 || Math.hypot(c, sn) < total * RANGES[r][1]) continue; // no streets here, or every which way
    const turn = Math.round(((Math.atan2(sn, c) / 4) * 180 / Math.PI) * 10) / 10;
    return Math.abs(turn) < 1.5 ? 0 : turn;
  }
  return 0;
}
