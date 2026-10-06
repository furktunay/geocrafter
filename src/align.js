// Worker side of the panorama alignment: search position and heading against the city model.
import { CHUNK, FAR_TILE, FAR_CELL, chunkKey } from './config.js';
import { SKY_W, SKY_STEP, headingCosts, pickHeadings } from './skyline.js';

const FG = FAR_TILE / FAR_CELL;
const NEAR = 220; // metres of 1 m columns around the panorama; coarse cells beyond
const FAR = 1100;
const RAD = 57.29577951;
const MAX_CHUNKS = 6000, MAX_FAR = 900;

export class Aligner {
  constructor(terrain) {
    this.terrain = terrain;
    this.chunkTops = new Map(); // chunkKey -> Int16Array(256): building top y, or ground y
    this.farHeights = new Map(); // tile key -> Int16Array(FG * FG): top surface y
    this.cost = new Float32Array(SKY_W);
    this.model = new Float32Array(SKY_W);
  }

  addChunk(cx, cz, tops) {
    this.chunkTops.set(chunkKey(cx, cz), tops);
    if (this.chunkTops.size > MAX_CHUNKS) this.chunkTops.delete(this.chunkTops.keys().next().value);
  }

  addFar(lx, lz, heights) {
    this.farHeights.set(chunkKey(lx, lz), heights);
    if (this.farHeights.size > MAX_FAR) this.farHeights.delete(this.farHeights.keys().next().value);
  }

  topAt(x, z) {
    const fx = Math.floor(x), fz = Math.floor(z);
    const t = this.chunkTops.get(chunkKey(fx >> 4, fz >> 4));
    return t ? t[(fz & 15) * CHUNK + (fx & 15)] : null;
  }

  // Everything that can rise above eye level, as flat [x, z, topSurfaceY, halfSize] records:
  // 1 m columns near the panorama and coarse cells beyond, kept apart because the distant
  // outline barely moves when the viewpoint shifts a few metres.
  columns(x, z, minY) {
    const out = [], far = [];
    const cx0 = Math.floor((x - NEAR) / CHUNK), cx1 = Math.floor((x + NEAR) / CHUNK);
    const cz0 = Math.floor((z - NEAR) / CHUNK), cz1 = Math.floor((z + NEAR) / CHUNK);
    const have = new Set();
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = chunkKey(cx, cz);
        const t = this.chunkTops.get(key);
        if (!t) continue;
        have.add(key);
        for (let i = 0; i < 256; i++) {
          if (t[i] + 1 > minY) out.push(cx * CHUNK + (i & 15) + 0.5, cz * CHUNK + (i >> 4) + 0.5, t[i] + 1, 0.71);
        }
      }
    }
    const lx0 = Math.floor((x - FAR) / FAR_TILE), lx1 = Math.floor((x + FAR) / FAR_TILE);
    const lz0 = Math.floor((z - FAR) / FAR_TILE), lz1 = Math.floor((z + FAR) / FAR_TILE);
    for (let lz = lz0; lz <= lz1; lz++) {
      for (let lx = lx0; lx <= lx1; lx++) {
        const hts = this.farHeights.get(chunkKey(lx, lz));
        if (!hts) continue;
        for (let i = 0; i < FG * FG; i++) {
          if (hts[i] <= minY) continue;
          const wx = lx * FAR_TILE + ((i % FG) + 0.5) * FAR_CELL, wz = lz * FAR_TILE + (Math.floor(i / FG) + 0.5) * FAR_CELL;
          if (have.has(chunkKey(Math.floor(wx) >> 4, Math.floor(wz) >> 4))) continue; // covered in detail
          far.push(wx, wz, hts[i], FAR_CELL * 0.71);
        }
      }
    }
    return { near: Float32Array.from(out), far: Float32Array.from(far) };
  }

  // Model outline (elevation in degrees per world azimuth bin) seen from an eye position,
  // raised on top of `base` if given.
  profile(cols, ex, ey, ez, out, base = null) {
    if (base) out.set(base);
    else out.fill(0);
    for (let k = 0; k < cols.length; k += 4) {
      const h = cols[k + 2] - ey;
      if (h <= 0) continue;
      const dx = cols[k] - ex, dz = cols[k + 1] - ez;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.8) continue;
      const el = Math.atan2(h, d) * RAD;
      const az = Math.atan2(dx, -dz) * RAD + 360;
      const w = Math.atan2(cols[k + 3], d) * RAD;
      const b1 = Math.floor((az + w) / SKY_STEP);
      for (let b = Math.floor((az - w) / SKY_STEP); b <= b1; b++) {
        const j = b % SKY_W;
        if (el > out[j]) out[j] = el;
      }
    }
    return out;
  }

  // -> { dx, dz, heading, cost, mean, gpsCost, confident }
  solve({ x, z, height, gps, photo }) {
    const terrain = this.terrain;
    const eyeAt = (px, pz) => terrain.groundY(px, pz) + 1 + height;
    const cols = this.columns(x, z, eyeAt(x, z) - 3);
    const farBase = this.profile(cols.far, x, eyeAt(x, z), z, new Float32Array(SKY_W));
    const tried = new Map();
    let bestG = null, bestL = null, gpsCost = null;
    let exact = false; // coarse passes reuse the distant outline from the GPS spot
    const evaluate = (dx, dz) => {
      const key = `${dx},${dz},${exact}`;
      if (tried.has(key)) return;
      tried.set(key, true);
      const px = x + dx, pz = z + dz;
      const top = this.topAt(px, pz);
      const ground = terrain.groundY(px, pz);
      if (top === null || top > ground + 1) return; // unknown ground or inside a building
      const ey = eyeAt(px, pz);
      if (exact) this.profile(cols.far, px, ey, pz, this.model);
      this.profile(cols.near, px, ey, pz, this.model, exact ? this.model : farBase);
      headingCosts(this.model, photo, this.cost);
      const r = pickHeadings(this.cost, gps, 25);
      const prior = Math.hypot(dx, dz) * 0.1; // stay near the GPS fix unless the outline insists
      if (dx === 0 && dz === 0) gpsCost = this.cost[Math.round(gps / SKY_STEP) % SKY_W];
      if (!bestG || r.globalCost + prior < bestG.score) bestG = { dx, dz, heading: r.global, cost: r.globalCost, mean: r.mean, score: r.globalCost + prior };
      if (!bestL || r.localCost + prior < bestL.score) bestL = { dx, dz, heading: r.local, cost: r.localCost, mean: r.mean, score: r.localCost + prior };
    };
    const grid = (cx, cz, radius, step) => {
      for (let dz = -radius; dz <= radius; dz += step) for (let dx = -radius; dx <= radius; dx += step) evaluate(cx + dx, cz + dz);
    };
    grid(0, 0, 12, 4);
    if (!bestG) return { dx: 0, dz: 0, heading: gps, confident: false, cost: 0, mean: 0, gpsCost: 0 };
    // refine around both contenders, the last pass with the exact distant outline
    for (const step of [2, 1]) {
      const g = bestG, l = bestL;
      if (step === 1) {
        exact = true;
        bestG = bestL = null;
      }
      grid(g.dx, g.dz, step, step);
      grid(l.dx, l.dz, step, step);
    }
    const nearGps = Math.abs(((bestG.heading - gps + 540) % 360) - 180) <= 25;
    let pick = null;
    // a heading far from the GPS one must win clearly; near it, a modest dip is enough
    if (bestG.cost < bestG.mean * 0.72 && (nearGps || bestG.cost < bestL.cost * 0.65)) pick = bestG;
    else if (bestL.cost < bestL.mean * 0.85) pick = bestL;
    if (!pick) {
      // nothing convincing: keep the GPS heading, but never leave the camera inside a building
      const open = [...tried.keys()].map((k) => k.split(',').slice(0, 2).map(Number)).filter(([dx, dz]) => {
        const top = this.topAt(x + dx, z + dz);
        return top !== null && top <= terrain.groundY(x + dx, z + dz) + 1;
      }).sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0] || [0, 0];
      return { dx: open[0], dz: open[1], heading: gps, confident: false, cost: bestG.cost, mean: bestG.mean, gpsCost };
    }
    return { dx: pick.dx, dz: pick.dz, heading: pick.heading, confident: true, cost: pick.cost, mean: pick.mean, gpsCost };
  }
}
