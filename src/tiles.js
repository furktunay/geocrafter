// Worker-side map data: elevation, PLATEAU buildings and OpenStreetMap ground features.
// Everything is converted to block coordinates on load and indexed per chunk.
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { URLS, CHUNK, MARGIN, SEA_Y, MAX_Y, chunkKey } from './config.js';
import { ringsBBox, ringsArea, pointInRings } from './raster.js';

export const SURF = {
  NONE: 0, GRASS: 1, FOREST: 2, SAND: 3, FARM: 4, WATER: 5, ROAD: 6, PATH: 7, RAIL: 8, TURF: 9,
  PLAZA: 10, ROCK: 11, OCEAN: 12, SNOW: 13,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tileUrl = (tpl, z, x, y) => tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y);

export const stats = { loading: 0, failed: 0, decodeMs: 0 };

let stampCounter = 0;
export const nextStamp = () => ++stampCounter;

// Gathers every indexed feature touching a block-space box, once each (features carry a `seen` stamp).
function collectIndexed(tile, x0, z0, x1, z1, stamp, lists, out) {
  const cx0 = Math.floor(x0 / CHUNK), cx1 = Math.floor(x1 / CHUNK);
  const cz0 = Math.floor(z0 / CHUNK), cz1 = Math.floor(z1 / CHUNK);
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const e = tile.index.get(chunkKey(cx, cz));
      if (!e) continue;
      for (const name of lists) {
        for (const f of e[name]) {
          if (f.seen === stamp) continue;
          f.seen = stamp;
          out[name].push(f);
        }
      }
    }
  }
}

// null = tile does not exist (or could not be fetched after retries)
async function fetchBuffer(url) {
  stats.loading++;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await fetch(url);
        if (r.status === 404 || r.status === 403 || r.status === 204) return null;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.arrayBuffer();
      } catch (e) {
        if (attempt >= 2) {
          stats.failed++;
          console.warn('tile failed', url, e.message);
          return null;
        }
        await sleep(500 * (attempt + 1));
      }
    }
  } finally {
    stats.loading--;
  }
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Promise-caching tile store.
class TileStore {
  constructor() {
    this.tiles = new Map();
    this.pending = new Map();
  }

  get(tx, ty) {
    return this.tiles.get(tx * 131072 + ty);
  }

  load(tx, ty) {
    const key = tx * 131072 + ty;
    let p = this.pending.get(key);
    if (!p) {
      p = this.fetchTile(tx, ty).then((t) => {
        this.tiles.set(key, t);
        return t;
      });
      this.pending.set(key, p);
    }
    return p;
  }

  ensure(proj, minx, minz, maxx, maxz) {
    const r = proj.tileRange(this.zoom, minx, minz, maxx, maxz);
    const jobs = [];
    for (let ty = r.ty0; ty <= r.ty1; ty++) for (let tx = r.tx0; tx <= r.tx1; tx++) jobs.push(this.load(tx, ty));
    return Promise.all(jobs);
  }
}

// ---------------------------------------------------------------- elevation

let pngCanvas = null;
async function decodePng(buf) {
  const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  if (!pngCanvas) pngCanvas = new OffscreenCanvas(256, 256).getContext('2d', { willReadFrequently: true });
  pngCanvas.clearRect(0, 0, 256, 256);
  pngCanvas.drawImage(bmp, 0, 0);
  bmp.close();
  return pngCanvas.getImageData(0, 0, 256, 256).data;
}

function decodeGsi(px) {
  const out = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) {
    const v = px[i * 4] * 65536 + px[i * 4 + 1] * 256 + px[i * 4 + 2];
    out[i] = px[i * 4 + 3] === 0 || v === 8388608 ? NaN : v < 8388608 ? v * 0.01 : (v - 16777216) * 0.01;
  }
  return out;
}

export class Terrain extends TileStore {
  constructor(proj, japan) {
    super();
    this.proj = proj;
    this.japan = japan;
    this.zoom = japan ? 15 : 13;
    this.coarse = new Map(); // GSI 10 m tiles (z14) used to fill holes in the 5 m data
    this.offset = 0;
  }

  async fetchTile(tx, ty) {
    if (!this.japan) {
      const buf = await fetchBuffer(tileUrl(URLS.terrarium, this.zoom, tx, ty));
      const out = new Float32Array(65536);
      if (buf) {
        const px = await decodePng(buf);
        for (let i = 0; i < 65536; i++) {
          out[i] = Math.max(-3, px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768);
        }
      }
      return out;
    }
    const buf = await fetchBuffer(tileUrl(URLS.gsiDem5a, 15, tx, ty));
    const out = buf ? decodeGsi(await decodePng(buf)) : new Float32Array(65536).fill(NaN);
    let holes = false;
    for (let i = 0; i < 65536 && !holes; i++) holes = out[i] !== out[i];
    if (holes) {
      const ck = (tx >> 1) * 131072 + (ty >> 1);
      let cp = this.coarse.get(ck);
      if (!cp) {
        cp = fetchBuffer(tileUrl(URLS.gsiDem10, 14, tx >> 1, ty >> 1)).then(async (b) => (b ? decodeGsi(await decodePng(b)) : null));
        this.coarse.set(ck, cp);
      }
      const c = await cp;
      const cx = (tx & 1) * 128, cy = (ty & 1) * 128;
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const i = y * 256 + x;
          if (out[i] !== out[i]) {
            const v = c ? c[(cy + (y >> 1)) * 256 + cx + (x >> 1)] : 0;
            out[i] = v === v ? v : 0;
          }
        }
      }
    }
    return out;
  }

  ensureBox(minx, minz, maxx, maxz) {
    const pad = 3 / (2 ** this.zoom * 256 * this.proj.k); // a few pixels for bilinear taps
    return this.ensure(this.proj, minx - pad, minz - pad, maxx + pad, maxz + pad);
  }

  px(gx, gy) {
    const t = this.get(gx >> 8, gy >> 8);
    return t ? t[(gy & 255) * 256 + (gx & 255)] : 0;
  }

  // Bilinear elevation in metres at a block position (tiles must be loaded).
  elevAt(bx, bz) {
    const n = 2 ** this.zoom * 256;
    const p = this.proj;
    const gx = (p.mx0 + (bx * p.c - bz * p.s) * p.k) * n - 0.5;
    const gy = (p.my0 + (bx * p.s + bz * p.c) * p.k) * n - 0.5;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const a = this.px(x0, y0), b = this.px(x0 + 1, y0), c = this.px(x0, y0 + 1), d = this.px(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  yOf(elev) {
    const y = Math.round(elev - this.offset) + SEA_Y;
    return y < 6 ? 6 : y > MAX_Y - 80 ? MAX_Y - 80 : y;
  }

  // Block row of the ground at a block position.
  groundY(bx, bz) {
    return this.yOf(this.elevAt(bx, bz));
  }

  // World height of the ground surface (top face of that row).
  trueY(elev) {
    return this.yOf(elev) + 1;
  }
}

// ---------------------------------------------------------------- vector helpers

function decodeTile(buf) {
  return new VectorTile(new PbfReader(new Uint8Array(buf)));
}

// Tile coordinates -> blocks (the block grid may be turned against the tiles, see Projection).
function toRings(feature, frame, extent) {
  const ux = frame.ux / extent, uz = frame.uz / extent, vx = frame.vx / extent, vz = frame.vz / extent;
  return feature.loadGeometry().map((ring) => {
    const out = new Float32Array(ring.length * 2);
    for (let i = 0; i < ring.length; i++) {
      out[i * 2] = frame.x0 + ring[i].x * ux + ring[i].y * vx;
      out[i * 2 + 1] = frame.z0 + ring[i].x * uz + ring[i].y * vz;
    }
    return out;
  });
}

export function addToIndex(index, bbox, pad, list, item) {
  const cx0 = Math.floor((bbox[0] - pad) / CHUNK), cx1 = Math.floor((bbox[2] + pad) / CHUNK);
  const cz0 = Math.floor((bbox[1] - pad) / CHUNK), cz1 = Math.floor((bbox[3] + pad) / CHUNK);
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const key = chunkKey(cx, cz);
      let e = index.get(key);
      if (!e) index.set(key, (e = { polys: [], segs: [], roofs: [], foots: [] }));
      e[list].push(item);
    }
  }
}

// Shared per-building record. A building clipped into two tiles resolves to one record.
function buildingInfo(registry, terrain, id, rings, height, attrs) {
  let info = registry.get(id);
  if (!info) {
    let base = Infinity;
    for (const ring of terrain.lidar ? [] : rings) {
      for (let k = 0; k < ring.length; k += 2) {
        const y = terrain.groundY(ring[k], ring[k + 1]);
        if (y < base) base = y;
      }
    }
    info = { id, hash: hashString(id), height, baseY: base === Infinity ? terrain.yOf(0) : base, area: 0, attrs, style: null, stamp: 0, li: 0 };
    registry.set(id, info);
  }
  info.area = Math.max(info.area, ringsArea(rings));
  return info;
}

function queryFoots(store, proj, x, z) {
  const r = proj.tileRange(store.zoom, x, z, x, z);
  const tile = store.get(r.tx0, r.ty0);
  const e = tile && tile.index.get(chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
  if (!e) return null;
  for (const f of e.foots) if (pointInRings(f.rings, x, z)) return f.info;
  return null;
}

// ---------------------------------------------------------------- PLATEAU buildings

export class PlateauSource extends TileStore {
  constructor(proj, terrain) {
    super();
    this.proj = proj;
    this.terrain = terrain;
    this.zoom = 16;
    this.registry = new Map();
  }

  async fetchTile(tx, ty) {
    const [roofBuf, footBuf] = await Promise.all([
      fetchBuffer(tileUrl(URLS.plateauRoofs, 16, tx, ty)),
      fetchBuffer(tileUrl(URLS.plateauFootprints, 16, tx, ty)),
    ]);
    if (!roofBuf && !footBuf) return null;
    const frame = this.proj.tileFrame(16, tx, ty);
    await this.terrain.ensureBox(frame.minx - 48, frame.minz - 48, frame.maxx + 48, frame.maxz + 48);
    const t0 = performance.now();
    const tile = { index: new Map(), count: 0, hasRoofs: false };

    const footLayer = footBuf && decodeTile(footBuf).layers.bldg;
    if (footLayer) {
      for (let i = 0; i < footLayer.length; i++) {
        const f = footLayer.feature(i);
        if (f.type !== 3) continue;
        const rings = toRings(f, frame, footLayer.extent);
        const p = f.properties;
        const id = p['建物ID'] || `p${tx}/${ty}/${i}`;
        const info = buildingInfo(this.registry, this.terrain, id, rings, +p.measuredHeight || 0, { source: 'PLATEAU' });
        const bbox = ringsBBox(rings);
        addToIndex(tile.index, bbox, MARGIN, 'foots', { rings, bbox, info });
        tile.count++;
      }
    }
    const roofLayer = roofBuf && decodeTile(roofBuf).layers.bldg;
    if (roofLayer) {
      for (let i = 0; i < roofLayer.length; i++) {
        const f = roofLayer.feature(i);
        if (f.type !== 3) continue;
        const rings = toRings(f, frame, roofLayer.extent);
        const bbox = ringsBBox(rings);
        addToIndex(tile.index, bbox, MARGIN, 'roofs', { rings, bbox, z: +f.properties.z || 0 });
      }
      if (!footLayer) tile.count = roofLayer.length;
      tile.hasRoofs = true;
    }
    stats.decodeMs += performance.now() - t0;
    return tile;
  }

  ensureBox(minx, minz, maxx, maxz) {
    return this.enabled === false ? Promise.resolve() : this.ensure(this.proj, minx, minz, maxx, maxz);
  }

  // Appends this chunk's features to `out`. Returns { covered, urban }.
  collect(cx, cz, out) {
    const x0 = cx * CHUNK - MARGIN, z0 = cz * CHUNK - MARGIN;
    const r = this.proj.tileRange(16, x0, z0, x0 + CHUNK + 2 * MARGIN, z0 + CHUNK + 2 * MARGIN);
    const key = chunkKey(cx, cz);
    let covered = false, urban = false, roofs = false;
    for (let ty = r.ty0; ty <= r.ty1; ty++) {
      for (let tx = r.tx0; tx <= r.tx1; tx++) {
        const tile = this.get(tx, ty);
        if (!tile) continue;
        covered = true;
        if (tile.count >= 40) urban = true;
        if (tile.hasRoofs) roofs = true;
        const e = tile.index.get(key);
        if (!e) continue;
        for (const f of e.foots) out.foots.push(f);
        for (const f of e.roofs) out.roofs.push(f);
      }
    }
    return { covered, urban, roofs };
  }

  collectArea(x0, z0, x1, z1, out, stamp) {
    const r = this.proj.tileRange(16, x0, z0, x1, z1);
    let covered = false, urban = false, roofs = false;
    for (let ty = r.ty0; ty <= r.ty1; ty++) {
      for (let tx = r.tx0; tx <= r.tx1; tx++) {
        const tile = this.get(tx, ty);
        if (!tile) continue;
        covered = true;
        if (tile.count >= 40) urban = true;
        if (tile.hasRoofs) roofs = true;
        collectIndexed(tile, x0, z0, x1, z1, stamp, ['foots', 'roofs'], out);
      }
    }
    return { covered, urban, roofs };
  }

  query(x, z) {
    return queryFoots(this, this.proj, x, z);
  }
}

// ---------------------------------------------------------------- OpenStreetMap

const LANDCOVER = { wood: SURF.FOREST, grass: SURF.GRASS, sand: SURF.SAND, farmland: SURF.FARM, ice: SURF.SNOW, rock: SURF.ROCK, wetland: SURF.GRASS };
const LANDUSE = { pitch: SURF.TURF, track: SURF.PATH, playground: SURF.SAND, cemetery: SURF.GRASS, park: SURF.GRASS };
const WATERWAY = { river: 5, canal: 4, stream: 1.5, ditch: 1, drain: 1 };
// class -> [half width, surface, centre line]
const ROADS = {
  motorway: [7, SURF.ROAD, 1], trunk: [7, SURF.ROAD, 1], primary: [6, SURF.ROAD, 1], secondary: [5, SURF.ROAD, 1],
  tertiary: [4, SURF.ROAD, 1], minor: [3, SURF.ROAD, 0], service: [2, SURF.ROAD, 0], track: [1.5, SURF.PATH, 0],
  path: [1.2, SURF.PATH, 0], raceway: [4, SURF.ROAD, 0], busway: [3, SURF.ROAD, 0], rail: [2.4, SURF.RAIL, 1],
  transit: [2.4, SURF.RAIL, 1],
};

export class OsmSource extends TileStore {
  constructor(proj, terrain, onPlaces) {
    super();
    this.proj = proj;
    this.terrain = terrain;
    this.zoom = 14;
    this.registry = new Map();
    this.onPlaces = onPlaces;
    this.template = null;
  }

  async init() {
    try {
      const r = await fetch(URLS.osmTileJson);
      this.template = (await r.json()).tiles[0];
    } catch (e) {
      console.warn('OpenFreeMap unavailable', e.message);
    }
  }

  async fetchTile(tx, ty) {
    if (!this.template) return null;
    const buf = await fetchBuffer(tileUrl(this.template, 14, tx, ty));
    if (!buf) return null;
    const frame = this.proj.tileFrame(14, tx, ty);
    // elevation tiles are only needed here for building bases and bridge decks; a laser-scanned
    // terrain supplies both per cell later, so it is not loaded for the whole map tile
    if (!this.terrain.lidar) await this.terrain.ensureBox(frame.minx - 64, frame.minz - 64, frame.maxx + 64, frame.maxz + 64);
    const t0 = performance.now();
    const vt = decodeTile(buf);
    const tile = { index: new Map(), bcount: 0 };
    const terrain = this.terrain;

    const polys = (name, fn) => {
      const layer = vt.layers[name];
      if (!layer) return;
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        if (f.type !== 3) continue;
        const res = fn(f.properties);
        if (!res) continue;
        const rings = toRings(f, frame, layer.extent);
        const bbox = ringsBBox(rings);
        addToIndex(tile.index, bbox, MARGIN, 'polys', { rings, bbox, kind: res[0], prio: res[1] });
      }
    };
    const underground = (p) => p.brunnel === 'tunnel' || p.indoor === 1 || p.layer < 0 || p.level < 0;

    polys('landcover', (p) => LANDCOVER[p.class] && [LANDCOVER[p.class], 1]);
    polys('landuse', (p) => LANDUSE[p.class] && [LANDUSE[p.class], 2]);
    polys('water', (p) => (p.intermittent === 1 || p.brunnel === 'tunnel' ? null : [p.class === 'ocean' ? SURF.OCEAN : SURF.WATER, 3]));
    polys('aeroway', (p) => (p.class === 'runway' || p.class === 'taxiway' || p.class === 'apron' ? [SURF.ROAD, 5] : null));
    polys('transportation', (p) => {
      if (underground(p) || p.class === 'bridge') return null;
      return [p.class === 'path' || p.class === 'pier' ? SURF.PLAZA : SURF.ROAD, 6];
    });

    const lines = (name, fn) => {
      const layer = vt.layers[name];
      if (!layer) return;
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        if (f.type !== 2) continue;
        const spec = fn(f.properties);
        if (!spec) continue;
        for (const line of toRings(f, frame, layer.extent)) {
          const nPts = line.length / 2;
          if (nPts < 2) continue;
          let total = 0;
          for (let k = 2; k < line.length; k += 2) total += Math.hypot(line[k] - line[k - 2], line[k + 1] - line[k - 1]);
          let deck = null;
          if (spec.bridge) {
            let y0 = terrain.groundY(line[0], line[1]) + spec.lift;
            let y1 = terrain.groundY(line[line.length - 2], line[line.length - 1]) + spec.lift;
            if (!spec.lift) y0 = y1 = Math.max(y0, y1);
            deck = { y0, y1, L: total || 1, pillars: spec.lift > 0 };
          }
          let s0 = 0;
          for (let k = 2; k < line.length; k += 2) {
            const ax = line[k - 2], az = line[k - 1], bx = line[k], bz = line[k + 1];
            const seg = { ax, az, bx, bz, r: spec.r, kind: spec.kind, prio: spec.prio, mark: spec.mark, s0, deck };
            const bbox = [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
            addToIndex(tile.index, bbox, MARGIN + spec.r, 'segs', seg);
            s0 += Math.hypot(bx - ax, bz - az);
          }
        }
      }
    };

    lines('waterway', (p) => {
      const r = WATERWAY[p.class];
      if (!r || p.brunnel === 'tunnel' || p.intermittent === 1) return null;
      return { r, kind: SURF.WATER, prio: 4, mark: 0 };
    });
    lines('transportation', (p) => {
      const def = ROADS[p.class];
      if (!def || underground(p)) return null;
      let r = def[0];
      let mark = def[2];
      if (p.ramp === 1) {
        r = 3.5;
        mark = 0;
      }
      if (p.class === 'path' && p.subclass === 'pedestrian') r = 2.5;
      if (p.class === 'rail' && p.service) r = 1.6;
      const rail = def[1] === SURF.RAIL;
      const bridge = p.brunnel === 'bridge' && !terrain.lidar;
      let lift = 0;
      if (bridge) {
        if (p.class === 'motorway' || p.class === 'trunk') lift = 8;
        else if (rail) lift = 7;
        if (lift && p.layer >= 2) lift += 5 * (p.layer - 1);
      }
      return { r, kind: def[1], prio: rail ? 200 : 10 + r * 10, mark, bridge, lift };
    });

    const bl = vt.layers.building;
    if (bl) {
      for (let i = 0; i < bl.length; i++) {
        const f = bl.feature(i);
        const p = f.properties;
        if (f.type !== 3 || p.hide_3d) continue;
        const rings = toRings(f, frame, bl.extent);
        const bbox = ringsBBox(rings);
        const id = `osm${tx}/${ty}/${i}`;
        let h = +p.render_height || 0;
        if (h < 2.5) h = 6 + (hashString(id) % 4) * 3;
        const info = buildingInfo(this.registry, terrain, id, rings, h, { source: 'OpenStreetMap' });
        addToIndex(tile.index, bbox, MARGIN, 'foots', { rings, bbox, info });
        tile.bcount++;
      }
    }

    const pl = vt.layers.place;
    if (pl && this.onPlaces) {
      const places = [];
      for (let i = 0; i < pl.length; i++) {
        const f = pl.feature(i);
        const p = f.properties;
        const g = f.loadGeometry()[0][0];
        if (g.x < 0 || g.y < 0 || g.x >= pl.extent || g.y >= pl.extent) continue;
        const gu = g.x / pl.extent, gv = g.y / pl.extent;
        places.push({ x: frame.x0 + gu * frame.ux + gv * frame.vx, z: frame.z0 + gu * frame.uz + gv * frame.vz, name: p['name:en'] || p['name:latin'] || p.name, local: p.name, cls: p.class });
      }
      if (places.length) this.onPlaces(places);
    }
    stats.decodeMs += performance.now() - t0;
    return tile;
  }

  ensureBox(minx, minz, maxx, maxz) {
    return this.ensure(this.proj, minx, minz, maxx, maxz);
  }

  // withBuildings: use OSM footprints (only where PLATEAU has no coverage)
  collect(cx, cz, out, withBuildings) {
    const x0 = cx * CHUNK - MARGIN, z0 = cz * CHUNK - MARGIN;
    const r = this.proj.tileRange(14, x0, z0, x0 + CHUNK + 2 * MARGIN, z0 + CHUNK + 2 * MARGIN);
    const key = chunkKey(cx, cz);
    let urban = false;
    for (let ty = r.ty0; ty <= r.ty1; ty++) {
      for (let tx = r.tx0; tx <= r.tx1; tx++) {
        const tile = this.get(tx, ty);
        if (!tile) continue;
        if (tile.bcount >= 150) urban = true;
        const e = tile.index.get(key);
        if (!e) continue;
        for (const f of e.polys) out.polys.push(f);
        for (const f of e.segs) out.segs.push(f);
        if (withBuildings) for (const f of e.foots) out.foots.push(f);
      }
    }
    return { urban };
  }

  collectArea(x0, z0, x1, z1, out, stamp, withBuildings) {
    const r = this.proj.tileRange(14, x0, z0, x1, z1);
    let urban = false;
    for (let ty = r.ty0; ty <= r.ty1; ty++) {
      for (let tx = r.tx0; tx <= r.tx1; tx++) {
        const tile = this.get(tx, ty);
        if (!tile) continue;
        if (tile.bcount >= 150) urban = true;
        collectIndexed(tile, x0, z0, x1, z1, stamp, withBuildings ? ['polys', 'segs', 'foots'] : ['polys', 'segs'], out);
      }
    }
    return { urban };
  }

  query(x, z) {
    return queryFoots(this, this.proj, x, z);
  }
}
