// Turns map features into voxels: full-detail padded chunks near the player and a coarse
// heightfield mesh ("far tiles") for the skyline beyond them.
import { CHUNK, PAD, PS, MARGIN, MAX_Y, MIN_EDIT_Y, BEDROCK_TOP, FAR_TILE, FAR_CELL } from './config.js';
import { netherColumn, diamondAt } from './nether.js';
import { B, TEX_TOP } from './blocks.js';
import { fillPolygon, strokeSegment } from './raster.js';
import { SURF, nextStamp } from './tiles.js';
import { buildTextures, T } from './textures.js';
import { STYLES, styleForBuilding } from './styles.js';
import { QuadBuffer, pushQuad } from './mesher.js';

const N = CHUNK + 2 * MARGIN; // column grid, wider than the padded volume
const NN = N * N;
const OFF = MARGIN - PAD; // column-grid index of padded cell 0
const SY = PS * PS;
const SS = 3; // roof supersampling per axis
const NS = N * SS;

const gy = new Int16Array(NN); // ground y
const surf = new Uint8Array(NN);
const mark = new Uint8Array(NN); // painted line / rail on the surface
const deckY = new Int16Array(NN); // elevated bridge deck, 0 = none
const deckKind = new Uint8Array(NN);
const foot = new Int16Array(NN); // footprint hit at the cell centre (chunk-local building index)
const bIdx = new Int16Array(NN); // final building index, 0 = none
const roofSub = new Float32Array(NS * NS);
const roofH = new Float32Array(NN); // dominant roof height over the cell, 0 = uncovered
const roofCov = new Uint8Array(NN); // covered sub-samples (0..9)
const top = new Int16Array(NN); // building top y, -1 = not a building
const floorY = new Int16Array(NN);
const vox = new Uint8Array(SY * MAX_Y);
const sorted = new Float32Array(SS * SS);
// laser scan (where available): real ground and surface elevation per cell
const lg = new Float32Array(NN); // ground, NaN over open water
const ls = new Float32Array(NN); // top surface, NaN without a return
const lcov = new Uint8Array(NN); // ground hidden under something
const trueE = new Float32Array(NN); // elevation the visible ground should have
const wasWater = new Uint8Array(NN);
const lsamp = [0, 0, 0];
const CORNERS = CHUNK + 1;

const DECK_BARRIER = 8, DECK_PILLAR = 16;

const mod = (a, n) => ((a % n) + n) % n;

// Resolve style texture names to block ids / far-facade layers once.
for (const s of STYLES) {
  s.wallB = B[s.wall.toUpperCase()];
  s.glassB = B[s.glass.toUpperCase()];
  s.roofB = B[s.roof.toUpperCase()];
  s.facadeT = T[`facade_${s.index}`];
}
const DEFAULT_STYLE = STYLES.find((s) => s.wall === 'concrete' && s.fh === 4 && !s.curtain && s.glass === 'glass');

function styleFor(info) {
  if (!info) return DEFAULT_STYLE;
  if (!info.style) info.style = styleForBuilding(info.height, info.hash);
  return info.style;
}

// Building height in metres for a cell, given its roof sample and footprint record.
function heightOf(rz, info) {
  let h = rz > 0 ? rz : info ? info.height : 0;
  if (!(h >= 2.5)) h = info && info.height >= 2.5 ? info.height : 3;
  return Math.max(3, Math.round(h));
}

// ---- far tile scratch
const FG = FAR_TILE / FAR_CELL; // cells per tile side
const FM = FG + 2; // plus a one-cell ring for wall heights
const FSUB = 2; // samples per cell side
const FN = FM * FSUB;
const fGy = new Int16Array(FN * FN);
const fSurf = new Uint8Array(FN * FN);
const fFoot = new Int16Array(FN * FN);
const fRoof = new Float32Array(FN * FN);
const cH = new Int16Array(FM * FM); // top surface y of each coarse cell
const cTop = new Uint8Array(FM * FM); // top texture layer
const cWall = new Uint8Array(FM * FM); // wall texture layer
const cBldg = new Uint8Array(FM * FM);
const fMask = new Int32Array(FG * FG);
const fLg = new Float32Array(FN * FN);
const fLs = new Float32Array(FN * FN);
const fCov = new Uint8Array(FN * FN);
const farBuf = new QuadBuffer();

export class Generator {
  // opts.photo: the world is the skeleton under street photos - closed facades.
  // There are no trees in it either way: ground, water, roads and buildings only.
  constructor(proj, terrain, plateau, osm, japan, opts = {}) {
    this.proj = proj;
    this.terrain = terrain;
    this.plateau = plateau;
    this.osm = osm;
    this.japan = japan;
    this.photo = !!opts.photo;
    this.lidar = terrain.lidar ? terrain : null;
    this.bag = opts.bag || null; // exact building outlines (Netherlands)
    this.stamp = 0;
    this.avg = buildTextures().avg;
  }

  ensureBox(x0, z0, x1, z1) {
    return Promise.all([
      this.terrain.ensureBox(x0, z0, x1, z1),
      this.plateau.ensureBox(x0, z0, x1, z1),
      this.osm.ensureBox(x0, z0, x1, z1),
      this.bag ? this.bag.ensureBox(x0, z0, x1, z1) : null,
    ]);
  }

  // All map tiles a chunk depends on.
  ensure(cx, cz) {
    const x0 = cx * CHUNK - MARGIN, z0 = cz * CHUNK - MARGIN;
    return this.ensureBox(x0, z0, x0 + N, z0 + N);
  }

  ensureFar(lx, lz) {
    const x0 = lx * FAR_TILE - FAR_CELL, z0 = lz * FAR_TILE - FAR_CELL;
    const x1 = x0 + FM * FAR_CELL, z1 = z0 + FM * FAR_CELL;
    // the skyline only needs the coarse scan, never the half-metre tiles
    if (this.lidar) return Promise.all([this.lidar.ensureCoarse(x0, z0, x1, z1), this.osm.ensureBox(x0, z0, x1, z1)]);
    return this.ensureBox(x0, z0, x1, z1);
  }

  // -> { data: Uint8Array (PS * PS * H), H, map: Uint8ClampedArray (16 * 16 * 4), tops, corners }
  generate(cx, cz) {
    const ox = cx * CHUNK - MARGIN, oz = cz * CHUNK - MARGIN;
    const g = { ox, oz, n: N, s: 1 };
    const terrain = this.terrain;
    const lidar = this.lidar;

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const c = j * N + i;
        gy[c] = terrain.groundY(ox + i + 0.5, oz + j + 0.5);
        if (lidar) {
          lidar.sample(ox + i + 0.5, oz + j + 0.5, lsamp);
          lg[c] = lsamp[0];
          ls[c] = lsamp[1];
          lcov[c] = lsamp[2];
        }
      }
    }
    surf.fill(0);
    mark.fill(0);
    deckY.fill(0);
    deckKind.fill(0);
    foot.fill(0);
    roofSub.fill(0);

    const items = { polys: [], segs: [], roofs: [], foots: [] };
    const pl = this.plateau.collect(cx, cz, items);
    const os = this.osm.collect(cx, cz, items, !pl.covered && !this.bag);
    if (this.bag) this.bag.collect(cx, cz, items);
    const urban = pl.urban || os.urban;
    const seaY = terrain.yOf(0);

    // ---- ground cover
    items.polys.sort((a, b) => a.prio - b.prio);
    for (const p of items.polys) {
      const kind = p.kind;
      fillPolygon(p.rings, p.bbox, g, (c) => {
        surf[c] = kind;
      });
    }

    if (lidar) for (let c = 0; c < NN; c++) wasWater[c] = surf[c] === SURF.WATER || surf[c] === SURF.OCEAN ? 1 : 0;

    // ---- roads, rails, streams (narrow first so wide roads win at junctions)
    items.segs.sort((a, b) => a.prio - b.prio);
    for (const s of items.segs) {
      const deck = s.deck;
      const rail = s.kind === SURF.RAIL;
      strokeSegment(s.ax, s.az, s.bx, s.bz, s.r, g, (c, d, t) => {
        const along = s.s0 + t;
        const line = rail ? d < 0.8 : s.mark && d < 0.6 && ((along / 3) | 0) % 2 === 0;
        if (deck) {
          const y = Math.round(deck.y0 + ((deck.y1 - deck.y0) * along) / deck.L);
          if (y > gy[c] + 1) {
            if (y >= deckY[c]) {
              deckY[c] = y;
              let k = rail ? (line ? 4 : 3) : line ? 2 : 1;
              if (d > s.r - 1) k |= DECK_BARRIER;
              if (deck.pillars && d < 1.3 && along % 28 < 2) k |= DECK_PILLAR;
              deckKind[c] = k;
            }
            return;
          }
        }
        surf[c] = s.kind;
        mark[c] = line ? 1 : 0;
      });
    }

    // ---- buildings
    const stamp = ++this.stamp;
    const infos = [null];
    for (const f of items.foots) {
      const info = f.info;
      if (info.stamp !== stamp) {
        info.stamp = stamp;
        info.li = infos.push(info) - 1;
      }
      const li = info.li;
      fillPolygon(f.rings, f.bbox, g, (c) => {
        foot[c] = li;
      });
    }
    // Roof pieces are sampled 3x3 per cell and the median wins, so slivers thinner than half a
    // block (parapets, rooftop signs) cannot alias into one-block spikes.
    const gs = { ox, oz, n: NS, s: 1 / SS };
    for (const r of items.roofs) {
      const z = r.z > 0 ? r.z : 3; // no surveyed height: one storey
      fillPolygon(r.rings, r.bbox, gs, (c) => {
        if (z > roofSub[c]) roofSub[c] = z;
      });
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        let cnt = 0;
        for (let sj = 0; sj < SS; sj++) {
          const row = (j * SS + sj) * NS + i * SS;
          for (let si = 0; si < SS; si++) {
            const v = roofSub[row + si];
            if (v > 0) {
              let b = cnt++;
              while (b > 0 && sorted[b - 1] > v) {
                sorted[b] = sorted[b - 1];
                b--;
              }
              sorted[b] = v;
            }
          }
        }
        roofCov[j * N + i] = cnt;
        roofH[j * N + i] = cnt ? sorted[(cnt - 1) >> 1] : 0;
      }
    }
    // Where PLATEAU roof data exists it defines the building shape and the footprint only names
    // it (footprints and LOD2 roofs can disagree by a metre or two); elsewhere the footprint is
    // extruded to its recorded height.
    const half = (SS * SS) >> 1;
    for (let c = 0; c < NN; c++) {
      let isB;
      if (lidar) {
        // The building register says where buildings are, the scan how tall each cell is.
        // Without the register (it failed to load) fall back on "tall with no ground visible
        // under it", with the bar above trams and lorries that happened to be scanned.
        const h = ls[c] - lg[c];
        isB = this.bag ? foot[c] > 0 && !(h < 2) : lcov[c] === 1 && h >= 4.2;
      } else isB = pl.roofs ? roofCov[c] > half : foot[c] > 0;
      top[c] = isB ? 0 : -1;
      bIdx[c] = isB ? foot[c] : 0;
    }
    // roof cells outside their footprint take the id of a neighbour, two cells deep
    for (let pass = 0; pass < 2; pass++) {
      const src = pass === 0 ? foot : floorY; // floorY is free until the next loop: use it as a snapshot
      if (pass === 1) floorY.set(bIdx);
      for (let j = 1; j < N - 1; j++) {
        for (let i = 1; i < N - 1; i++) {
          const c = j * N + i;
          if (top[c] < 0 || bIdx[c]) continue;
          bIdx[c] = src[c - 1] || src[c + 1] || src[c - N] || src[c + N];
        }
      }
    }
    for (let c = 0; c < NN; c++) {
      if (top[c] < 0) continue;
      const info = infos[bIdx[c]];
      // with a scan, each cell stands on its own ground and reaches the measured roof
      const f = !lidar && info ? info.baseY : gy[c];
      floorY[c] = f;
      let t = f + heightOf(roofH[c], info);
      if (lidar && ls[c] === ls[c]) t = Math.max(f + 3, terrain.yOf(ls[c]));
      top[c] = Math.min(MAX_Y - 6, t);
    }

    // ---- what the scan says about everything that is not a building
    if (lidar) {
      for (let c = 0; c < NN; c++) {
        if (top[c] >= 0) continue;
        const e = lg[c], sv = ls[c];
        if (e !== e) {
          // no ground return at all: open water
          surf[c] = SURF.WATER;
          mark[c] = 0;
          trueE[c] = NaN;
          continue;
        }
        if (surf[c] === SURF.WATER || surf[c] === SURF.OCEAN) surf[c] = SURF.NONE; // mapped as water, scanned as land
        trueE[c] = e;
        if (wasWater[c] && lcov[c] && sv === sv && sv - e < 6) {
          // something low over mapped water: a bridge deck or a moored boat is the ground here
          trueE[c] = sv;
          gy[c] = terrain.yOf(sv);
        }
        // Anything else that stands tall without being a building - tree crowns, lamps, awnings -
        // is left out on purpose. Blocks cannot follow a crown's shape, so the photo never sat
        // on them properly; without them the tree in the photo simply lies on what is behind it.
      }
    }

    // ---- voxels
    const tops = new Int16Array(CHUNK * CHUNK); // building top or ground, for skyline matching
    let maxTop = 4;
    for (let pz = 0; pz < PS; pz++) {
      for (let px = 0; px < PS; px++) {
        const c = (pz + OFF) * N + px + OFF;
        const col = pz * PS + px;
        const s = surf[c];
        const isB = top[c] >= 0;
        let g0 = gy[c];
        if (s === SURF.OCEAN) g0 = seaY;
        const groundTop = isB && floorY[c] < g0 ? floorY[c] : g0;
        const wet = s === SURF.WATER || s === SURF.OCEAN;
        const sub = wet || s === SURF.SAND ? B.SAND : B.DIRT;

        const wx = ox + OFF + px, wz = oz + OFF + pz;
        for (let y = 2; y <= groundTop - 4; y++) vox[y * SY + col] = y < 15 && diamondAt(wx, y, wz) ? B.DIAMOND_ORE : B.STONE;
        for (let y = Math.max(2, groundTop - 3); y < groundTop; y++) vox[y * SY + col] = sub;
        // the floor of the world: solid at the bottom, thinning out over the next layers. Hashed
        // from world coordinates so the padded borders of neighbouring chunks agree.
        vox[col] = B.BEDROCK;
        vox[SY + col] = B.BEDROCK;
        const hb = Math.imul(wx, 0x9e3779b1) ^ Math.imul(wz, 0x85ebca6b);
        for (let y = MIN_EDIT_Y; y < BEDROCK_TOP && y < groundTop; y++) {
          if (((Math.imul(hb ^ y, 0xc2b2ae35) >>> 16) & 3) < BEDROCK_TOP - y) vox[y * SY + col] = B.BEDROCK;
        }
        // under the starting point: the cave of the small Nether (see nether.js)
        netherColumn(vox, SY, col, wx, wz, groundTop);
        let colTop = groundTop;

        if (isB) {
          const f = floorY[c];
          const tY = top[c];
          const li = bIdx[c];
          const st = styleFor(infos[li]);
          const glassB = this.photo ? (st.glassB === B.GLASS ? B.WINDOW : B.WINDOW_DARK) : st.glassB;
          if (f > g0) {
            vox[g0 * SY + col] = B.DIRT;
            for (let y = g0 + 1; y < f; y++) vox[y * SY + col] = B.CONCRETE;
          }
          const wx = ox + px + OFF, wz = oz + pz + OFF;
          const nW = c - 1, nE = c + 1, nN = c - N, nS = c + N;
          const edge = top[nW] < 0 || top[nE] < 0 || top[nN] < 0 || top[nS] < 0;
          vox[f * SY + col] = edge ? st.wallB : B.FLOOR;
          for (let y = f + 1; y <= tY; y++) {
            const oW = top[nW] < y, oE = top[nE] < y, oN = top[nN] < y, oS = top[nS] < y;
            const openX = oW || oE, openZ = oN || oS;
            let id;
            if (y === tY) {
              id = st.roofB;
            } else if (openX || openZ) {
              const m = (y - f) % st.fh;
              const t = openX ? wz : wx;
              if (openX && openZ) id = st.wallB;
              else if (st.curtain) id = m === 0 || mod(t, 6) === 0 ? st.wallB : glassB;
              else id = m >= 2 && mod(t, st.period) < st.win ? glassB : st.wallB;
            } else if (bIdx[nW] !== li || bIdx[nE] !== li || bIdx[nN] !== li || bIdx[nS] !== li) {
              id = st.wallB; // party wall against a taller neighbour
            } else {
              id = (y - f) % st.fh === 0 ? B.FLOOR : B.AIR;
            }
            if (id) vox[y * SY + col] = id;
          }
          colTop = tY;
        } else {
          let id;
          switch (s) {
            case SURF.GRASS: case SURF.FOREST: id = B.GRASS; break;
            case SURF.SAND: id = B.SAND; break;
            case SURF.FARM: id = B.FARMLAND; break;
            case SURF.WATER: case SURF.OCEAN: id = B.WATER; break;
            case SURF.ROAD: id = mark[c] ? B.ROAD_LINE : B.ASPHALT; break;
            case SURF.PATH: case SURF.PLAZA: id = B.PAVING; break;
            case SURF.RAIL: id = mark[c] ? B.RAIL : B.GRAVEL; break;
            case SURF.TURF: id = B.TURF; break;
            case SURF.ROCK: id = B.STONE; break;
            case SURF.SNOW: id = B.SNOW; break;
            default: id = urban ? B.PAVEMENT : B.GRASS;
          }
          vox[g0 * SY + col] = id;
          if (wet && g0 > 4) {
            vox[(g0 - 1) * SY + col] = B.WATER;
            if (s === SURF.OCEAN) vox[(g0 - 2) * SY + col] = B.WATER;
          }
          const dy = deckY[c];
          if (dy > g0 + 1) {
            const k = deckKind[c];
            const type = k & 7;
            vox[dy * SY + col] = type === 1 ? B.DECK : type === 2 ? B.DECK_LINE : type === 3 ? B.DECK_RAIL : B.DECK_TRACK;
            colTop = dy;
            if (k & DECK_BARRIER) {
              vox[(dy + 1) * SY + col] = B.CONCRETE;
              colTop = dy + 1;
            }
            if (k & DECK_PILLAR) for (let y = g0 + 1; y < dy; y++) vox[y * SY + col] = B.CONCRETE;
          }
        }
        if (colTop > maxTop) maxTop = colTop;
        if (px >= PAD && px < PS - PAD && pz >= PAD && pz < PS - PAD) tops[(pz - PAD) * CHUNK + px - PAD] = isB ? top[c] : g0;
      }
    }

    const H = Math.min(MAX_Y, maxTop + 3);
    const data = vox.slice(0, H * SY);
    vox.fill(0, 0, H * SY);

    // ---- top-down map tile
    const map = new Uint8ClampedArray(CHUNK * CHUNK * 4);
    const avg = this.avg;
    const topOf = (px, pz) => {
      const col = pz * PS + px;
      let y = H - 1;
      while (y > 0 && data[y * SY + col] === 0) y--;
      return y;
    };
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const y = topOf(x + PAD, z + PAD);
        const l = TEX_TOP[data[y * SY + (z + PAD) * PS + x + PAD]] * 3;
        const d = y - topOf(x, z);
        const k = 1 + (d > 6 ? 6 : d < -6 ? -6 : d) * 0.045;
        const o = (z * CHUNK + x) * 4;
        map[o] = avg[l] * k;
        map[o + 1] = avg[l + 1] * k;
        map[o + 2] = avg[l + 2] * k;
        map[o + 3] = 255;
      }
    }

    // ---- real ground heights at the block corners. Blocks quantise the ground to whole metres;
    // the mesher moves every vertex that lies on the ground to the measured height instead, so
    // the surface the photos are projected on is the real one. Per corner: height, and the range
    // of block-top levels of the land cells around it (vertices in that range are "on the ground").
    let corners = null;
    if (lidar) {
      corners = new Float32Array(CORNERS * CORNERS * 3);
      for (let cj = 0; cj < CORNERS; cj++) {
        for (let ci = 0; ci < CORNERS; ci++) {
          let n = 0, sum = 0, lo = 1e9, hi = -1e9;
          for (let d = 0; d < 4; d++) {
            const c = (cj - 1 + (d >> 1) + MARGIN) * N + ci - 1 + (d & 1) + MARGIN;
            if (top[c] >= 0 || trueE[c] !== trueE[c]) continue; // building or water
            const v = gy[c] + 1;
            sum += terrain.trueY(trueE[c]);
            n++;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
          const o = (cj * CORNERS + ci) * 3;
          const h = n ? sum / n : 0;
          corners[o] = n ? Math.min(hi + 0.95, Math.max(lo - 0.95, h)) : 0;
          corners[o + 1] = lo;
          corners[o + 2] = hi;
        }
      }
    }
    return { data, H, map, tops, corners };
  }

  // Coarse skyline tile: FAR_CELL-metre columns meshed as a heightfield, in tile-local coordinates.
  // -> { mesh: { pos, dat, idx, quads, maxY }, heights }
  generateFar(lx, lz) {
    const terrain = this.terrain;
    const lidar = this.lidar;
    const s = FAR_CELL / FSUB;
    const ox = lx * FAR_TILE - FAR_CELL, oz = lz * FAR_TILE - FAR_CELL;
    const g = { ox, oz, n: FN, s };
    if (lidar) {
      // 4 m scan: surface everywhere, ground only where it was visible from the air
      let sum = 0, cnt = 0;
      for (let c = 0; c < FN * FN; c++) {
        lidar.sampleCoarse(ox + ((c % FN) + 0.5) * s, oz + (Math.floor(c / FN) + 0.5) * s, lsamp);
        fLg[c] = lsamp[0];
        fLs[c] = lsamp[1];
        if (lsamp[0] === lsamp[0]) {
          sum += lsamp[0];
          cnt++;
        }
      }
      const typical = cnt ? sum / cnt : 0.5;
      for (let c = 0; c < FN * FN; c++) {
        fCov[c] = 0;
        if (fLg[c] !== fLg[c] && fLs[c] === fLs[c]) {
          fLg[c] = Math.min(typical, fLs[c]); // ground hidden: assume the level around
          fCov[c] = 1;
        }
        fGy[c] = terrain.yOf(fLg[c] === fLg[c] ? fLg[c] : -0.4);
      }
    } else {
      for (let j = 0; j < FN; j++) {
        for (let i = 0; i < FN; i++) fGy[j * FN + i] = terrain.groundY(ox + (i + 0.5) * s, oz + (j + 0.5) * s);
      }
    }
    fSurf.fill(0);
    fFoot.fill(0);
    fRoof.fill(0);

    const items = { polys: [], segs: [], roofs: [], foots: [] };
    const x1 = ox + FN * s, z1 = oz + FN * s;
    const stamp = nextStamp();
    const pl = this.plateau.collectArea(ox, oz, x1, z1, items, stamp);
    const os = this.osm.collectArea(ox, oz, x1, z1, items, stamp, !pl.covered);
    const urban = pl.urban || os.urban;
    const seaY = terrain.yOf(0);

    items.polys.sort((a, b) => a.prio - b.prio);
    for (const p of items.polys) {
      const kind = p.kind;
      fillPolygon(p.rings, p.bbox, g, (c) => {
        fSurf[c] = kind;
      });
    }
    items.segs.sort((a, b) => a.prio - b.prio);
    for (const sg of items.segs) {
      if (sg.deck && sg.deck.pillars) continue; // viaducts are not drawn at this distance
      const kind = sg.kind;
      strokeSegment(sg.ax, sg.az, sg.bx, sg.bz, Math.max(sg.r, s * 0.75), g, (c) => {
        fSurf[c] = kind;
      });
    }
    const infos = [null];
    const bs = ++this.stamp;
    for (const f of items.foots) {
      const info = f.info;
      if (info.stamp !== bs) {
        info.stamp = bs;
        info.li = infos.push(info) - 1;
      }
      const li = info.li;
      fillPolygon(f.rings, f.bbox, g, (c) => {
        fFoot[c] = li;
      });
    }
    for (const r of items.roofs) {
      const z = r.z > 0 ? r.z : 3; // no surveyed height: one storey
      fillPolygon(r.rings, r.bbox, g, (c) => {
        if (z > fRoof[c]) fRoof[c] = z;
      });
    }

    // collapse 2x2 samples into columns: the tallest building sample wins
    let maxY = 0;
    for (let j = 0; j < FM; j++) {
      for (let i = 0; i < FM; i++) {
        const c = j * FM + i;
        let best = -1, style = null, ground = 0, sf = 0, wet = 0;
        for (let k = 0; k < FSUB * FSUB; k++) {
          const sc = (j * FSUB + (k >> 1)) * FN + i * FSUB + (k & 1);
          ground += fGy[sc];
          if (k === 0 || fSurf[sc] === SURF.ROAD) sf = fSurf[sc];
          const li = fFoot[sc], rz = fRoof[sc];
          if (lidar) {
            const e = fLg[sc], sv = fLs[sc];
            if (e !== e) wet++;
            const h = sv - e;
            if (li ? h >= 2.6 : fCov[sc] === 1 && h >= 4.2) {
              const t = terrain.yOf(sv);
              if (t > best) {
                best = t;
                style = styleFor(infos[li]);
              }
            }
            continue;
          }
          if (pl.roofs ? !(rz > 0) : !li) continue;
          const info = infos[li];
          const t = (info ? info.baseY : fGy[sc]) + heightOf(rz, info);
          if (t > best) {
            best = t;
            style = styleFor(info);
          }
        }
        if (lidar && best < 0 && wet === FSUB * FSUB) sf = SURF.WATER;
        else if (lidar && (sf === SURF.WATER || sf === SURF.OCEAN)) sf = SURF.NONE;
        if (best >= 0) {
          cH[c] = Math.min(MAX_Y - 6, best) + 1;
          cTop[c] = T[style.roof];
          cWall[c] = style.facadeT;
          cBldg[c] = 1;
        } else {
          let h = Math.round(ground / (FSUB * FSUB)) + 1;
          let layer;
          switch (sf) {
            case SURF.GRASS: case SURF.FOREST: layer = T.grass_top; break;
            case SURF.SAND: layer = T.sand; break;
            case SURF.FARM: layer = T.farmland; break;
            case SURF.OCEAN: layer = T.water; h = seaY + 1; break;
            case SURF.WATER: layer = T.water; break;
            case SURF.ROAD: layer = T.asphalt; break;
            case SURF.PATH: case SURF.PLAZA: layer = T.paving; break;
            case SURF.RAIL: layer = T.gravel; break;
            case SURF.TURF: layer = T.turf; break;
            case SURF.ROCK: layer = T.stone; break;
            case SURF.SNOW: layer = T.snow; break;
            default: layer = urban ? T.pavement : T.grass_top;
          }
          cH[c] = h;
          cTop[c] = layer;
          cWall[c] = T.dirt;
          cBldg[c] = 0;
        }
        if (cH[c] > maxY) maxY = cH[c];
      }
    }

    // ---- tops (greedy) and walls
    const buf = farBuf;
    for (let j = 0; j < FG; j++) {
      for (let i = 0; i < FG; i++) {
        const c = (j + 1) * FM + i + 1;
        fMask[j * FG + i] = cH[c] * 256 + cTop[c];
      }
    }
    for (let j = 0; j < FG; j++) {
      for (let i = 0; i < FG; ) {
        const k = fMask[j * FG + i];
        if (k < 0) {
          i++;
          continue;
        }
        let w = 1;
        while (i + w < FG && fMask[j * FG + i + w] === k) w++;
        let h = 1;
        grow: while (j + h < FG) {
          for (let q = 0; q < w; q++) if (fMask[(j + h) * FG + i + q] !== k) break grow;
          h++;
        }
        for (let dj = 0; dj < h; dj++) for (let q = 0; q < w; q++) fMask[(j + dj) * FG + i + q] = -1;
        pushQuad(buf, 1, 1, k >> 8, i * FAR_CELL, j * FAR_CELL, (i + w) * FAR_CELL, (j + h) * FAR_CELL, k & 255, 1, 3, 3, 3, 3);
        i += w;
      }
    }
    for (let j = 0; j < FG; j++) {
      for (let i = 0; i < FG; i++) {
        const c = (j + 1) * FM + i + 1;
        const h = cH[c];
        const layer = cWall[c];
        const flags = 1 | (cBldg[c] << 1);
        const xa = i * FAR_CELL, xb = xa + FAR_CELL, za = j * FAR_CELL, zb = za + FAR_CELL;
        let hn = cH[c + 1];
        if (hn < h) pushQuad(buf, 0, 1, xb, za, hn, zb, h, layer, flags, 3, 3, 3, 3);
        hn = cH[c - 1];
        if (hn < h) pushQuad(buf, 0, -1, xa, za, hn, zb, h, layer, flags, 3, 3, 3, 3);
        hn = cH[c + FM];
        if (hn < h) pushQuad(buf, 2, 1, zb, xa, hn, xb, h, layer, flags, 3, 3, 3, 3);
        hn = cH[c - FM];
        if (hn < h) pushQuad(buf, 2, -1, za, xa, hn, xb, h, layer, flags, 3, 3, 3, 3);
      }
    }
    const mesh = buf.take();
    mesh.maxY = maxY;
    const heights = new Int16Array(FG * FG);
    for (let j = 0; j < FG; j++) for (let i = 0; i < FG; i++) heights[j * FG + i] = cH[(j + 1) * FM + i + 1];
    return { mesh, heights };
  }
}
