// Greedy mesher over a padded chunk volume (PS x H x PS, index = (y * PS + z + 1) * PS + x + 1).
// The 1-block border means a chunk meshes without looking at its neighbours.
// Layer 0 and layer H-1 are never meshed: 0 is bedrock, H-1 is guaranteed air.
import { CHUNK, PS } from './config.js';
import { OPAQUE, SHADE, PASS, GLOW, TEX_DIR, MODEL, boxesOf, B } from './blocks.js';
import { T } from './textures.js';

// Top faces that sit below the top of their cell, by texture layer: water stands a little low.
const DROP = new Float32Array(256);
DROP[T.water] = 0.125;

const SX = 1, SZ = PS, SY = PS * PS;

export class QuadBuffer {
  constructor() {
    this.cap = 4096;
    this.pos = new Float32Array(this.cap * 12);
    this.dat = new Uint8Array(this.cap * 16);
    this.idx = new Uint32Array(this.cap * 6);
    this.n = 0;
  }

  grow() {
    this.cap *= 2;
    const pos = new Float32Array(this.cap * 12), dat = new Uint8Array(this.cap * 16), idx = new Uint32Array(this.cap * 6);
    pos.set(this.pos);
    dat.set(this.dat);
    idx.set(this.idx);
    this.pos = pos;
    this.dat = dat;
    this.idx = idx;
  }

  take() {
    const n = this.n;
    this.n = 0;
    return { pos: this.pos.slice(0, n * 12), dat: this.dat.slice(0, n * 16), idx: this.idx.slice(0, n * 6), quads: n };
  }
}

const bufs = [new QuadBuffer(), new QuadBuffer()];
const CORNERS = CHUNK + 1;
// Real ground heights at block corners for the chunk being meshed: [height, lowest, highest
// block-top level of the land around the corner] (see Generator). null = plain block terrain.
let ground = null;

// Is a vertex (chunk-local) on the ground surface, i.e. should it move to the measured height?
function onGround(x, y, z) {
  const o = (z * CORNERS + x) * 3;
  return y >= ground[o + 1] - 0.01 && y <= ground[o + 2] + 0.01;
}
const colTop = new Int16Array(PS * PS);
let mask = new Int32Array(CHUNK * 64);

// key: 1 | pass<<1 | sky<<2 | glow<<3 | low<<5 | ao0<<6 | ao1<<8 | ao2<<10 | ao3<<12 | layer<<14 | edited<<22
//      | (cell tag)<<23 for faces touching the ground surface, which keeps them from merging
// vertex flags: sky | glow<<1 | edited<<3
function emit(k, a, sgn, i, u0, v0, w, h) {
  let p = sgn > 0 ? i + 1 : i;
  if (a === 1 && (k >> 5) & 1) p -= DROP[(k >> 14) & 255];
  const flags = ((k >> 2) & 1) | (((k >> 3) & 3) << 1) | (((k >> 22) & 1) << 3);
  const buf = bufs[(k >> 1) & 1];
  pushQuad(buf, a, sgn, p, u0, v0, u0 + w, v0 + h, (k >> 14) & 255, flags,
    (k >> 6) & 3, (k >> 8) & 3, (k >> 10) & 3, (k >> 12) & 3);
  if (ground !== null && k >>> 23) {
    // settle the vertices that lie on the ground onto the measured surface
    const pos = buf.pos;
    for (let o = (buf.n - 1) * 12, end = o + 12; o < end; o += 3) {
      if (onGround(pos[o], pos[o + 1], pos[o + 2])) pos[o + 1] = ground[(pos[o + 2] * CORNERS + pos[o]) * 3];
    }
  }
}

// Axis-aligned quad on plane `p` of axis a (0 x, 1 y, 2 z) facing sgn, spanning (u0..u1, v0..v1).
// (u, v) = (z, y) for x faces, (x, z) for y faces, (x, y) for z faces.
export function pushQuad(buf, a, sgn, p, u0, v0, u1, v1, layer, flags, ao0, ao1, ao2, ao3) {
  if (buf.n === buf.cap) buf.grow();
  const q = buf.n++;
  const dir = a * 2 + (sgn > 0 ? 0 : 1);
  const pos = buf.pos, dat = buf.dat, idx = buf.idx;
  let o = q * 12;
  if (a === 0) {
    pos[o] = p; pos[o + 1] = v0; pos[o + 2] = u0;
    pos[o + 3] = p; pos[o + 4] = v0; pos[o + 5] = u1;
    pos[o + 6] = p; pos[o + 7] = v1; pos[o + 8] = u1;
    pos[o + 9] = p; pos[o + 10] = v1; pos[o + 11] = u0;
  } else if (a === 1) {
    pos[o] = u0; pos[o + 1] = p; pos[o + 2] = v0;
    pos[o + 3] = u1; pos[o + 4] = p; pos[o + 5] = v0;
    pos[o + 6] = u1; pos[o + 7] = p; pos[o + 8] = v1;
    pos[o + 9] = u0; pos[o + 10] = p; pos[o + 11] = v1;
  } else {
    pos[o] = u0; pos[o + 1] = v0; pos[o + 2] = p;
    pos[o + 3] = u1; pos[o + 4] = v0; pos[o + 5] = p;
    pos[o + 6] = u1; pos[o + 7] = v1; pos[o + 8] = p;
    pos[o + 9] = u0; pos[o + 10] = v1; pos[o + 11] = p;
  }
  o = q * 16;
  dat[o] = layer; dat[o + 1] = ao0; dat[o + 2] = flags; dat[o + 3] = dir;
  dat[o + 4] = layer; dat[o + 5] = ao1; dat[o + 6] = flags; dat[o + 7] = dir;
  dat[o + 8] = layer; dat[o + 9] = ao2; dat[o + 10] = flags; dat[o + 11] = dir;
  dat[o + 12] = layer; dat[o + 13] = ao3; dat[o + 14] = flags; dat[o + 15] = dir;
  // (u, v) winding faces -x, -y, +z; flip for the opposite side
  const flip = a === 2 ? sgn < 0 : sgn > 0;
  const b = q * 4;
  o = q * 6;
  // split along the diagonal that keeps the AO gradient symmetric
  if (ao0 + ao2 < ao1 + ao3) {
    idx[o] = b + 1; idx[o + 1] = flip ? b + 3 : b + 2; idx[o + 2] = flip ? b + 2 : b + 3;
    idx[o + 3] = b + 1; idx[o + 4] = flip ? b : b + 3; idx[o + 5] = flip ? b + 3 : b;
  } else {
    idx[o] = b; idx[o + 1] = flip ? b + 2 : b + 1; idx[o + 2] = flip ? b + 1 : b + 2;
    idx[o + 3] = b; idx[o + 4] = flip ? b + 3 : b + 2; idx[o + 5] = flip ? b + 2 : b + 3;
  }
}

// `edited` (optional, same layout as data) marks cells the player changed: faces of or next to them
// never take the street photo.
// `corners` (optional) holds measured ground heights: vertices on the ground move to them.
// -> [opaque, translucent], each { pos, dat, idx, quads }
export function meshChunk(data, H, edited = null, corners = null) {
  ground = corners;
  for (let c = 0; c < PS * PS; c++) {
    let y = H - 1;
    while (y > 0 && !SHADE[data[y * SY + c]]) y--;
    colTop[c] = y;
  }
  if (mask.length < CHUNK * H) mask = new Int32Array(CHUNK * H * 2);
  const base0 = SZ + SX;

  for (let a = 0; a < 3; a++) {
    const sA = a === 0 ? SX : a === 1 ? SY : SZ;
    const sU = a === 0 ? SZ : SX;
    const sV = a === 1 ? SZ : SY;
    const aLo = a === 1 ? 1 : 0, aHi = a === 1 ? H - 2 : CHUNK - 1;
    const vLo = a === 1 ? 0 : 1, vHi = a === 1 ? CHUNK - 1 : H - 2;
    const nV = vHi - vLo + 1;

    for (let sgn = 1; sgn >= -1; sgn -= 2) {
      const dir = a * 2 + (sgn > 0 ? 0 : 1);
      const tex = TEX_DIR[dir];
      const step = sgn * sA;
      for (let i = aLo; i <= aHi; i++) {
        let any = false;
        for (let v = 0; v < nV; v++) {
          let c = base0 + i * sA + (v + vLo) * sV;
          const row = v * CHUNK;
          for (let u = 0; u < CHUNK; u++, c += sU) {
            const b = data[c];
            let key = 0;
            if (b !== 0 && MODEL[b] === null) {
              const n = c + step;
              const nb = data[n];
              if (nb === 0 || (!OPAQUE[nb] && nb !== b)) {
                const yN = (n / SY) | 0;
                const sky = yN > colTop[n - yN * SY] ? 1 : 0;
                const pass = PASS[b];
                key = 1 | (pass << 1) | (sky << 2) | (GLOW[b] << 3) | (tex[b] << 14);
                // (a fill block put where the player dug keeps the photo: it mends what was broken)
                if (edited !== null && ((edited[c] && b !== B.FILL) | edited[n])) key |= 1 << 22;
                if (ground !== null) {
                  // the face's four vertices, in chunk coordinates
                  const p = sgn > 0 ? i + 1 : i, y0 = v + vLo;
                  const touch = a === 1
                    ? onGround(u, p, v) || onGround(u + 1, p, v) || onGround(u, p, v + 1) || onGround(u + 1, p, v + 1)
                    : a === 0
                      ? onGround(p, y0, u) || onGround(p, y0 + 1, u) || onGround(p, y0, u + 1) || onGround(p, y0 + 1, u + 1)
                      : onGround(u, y0, p) || onGround(u, y0 + 1, p) || onGround(u + 1, y0, p) || onGround(u + 1, y0 + 1, p);
                  if (touch) key |= ((u & 15) | ((v & 7) << 4) | 128) << 23;
                }
                if (pass) {
                  key |= 0xff << 6;
                  if (b === B.WATER && dir === 2) key |= 1 << 5;
                } else {
                  const s1 = SHADE[data[n - sU]], s2 = SHADE[data[n + sU]];
                  const t1 = SHADE[data[n - sV]], t2 = SHADE[data[n + sV]];
                  const a0 = s1 && t1 ? 0 : 3 - (s1 + t1 + SHADE[data[n - sU - sV]]);
                  const a1 = s2 && t1 ? 0 : 3 - (s2 + t1 + SHADE[data[n + sU - sV]]);
                  const a2 = s2 && t2 ? 0 : 3 - (s2 + t2 + SHADE[data[n + sU + sV]]);
                  const a3 = s1 && t2 ? 0 : 3 - (s1 + t2 + SHADE[data[n - sU + sV]]);
                  key |= (a0 << 6) | (a1 << 8) | (a2 << 10) | (a3 << 12);
                }
                any = true;
              }
            }
            mask[row + u] = key;
          }
        }
        if (!any) continue;

        for (let v = 0; v < nV; v++) {
          for (let u = 0; u < CHUNK; ) {
            const k = mask[v * CHUNK + u];
            if (!k) {
              u++;
              continue;
            }
            let w = 1;
            while (u + w < CHUNK && mask[v * CHUNK + u + w] === k) w++;
            let h = 1;
            grow: while (v + h < nV) {
              const r = (v + h) * CHUNK + u;
              for (let q = 0; q < w; q++) if (mask[r + q] !== k) break grow;
              h++;
            }
            for (let dv = 0; dv < h; dv++) {
              const r = (v + dv) * CHUNK + u;
              for (let q = 0; q < w; q++) mask[r + q] = 0;
            }
            emit(k, a, sgn, i, u, v + vLo, w, h);
            u += w;
          }
        }
      }
    }
  }
  // shaped blocks only ever come from the player
  if (edited !== null) meshModels(data, H);
  return [bufs[0].take(), bufs[1].take()];
}

// The shaped blocks (blocks.js): every box of each one, face by face. They are the player's own,
// so they never wear the photo; a face against an opaque neighbour is left out.
function meshModels(data, H) {
  for (let y = 1; y < H - 1; y++) {
    for (let z = 0; z < CHUNK; z++) {
      let c = (y * PS + z + 1) * PS + 1;
      for (let x = 0; x < CHUNK; x++, c++) {
        const b = data[c];
        if (b === 0 || MODEL[b] === null) continue;
        const m = MODEL[b];
        const boxes = m.byMask ? boxesOf(b, data[c - SZ], data[c + SX], data[c + SZ], data[c - SX]) : m.boxes;
        const flags = (y > colTop[(z + 1) * PS + x + 1] ? 1 : 0) | (GLOW[b] << 1) | 8;
        const buf = bufs[PASS[b]];
        for (let i = 0; i < boxes.length; i++) {
          const bx = boxes[i], t = bx[6] || m.tex;
          const x0 = x + bx[0], y0 = y + bx[1], z0 = z + bx[2], x1 = x + bx[3], y1 = y + bx[4], z1 = z + bx[5];
          // a box with no thickness one way is a sheet: both its faces, nothing else
          const flat = x0 === x1 ? 0 : y0 === y1 ? 1 : z0 === z1 ? 2 : -1;
          if (flat !== 1 && flat !== 2) {
            if (flat === 0 || bx[3] < 1 || !OPAQUE[data[c + SX]]) pushQuad(buf, 0, 1, x1, z0, y0, z1, y1, t[0], flags, 3, 3, 3, 3);
            if (flat === 0 || bx[0] > 0 || !OPAQUE[data[c - SX]]) pushQuad(buf, 0, -1, x0, z0, y0, z1, y1, t[1], flags, 3, 3, 3, 3);
          }
          if (flat !== 0 && flat !== 2) {
            if (flat === 1 || bx[4] < 1 || !OPAQUE[data[c + SY]]) pushQuad(buf, 1, 1, y1, x0, z0, x1, z1, t[2], flags, 3, 3, 3, 3);
            if (flat === 1 || bx[1] > 0 || !OPAQUE[data[c - SY]]) pushQuad(buf, 1, -1, y0, x0, z0, x1, z1, t[3], flags, 3, 3, 3, 3);
          }
          if (flat !== 0 && flat !== 1) {
            if (flat === 2 || bx[5] < 1 || !OPAQUE[data[c + SZ]]) pushQuad(buf, 2, 1, z1, x0, y0, x1, y1, t[4], flags, 3, 3, 3, 3);
            if (flat === 2 || bx[2] > 0 || !OPAQUE[data[c - SZ]]) pushQuad(buf, 2, -1, z0, x0, y0, x1, y1, t[5], flags, 3, 3, 3, 3);
          }
        }
      }
    }
  }
}
