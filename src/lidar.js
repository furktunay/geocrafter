// Measured terrain for the Netherlands: AHN, the national airborne laser scan, served as 0.5 m
// rasters. DTM = bare ground, DSM = top surface (roofs, tree crowns, bridges). Both come from
// the same flight, so the hidden skeleton is the real shape of the city rather than extruded
// footprints. Tiles are requested in the national grid (RD New) and sampled in block space.
import { fromArrayBuffer } from 'geotiff';
import proj4 from 'proj4';
import { SEA_Y, MAX_Y, CHUNK, MARGIN, chunkKey } from './config.js';
import { addToIndex, hashString } from './tiles.js';
import { ringsBBox, pointInRings } from './raster.js';

const RD = '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs';
const WCS = 'https://service.pdok.nl/rws/ahn/wcs/v1_0?service=WCS&version=2.0.1&request=GetCoverage&format=image/tiff';
const TILE = 200; // metres per detail tile, kept at 1 m cells
const COARSE = 1024; // metres per skyline tile
const COARSE_PX = 256; // 4 m pixels
const REGION = 128; // blocks per block->RD affine patch
export const WATER_NAP = -0.4; // canal level in Amsterdam (the scan has no returns from water)

export const inNetherlands = (lon, lat) => lon > 3.2 && lon < 7.3 && lat > 50.7 && lat < 53.6;

async function coverage(id, x0, y0, x1, y1, extra = '') {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(`${WCS}&coverageId=${id}&subset=x(${x0},${x1})&subset=y(${y0},${y1})${extra}`);
      if (!r.ok || !(r.headers.get('content-type') || '').includes('tiff')) throw new Error(`AHN ${r.status}`);
      const image = await (await fromArrayBuffer(await r.arrayBuffer())).getImage();
      return { data: await image.readRasters({ interleave: true }), w: image.getWidth(), h: image.getHeight() };
    } catch (e) {
      if (attempt >= 2) {
        console.warn('AHN tile failed', id, x0, y0, e.message);
        return null;
      }
      await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
    }
  }
}

// 0.5 m rasters -> 1 m cells (row 0 = south). Ground: mean of measured samples; surface: highest.
function buildTile(dsm, dtm) {
  const n = TILE, px = n * 2;
  const g = new Float32Array(n * n).fill(NaN), s = new Float32Array(n * n).fill(NaN);
  const covered = new Uint8Array(n * n); // ground hidden under something (building, crown, bridge)
  // A half-metre sample with a surface but no ground under it belongs to something solid
  // (a roof); one with both is open ground, perhaps under a tree crown. A cell follows the
  // majority of its four samples, so a wall's edge does not smear roof heights onto the street.
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let roof = -Infinity, open = -Infinity, sum = 0, cnt = 0, hidden = 0;
      for (let d = 0; d < 4; d++) {
        const o = (px - 1 - (j * 2 + (d >> 1))) * px + i * 2 + (d & 1);
        const a = dsm ? dsm.data[o] : 1e38, b = dtm ? dtm.data[o] : 1e38;
        if (b < 1e30) {
          sum += b;
          cnt++;
          if (a < 1e30 && a > open) open = a;
        } else if (a < 1e30) {
          hidden++;
          if (a > roof) roof = a;
        }
      }
      const c = j * n + i;
      if (hidden >= 2) {
        s[c] = roof; // ground stays unknown here and is filled in below, which marks it covered
      } else {
        if (cnt) g[c] = sum / cnt;
        if (open > -Infinity) s[c] = open;
        else if (roof > -Infinity) s[c] = roof;
      }
    }
  }
  // ground under objects: take it from the nearest measured ground (breadth-first)
  const queue = new Int32Array(n * n);
  let head = 0, tail = 0;
  for (let c = 0; c < n * n; c++) if (g[c] === g[c]) queue[tail++] = c;
  while (head < tail) {
    const c = queue[head++];
    const i = c % n, j = (c / n) | 0;
    for (let d = 0; d < 4; d++) {
      const ni = i + (d === 0) - (d === 1), nj = j + (d === 2) - (d === 3);
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const o = nj * n + ni;
      if (g[o] === g[o] || s[o] !== s[o]) continue; // already known, or open water
      g[o] = g[c];
      covered[o] = 1;
      queue[tail++] = o;
    }
  }
  // block levels come from a smoothed ground so a few centimetres of camber do not make steps
  const R = 5;
  const tmp = new Float32Array(n * n), cntArr = new Float32Array(n * n), gs = new Float32Array(n * n).fill(NaN);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let k = Math.max(0, i - R); k <= Math.min(n - 1, i + R); k++) {
        const v = g[j * n + k];
        if (v === v) {
          sum += v;
          cnt++;
        }
      }
      tmp[j * n + i] = sum;
      cntArr[j * n + i] = cnt;
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (g[j * n + i] !== g[j * n + i]) continue;
      let sum = 0, cnt = 0;
      for (let k = Math.max(0, j - R); k <= Math.min(n - 1, j + R); k++) {
        sum += tmp[k * n + i];
        cnt += cntArr[k * n + i];
      }
      // stay within a block of the real ground (quay edges, ramps)
      const v = sum / cnt, e = g[j * n + i];
      gs[j * n + i] = v > e + 0.45 ? e + 0.45 : v < e - 0.45 ? e - 0.45 : v;
    }
  }
  return { g, s, gs, covered };
}

export class LidarTerrain {
  constructor(proj) {
    this.proj = proj;
    this.lidar = true;
    this.offset = 0; // vertical phase: where block boundaries fall relative to sea level
    this.tiles = new Map();
    this.pending = new Map();
    this.coarse = new Map();
    this.coarsePending = new Map();
    this.patches = new Map();
    this.tmp = [0, 0];
  }

  // RD New -> block (exact; used for building outlines, not per cell)
  fromRD(X, Y) {
    const [lon, lat] = proj4(RD, 'WGS84', [X, Y]);
    return this.proj.lonLatToBlock(lon, lat);
  }

  // block (x, z) -> RD New, through a local affine patch (exact at its corners)
  toRD(bx, bz, out) {
    const rx = Math.floor(bx / REGION), rz = Math.floor(bz / REGION);
    const key = rx * 65536 + rz;
    let p = this.patches.get(key);
    if (!p) {
      const at = (x, z) => proj4('WGS84', RD, this.proj.blockToLonLat(x, z));
      const ox = rx * REGION, oz = rz * REGION;
      const a = at(ox, oz), b = at(ox + REGION, oz), c = at(ox, oz + REGION);
      p = { ox, oz, x0: a[0], y0: a[1], xx: (b[0] - a[0]) / REGION, yx: (b[1] - a[1]) / REGION, xz: (c[0] - a[0]) / REGION, yz: (c[1] - a[1]) / REGION };
      this.patches.set(key, p);
    }
    const dx = bx - p.ox, dz = bz - p.oz;
    out[0] = p.x0 + dx * p.xx + dz * p.xz;
    out[1] = p.y0 + dx * p.yx + dz * p.yz;
    return out;
  }

  load(store, pending, key, make) {
    let p = pending.get(key);
    if (!p) {
      p = make().then((t) => {
        store.set(key, t);
        return t;
      });
      pending.set(key, p);
    }
    return p;
  }

  rdBox(minx, minz, maxx, maxz) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [bx, bz] of [[minx, minz], [maxx, minz], [minx, maxz], [maxx, maxz]]) {
      const [X, Y] = this.toRD(bx, bz, this.tmp);
      x0 = Math.min(x0, X);
      x1 = Math.max(x1, X);
      y0 = Math.min(y0, Y);
      y1 = Math.max(y1, Y);
    }
    return [x0, y0, x1, y1];
  }

  ensureBox(minx, minz, maxx, maxz) {
    const [x0, y0, x1, y1] = this.rdBox(minx - 2, minz - 2, maxx + 2, maxz + 2);
    const jobs = [];
    for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++) {
      for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) {
        jobs.push(this.load(this.tiles, this.pending, tx * 65536 + ty, async () => {
          const X = tx * TILE, Y = ty * TILE;
          const [dsm, dtm] = await Promise.all([coverage('dsm_05m', X, Y, X + TILE, Y + TILE), coverage('dtm_05m', X, Y, X + TILE, Y + TILE)]);
          return dsm || dtm ? buildTile(dsm, dtm) : null;
        }));
      }
    }
    return Promise.all(jobs);
  }

  // 4 m rasters for the skyline beyond the detailed area
  ensureCoarse(minx, minz, maxx, maxz) {
    const [x0, y0, x1, y1] = this.rdBox(minx, minz, maxx, maxz);
    const jobs = [];
    const scale = `&scaleSize=x(${COARSE_PX}),y(${COARSE_PX})`;
    for (let ty = Math.floor(y0 / COARSE); ty <= Math.floor(y1 / COARSE); ty++) {
      for (let tx = Math.floor(x0 / COARSE); tx <= Math.floor(x1 / COARSE); tx++) {
        jobs.push(this.load(this.coarse, this.coarsePending, tx * 65536 + ty, async () => {
          const X = tx * COARSE, Y = ty * COARSE;
          const [dsm, dtm] = await Promise.all([coverage('dsm_05m', X, Y, X + COARSE, Y + COARSE, scale), coverage('dtm_05m', X, Y, X + COARSE, Y + COARSE, scale)]);
          return dsm ? { dsm: dsm.data, dtm: dtm ? dtm.data : null } : null;
        }));
      }
    }
    return Promise.all(jobs);
  }

  cell(bx, bz) {
    const [X, Y] = this.toRD(bx, bz, this.tmp);
    const tx = Math.floor(X / TILE), ty = Math.floor(Y / TILE);
    const t = this.tiles.get(tx * 65536 + ty);
    if (!t) return null;
    this.index = Math.floor(Y - ty * TILE) * TILE + Math.floor(X - tx * TILE);
    return t;
  }

  // out = [ground (NaN over water), surface (NaN if no return), ground-was-covered flag]
  sample(bx, bz, out) {
    const t = this.cell(bx, bz);
    if (!t) {
      out[0] = out[1] = NaN;
      out[2] = 0;
      return out;
    }
    out[0] = t.g[this.index];
    out[1] = t.s[this.index];
    out[2] = t.covered[this.index];
    return out;
  }

  // out = [ground or NaN, surface or NaN] from the 4 m rasters
  sampleCoarse(bx, bz, out) {
    const [X, Y] = this.toRD(bx, bz, this.tmp);
    const tx = Math.floor(X / COARSE), ty = Math.floor(Y / COARSE);
    const t = this.coarse.get(tx * 65536 + ty);
    out[0] = out[1] = NaN;
    if (!t) return out;
    const k = COARSE_PX / COARSE;
    const o = (COARSE_PX - 1 - Math.floor((Y - ty * COARSE) * k)) * COARSE_PX + Math.floor((X - tx * COARSE) * k);
    if (t.dtm && t.dtm[o] < 1e30) out[0] = t.dtm[o];
    if (t.dsm[o] < 1e30) out[1] = t.dsm[o];
    return out;
  }

  // Real ground elevation in metres (water level over water).
  elevAt(bx, bz) {
    const t = this.cell(bx, bz);
    const v = t ? t.g[this.index] : NaN;
    return v === v ? v : WATER_NAP;
  }

  // Block row of the ground: quantised from the smoothed ground.
  groundY(bx, bz) {
    const t = this.cell(bx, bz);
    const v = t ? t.gs[this.index] : NaN;
    return this.yOf(v === v ? v : WATER_NAP);
  }

  yOf(elev) {
    const y = Math.round(elev - this.offset) + SEA_Y;
    return y < 6 ? 6 : y > MAX_Y - 80 ? MAX_Y - 80 : y;
  }

  // Exact world height of an elevation (block tops sit within half a block of it).
  trueY(elev) {
    return elev - this.offset + SEA_Y + 1;
  }

  // Put block boundaries where the least ground is, so the common street level is not split
  // into two rows by a few centimetres of noise.
  pickPhase() {
    const bins = new Float64Array(20);
    for (const t of this.tiles.values()) {
      if (!t) continue;
      for (let c = 0; c < t.gs.length; c += 3) {
        const v = t.gs[c];
        if (v === v) bins[Math.floor((((v % 1) + 1) % 1) * 20)]++;
      }
    }
    let best = 0, score = Infinity;
    for (let b = 0; b < 20; b++) {
      const sc = bins[(b + 19) % 20] + bins[b] * 2 + bins[(b + 1) % 20];
      if (sc < score) {
        score = sc;
        best = b;
      }
    }
    // a boundary at fraction f means round(e - offset) flips there: offset = f - 0.5
    this.offset = (best + 0.5) / 20 - 0.5;
    return this.offset;
  }
}

// Building outlines from 3D BAG, the Dutch building register joined with the laser scan: one
// polygon per building with its register id and measured heights. They tell roofs from tree
// crowns (the scan alone cannot where foliage hides the ground) and separate one canal house
// from the next.
const BAG = 'https://data.3dbag.nl/api/BAG3D/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=BAG3D:lod12&outputFormat=application/json&srsName=EPSG:28992&count=4000';

export class BagSource {
  constructor(terrain) {
    this.terrain = terrain;
    this.tiles = new Map();
    this.pending = new Map();
    this.registry = new Map();
  }

  async fetchTile(tx, ty) {
    const X = tx * TILE, Y = ty * TILE;
    let features = null;
    for (let attempt = 0; attempt < 3 && !features; attempt++) {
      try {
        const r = await fetch(`${BAG}&bbox=${X},${Y},${X + TILE},${Y + TILE},EPSG:28992`);
        if (!r.ok) throw new Error(`3D BAG ${r.status}`);
        features = (await r.json()).features || [];
      } catch (e) {
        if (attempt === 2) console.warn('3D BAG tile failed', tx, ty, e.message);
        else await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
      }
    }
    const tile = { index: new Map() };
    for (const f of features || []) {
      const g = f.geometry, p = f.properties;
      if (!g) continue;
      for (const poly of g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]) {
        const rings = poly.map((ring) => {
          const out = new Float32Array(ring.length * 2);
          ring.forEach((pt, i) => {
            const [bx, bz] = this.terrain.fromRD(pt[0], pt[1]);
            out[i * 2] = bx;
            out[i * 2 + 1] = bz;
          });
          return out;
        });
        const id = p.identificatie || `bag${f.id}`;
        let info = this.registry.get(id);
        if (!info) {
          const height = Math.max(3, (p.b3_h_70p ?? p.b3_h_max ?? 6) - (p.b3_h_maaiveld ?? 0));
          info = { id: id.replace('NL.IMBAG.Pand.', ''), hash: hashString(id), height, baseY: 0, area: 0, attrs: { source: '3D BAG', year: p.oorspronkelijkbouwjaar || null }, style: null, stamp: 0, li: 0 };
          this.registry.set(id, info);
        }
        const bbox = ringsBBox(rings);
        addToIndex(tile.index, bbox, MARGIN, 'foots', { rings, bbox, info });
      }
    }
    return tile;
  }

  tileRange(minx, minz, maxx, maxz) {
    const [x0, y0, x1, y1] = this.terrain.rdBox(minx, minz, maxx, maxz);
    return [Math.floor(x0 / TILE), Math.floor(y0 / TILE), Math.floor(x1 / TILE), Math.floor(y1 / TILE)];
  }

  ensureBox(minx, minz, maxx, maxz) {
    const [tx0, ty0, tx1, ty1] = this.tileRange(minx, minz, maxx, maxz);
    const jobs = [];
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = tx * 65536 + ty;
        let job = this.pending.get(key);
        if (!job) {
          job = this.fetchTile(tx, ty).then((t) => this.tiles.set(key, t));
          this.pending.set(key, job);
        }
        jobs.push(job);
      }
    }
    return Promise.all(jobs);
  }

  // Appends the outlines touching a chunk (plus margin) to out.foots.
  collect(cx, cz, out) {
    const x0 = cx * CHUNK - MARGIN, z0 = cz * CHUNK - MARGIN;
    const [tx0, ty0, tx1, ty1] = this.tileRange(x0, z0, x0 + CHUNK + 2 * MARGIN, z0 + CHUNK + 2 * MARGIN);
    const key = chunkKey(cx, cz);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const e = this.tiles.get(tx * 65536 + ty)?.index.get(key);
        if (e) for (const f of e.foots) out.foots.push(f);
      }
    }
  }

  query(x, z) {
    const key = chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
    for (const tile of this.tiles.values()) {
      const e = tile.index.get(key);
      if (e) for (const f of e.foots) if (pointInRings(f.rings, x, z)) return f.info;
    }
    return null;
  }
}
