// Main-thread chunk store: streams chunks from the worker, answers block queries, applies edits.
import * as THREE from 'three';
import { CHUNK, PAD, PS, MAX_Y, MIN_EDIT_Y, SEA_Y, FAR_TILE, FAR_RADIUS, chunkKey } from './config.js';
import { meshChunk } from './mesher.js';
import { B, SOLID, TOUCH, TEX_TOP, MODEL, boxesOf } from './blocks.js';
import { buildTextures } from './textures.js';

const SY = PS * PS;
const MAX_INFLIGHT = 14;
const MAX_FAR_INFLIGHT = 3;
const OLD_LIFT = SEA_Y - 16; // sea level was at y 16 when ':v1:' edits were saved

function ringOffsets(r) {
  const list = [];
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dz * dz;
      if (d <= r * r + r) list.push([dx, dz, d]);
    }
  }
  return list.sort((a, b) => a[2] - b[2]);
}

function meshGeometry(m, size, height) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setAttribute('aData', new THREE.BufferAttribute(m.dat, 4));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(size, height, size));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(size / 2, height / 2, size / 2), Math.hypot(size * 0.71, height / 2));
  return g;
}

const buildGeometry = (m, H) => (m.quads ? meshGeometry(m, CHUNK, H) : null);

export class World {
  constructor(scene, materials, storageKey) {
    this.scene = scene;
    this.materials = materials;
    this.chunks = new Map();
    this.inflight = new Set();
    this.failed = new Map();
    this.far = new Map(); // skyline tiles beyond the voxel chunks
    this.farInflight = new Set();
    this.farOffsets = ringOffsets(FAR_RADIUS);
    this.farCenter = [0, 0];
    this.lastFar = 0;
    this.perf = null;
    this.pos = [0, 0];
    this.version = 0; // bumps whenever the unedited geometry changes (panorama depth maps watch it)
    this.radius = 12;
    this.offsets = [];
    this.center = [0, 0];
    this.listeners = {};
    this.queries = new Map();
    this.queryId = 0;
    this.tilesLoading = 0;
    this.avg = buildTextures().avg;
    this.storageKey = storageKey;
    this.edits = new Map(); // chunkKey -> Map(localKey -> block id)
    // chunkKey -> Set(localKey): cells where something stands in the street photos that the map
    // data does not have (a parked car). They hold fill blocks and, unlike the player's changes,
    // count as what the street camera saw (see addBody).
    this.bodies = new Map();
    this.loadEdits();
    this.setRadius(this.radius);

    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => this.onMessage(ev.data);
    this.worker.onerror = (ev) => this.emit('error', ev.message || 'worker error');
  }

  on(name, fn) {
    this.listeners[name] = fn;
  }

  emit(name, arg) {
    if (this.listeners[name]) this.listeners[name](arg);
  }

  init(lon, lat, turn = 0) {
    this.worker.postMessage({ type: 'init', lon, lat, turn, photo: true });
  }

  setRadius(r) {
    this.radius = r;
    this.offsets = ringOffsets(r);
    this.prune();
  }

  onMessage(m) {
    // Results refill the request queue themselves, so streaming does not depend on the frame rate.
    if (m.type === 'chunk') {
      this.addChunk(m);
      this.update(this.pos[0], this.pos[1]);
    } else if (m.type === 'far') {
      this.addFar(m);
      this.update(this.pos[0], this.pos[1]);
    } else if (m.type === 'ready') {
      this.ready = true;
      this.emit('ready', m);
      this.update(this.pos[0], this.pos[1]);
    } else if (m.type === 'places') this.emit('places', m.places);
    else if (m.type === 'info' || m.type === 'ground' || m.type === 'aligned') {
      const cb = this.queries.get(m.id);
      this.queries.delete(m.id);
      if (cb) cb(m.type === 'info' ? m.info : m.type === 'ground' ? m.ys : m.result);
    } else if (m.type === 'error') {
      console.error('[worker]', m.message);
      if (m.cx !== undefined) {
        const key = chunkKey(m.cx, m.cz);
        this.inflight.delete(key);
        this.failed.set(key, performance.now() + 4000);
      }
      if (m.lx !== undefined) {
        const key = chunkKey(m.lx, m.lz);
        this.farInflight.delete(key);
        this.failed.set(-key, performance.now() + 8000);
      }
      this.emit('error', m.message);
    }
  }

  // ---- streaming

  update(x, z) {
    this.pos = [x, z];
    if (!this.ready) return;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    if (cx !== this.center[0] || cz !== this.center[1]) {
      this.center = [cx, cz];
      this.prune();
    }
    this.updateFar(x, z);
    if (this.inflight.size >= MAX_INFLIGHT) return;
    const now = performance.now();
    for (const [dx, dz] of this.offsets) {
      const key = chunkKey(cx + dx, cz + dz);
      if (this.chunks.has(key) || this.inflight.has(key)) continue;
      const retry = this.failed.get(key);
      if (retry && retry > now) continue;
      this.inflight.add(key);
      this.worker.postMessage({ type: 'gen', cx: cx + dx, cz: cz + dz });
      if (this.inflight.size >= MAX_INFLIGHT) break;
    }
  }

  updateFar(x, z) {
    const lx = Math.floor(x / FAR_TILE), lz = Math.floor(z / FAR_TILE);
    if (lx !== this.farCenter[0] || lz !== this.farCenter[1]) {
      this.farCenter = [lx, lz];
      for (const [key, t] of this.far) {
        if (Math.abs(t.lx - lx) > FAR_RADIUS + 1 || Math.abs(t.lz - lz) > FAR_RADIUS + 1) {
          this.scene.remove(t.mesh);
          t.mesh.geometry.dispose();
          this.far.delete(key);
          this.version++;
        }
      }
    }
    // Voxel chunks come first: while they are streaming, the skyline only gets a trickle.
    const now = performance.now();
    const busy = this.inflight.size > 3;
    if (this.farInflight.size >= (busy ? 1 : MAX_FAR_INFLIGHT)) return;
    if (busy && now - this.lastFar < 350) return;
    for (const [dx, dz] of this.farOffsets) {
      const key = chunkKey(lx + dx, lz + dz);
      if (this.far.has(key) || this.farInflight.has(key)) continue;
      const retry = this.failed.get(-key);
      if (retry && retry > now) continue;
      this.farInflight.add(key);
      this.lastFar = now;
      this.worker.postMessage({ type: 'far', lx: lx + dx, lz: lz + dz });
      if (busy || this.farInflight.size >= MAX_FAR_INFLIGHT) break;
    }
  }

  addFar(m) {
    const key = chunkKey(m.lx, m.lz);
    this.farInflight.delete(key);
    this.tilesLoading = m.loading;
    const [lx, lz] = this.farCenter;
    if (Math.abs(m.lx - lx) > FAR_RADIUS + 1 || Math.abs(m.lz - lz) > FAR_RADIUS + 1 || this.far.has(key)) return;
    const mesh = new THREE.Mesh(meshGeometry(m.mesh, FAR_TILE, m.mesh.maxY + 1), this.materials.far);
    mesh.position.set(m.lx * FAR_TILE, 0, m.lz * FAR_TILE);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);
    this.far.set(key, { lx: m.lx, lz: m.lz, mesh });
    this.version++;
  }

  // Radius (metres) around the player's chunk inside which every voxel chunk is loaded.
  loadedRadius() {
    const [cx, cz] = this.center;
    for (const [dx, dz, d] of this.offsets) {
      if (!this.chunks.has(chunkKey(cx + dx, cz + dz))) return Math.max(0, (Math.sqrt(d) - 1.5) * CHUNK);
    }
    return (this.radius - 1) * CHUNK;
  }

  // Hide what the clip ring would discard anyway: far tiles fully inside, chunks fully outside.
  cull(x, z, clip) {
    for (const t of this.far.values()) {
      const ax = Math.max(Math.abs(t.lx * FAR_TILE - x), Math.abs((t.lx + 1) * FAR_TILE - x));
      const az = Math.max(Math.abs(t.lz * FAR_TILE - z), Math.abs((t.lz + 1) * FAR_TILE - z));
      t.mesh.visible = ax * ax + az * az > clip * clip;
    }
    for (const ch of this.chunks.values()) {
      const x0 = ch.cx * CHUNK, z0 = ch.cz * CHUNK;
      const nx = x < x0 ? x0 - x : x > x0 + CHUNK ? x - x0 - CHUNK : 0;
      const nz = z < z0 ? z0 - z : z > z0 + CHUNK ? z - z0 - CHUNK : 0;
      const visible = nx * nx + nz * nz < clip * clip;
      if (ch.meshes[0]) ch.meshes[0].visible = visible;
      if (ch.meshes[1]) ch.meshes[1].visible = visible;
    }
  }

  // Fraction of the chunks within `r` of the centre that are loaded.
  progress(r) {
    let have = 0, want = 0;
    const [cx, cz] = this.center;
    for (const [dx, dz, d] of this.offsets) {
      if (d > r * r + r) break;
      want++;
      if (this.chunks.has(chunkKey(cx + dx, cz + dz))) have++;
    }
    return want ? have / want : 0;
  }

  prune() {
    const [cx, cz] = this.center;
    const lim = this.radius + 2;
    for (const [key, ch] of this.chunks) {
      if (Math.abs(ch.cx - cx) > lim || Math.abs(ch.cz - cz) > lim) {
        this.disposeMeshes(ch);
        this.disposeDepth(ch);
        this.chunks.delete(key);
        this.version++;
      }
    }
  }

  addChunk(m) {
    const key = chunkKey(m.cx, m.cz);
    this.inflight.delete(key);
    this.tilesLoading = m.loading;
    this.perf = m.perf;
    const lim = this.radius + 2;
    if (Math.abs(m.cx - this.center[0]) > lim || Math.abs(m.cz - this.center[1]) > lim) return;
    // orig: padded cell index -> block id before the player touched it; depth: meshes of the
    // untouched volume, drawn only into panorama depth maps
    // body: padded cell indices that `bodies` filled in
    // corners: measured ground heights at block corners (laser-scanned regions), else null
    const ch = { cx: m.cx, cz: m.cz, H: m.H, data: m.data, meshes: [null, null], map: null, orig: null, body: null, depth: null, corners: m.corners || null };
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = CHUNK;
    canvas.getContext('2d').putImageData(new ImageData(m.map, CHUNK, CHUNK), 0, 0);
    ch.map = canvas;
    this.chunks.set(key, ch);
    const bodied = this.applyBodies(ch); // first: the player's changes lie on top of them
    if (this.applyEdits(ch) || bodied) this.remesh(ch);
    else this.setMeshes(ch, m.opaque, m.trans);
    this.version++;
    this.emit('chunk', ch);
  }

  setMeshes(ch, opaque, trans) {
    this.disposeMeshes(ch);
    const mats = [this.materials.opaque, this.materials.trans];
    [opaque, trans].forEach((m, i) => {
      const geo = buildGeometry(m, ch.H);
      if (!geo) return;
      const mesh = new THREE.Mesh(geo, mats[i]);
      mesh.position.set(ch.cx * CHUNK, 0, ch.cz * CHUNK);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.renderOrder = i;
      this.scene.add(mesh);
      ch.meshes[i] = mesh;
    });
  }

  disposeMeshes(ch) {
    for (let i = 0; i < 2; i++) {
      const mesh = ch.meshes[i];
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      ch.meshes[i] = null;
    }
  }

  disposeDepth(ch) {
    if (!ch.depth) return;
    for (const mesh of ch.depth) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    ch.depth = null;
  }

  remesh(ch) {
    this.disposeDepth(ch);
    let edited = null;
    if (ch.orig && ch.orig.size) {
      edited = new Uint8Array(ch.data.length);
      const before = ch.data.slice();
      for (const [i, id] of ch.orig) {
        edited[i] = 1;
        before[i] = id;
      }
      // what the street camera saw: the chunk without the player's changes
      ch.depth = meshChunk(before, ch.H, null, ch.corners).map((m) => {
        const geo = buildGeometry(m, ch.H);
        if (!geo) return null;
        const mesh = new THREE.Mesh(geo, this.materials.depthNear);
        mesh.position.set(ch.cx * CHUNK, 0, ch.cz * CHUNK);
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.visible = false;
        this.scene.add(mesh);
        return mesh;
      });
    }
    const [opaque, trans] = meshChunk(ch.data, ch.H, edited, ch.corners);
    this.setMeshes(ch, opaque, trans);
    // no version bump: edits never change what the street camera saw
  }

  // Swap every world mesh to distance materials for a panorama depth render; returns the undo.
  beginDepthPass() {
    const { depthNear, depthFar } = this.materials;
    const saved = [];
    const show = (mesh, mat) => {
      saved.push([mesh, mesh.material, mesh.visible]);
      mesh.material = mat;
      mesh.visible = true;
    };
    for (const ch of this.chunks.values()) {
      if (ch.depth) {
        for (const mesh of ch.meshes) {
          if (!mesh) continue;
          saved.push([mesh, mesh.material, mesh.visible]);
          mesh.visible = false;
        }
        for (const mesh of ch.depth) if (mesh) show(mesh, depthNear);
      } else {
        for (const mesh of ch.meshes) if (mesh) show(mesh, depthNear);
      }
    }
    for (const t of this.far.values()) show(t.mesh, depthFar);
    return () => {
      for (const [mesh, mat, vis] of saved) {
        mesh.material = mat;
        mesh.visible = vis;
      }
    };
  }

  // ---- block access (integer world coordinates)

  chunkAt(x, z) {
    return this.chunks.get(chunkKey(x >> 4, z >> 4));
  }

  isLoaded(x, z) {
    return this.chunks.has(chunkKey(Math.floor(x) >> 4, Math.floor(z) >> 4));
  }

  getBlock(x, y, z) {
    const ch = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!ch || y < 0 || y >= ch.H) return 0;
    return ch.data[(y * PS + (z & 15) + PAD) * PS + (x & 15) + PAD];
  }

  topY(x, z) {
    const ch = this.chunkAt(x, z);
    if (!ch) return 0;
    const col = ((z & 15) + PAD) * PS + (x & 15) + PAD;
    let y = ch.H - 1;
    while (y > 0 && !SOLID[ch.data[y * SY + col]]) y--;
    return y;
  }

  // How far the drawn ground is above (+) or below (-) the block row the player stands on at a
  // position. Zero where the terrain is plain blocks or the player is on something else.
  groundDelta(x, y, z) {
    const fx = Math.floor(x), fz = Math.floor(z);
    const ch = this.chunks.get(chunkKey(fx >> 4, fz >> 4));
    if (!ch || !ch.corners) return 0;
    const c = ch.corners, n = CHUNK + 1;
    const lx = fx & 15, lz = fz & 15, tx = x - fx, tz = z - fz;
    const at = (i, j) => {
      const o = ((lz + j) * n + lx + i) * 3;
      return y >= c[o + 1] - 0.01 && y <= c[o + 2] + 0.01 ? c[o] - y : NaN;
    };
    const a = at(0, 0), b = at(1, 0), d = at(0, 1), e = at(1, 1);
    if (a !== a || b !== b || d !== d || e !== e) return 0;
    return a * (1 - tx) * (1 - tz) + b * tx * (1 - tz) + d * (1 - tx) * tz + e * tx * tz;
  }

  // Make room for a block at height y: a chunk's volume ends just above its highest block.
  reach(ch, y) {
    if (y + 3 <= ch.H) return;
    const H = Math.min(MAX_Y, y + 8);
    const data = new Uint8Array(H * SY);
    data.set(ch.data);
    ch.data = data;
    ch.H = H;
  }

  writeLocal(ch, px, y, pz, id) {
    this.reach(ch, y);
    const i = (y * PS + pz) * PS + px;
    if (!ch.orig) ch.orig = new Map();
    if (!ch.orig.has(i)) ch.orig.set(i, ch.data[i]);
    ch.data[i] = id;
  }

  setBlock(x, y, z, id) {
    if (y < MIN_EDIT_Y || y >= MAX_Y - 3) return false;
    const cx = x >> 4, cz = z >> 4;
    const own = this.chunks.get(chunkKey(cx, cz));
    if (!own) return false;
    const key = chunkKey(cx, cz);
    let m = this.edits.get(key);
    if (!m) this.edits.set(key, (m = new Map()));
    m.set(((y * CHUNK + (z & 15)) * CHUNK) + (x & 15), id);
    this.saveEditsSoon();
    // the block also lives in the padded border of up to three neighbours
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ch = this.chunks.get(chunkKey(cx + dx, cz + dz));
        if (!ch) continue;
        const px = x - (cx + dx) * CHUNK + PAD, pz = z - (cz + dz) * CHUNK + PAD;
        if (px < 0 || px >= PS || pz < 0 || pz >= PS) continue;
        this.writeLocal(ch, px, y, pz, id);
        this.remesh(ch);
      }
    }
    this.updateMapPixel(own, x & 15, z & 15);
    return true;
  }

  // Apply many edits ([x, y, z, id] each) and rebuild every touched chunk once.
  setBlocks(list) {
    const dirty = new Set();
    for (const [x, y, z, id] of list) {
      if (y < MIN_EDIT_Y || y >= MAX_Y - 3) continue;
      const cx = x >> 4, cz = z >> 4;
      const own = this.chunks.get(chunkKey(cx, cz));
      if (!own) continue;
      const key = chunkKey(cx, cz);
      let m = this.edits.get(key);
      if (!m) this.edits.set(key, (m = new Map()));
      m.set(((y * CHUNK + (z & 15)) * CHUNK) + (x & 15), id);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ch = this.chunks.get(chunkKey(cx + dx, cz + dz));
          if (!ch) continue;
          const px = x - (cx + dx) * CHUNK + PAD, pz = z - (cz + dz) * CHUNK + PAD;
          if (px < 0 || px >= PS || pz < 0 || pz >= PS) continue;
          this.writeLocal(ch, px, y, pz, id);
          dirty.add(ch);
        }
      }
      this.updateMapPixel(own, x & 15, z & 15);
    }
    for (const ch of dirty) this.remesh(ch);
    this.saveEditsSoon();
  }

  // ---- bodies. A car in a street photo is paint on whatever lies behind it. A body is a box of
  // fill blocks where it stands, and it belongs to the world the street camera saw rather than
  // to the player's changes: it wears the photo, the surfaces behind it do not (the camera never
  // saw them), and a block broken out of it leaves a hole in the car, not in the road beyond.

  // The chunks that hold column (x, z): its own and, in their padded borders, up to three
  // neighbours. fn(chunk, padded x, padded z)
  copies(x, z, fn) {
    const cx = x >> 4, cz = z >> 4;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ch = this.chunks.get(chunkKey(cx + dx, cz + dz));
        if (!ch) continue;
        const px = x - ch.cx * CHUNK + PAD, pz = z - ch.cz * CHUNK + PAD;
        if (px >= 0 && px < PS && pz >= 0 && pz < PS) fn(ch, px, pz);
      }
    }
  }

  putBody(ch, px, y, pz) {
    this.reach(ch, y);
    const i = (y * PS + pz) * PS + px;
    if (ch.data[i] !== B.AIR) return; // the map data has something there now
    ch.data[i] = B.FILL;
    if (!ch.body) ch.body = new Set();
    ch.body.add(i);
  }

  applyBodies(ch) {
    let changed = false;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const set = this.bodies.get(chunkKey(ch.cx + dx, ch.cz + dz));
        if (!set) continue;
        for (const k of set) {
          const px = (k & 15) + dx * CHUNK + PAD, pz = ((k >> 4) & 15) + dz * CHUNK + PAD;
          if (px < 0 || px >= PS || pz < 0 || pz >= PS) continue;
          this.putBody(ch, px, k >> 8, pz);
          changed = true;
        }
      }
    }
    return changed;
  }

  bodiesChanged(dirty) {
    for (const ch of dirty) this.remesh(ch);
    this.version++; // what the street camera saw is not what it was
    this.saveEditsSoon();
  }

  isBody(x, y, z) {
    const set = this.bodies.get(chunkKey(x >> 4, z >> 4));
    return !!set && set.has(((y * CHUNK + (z & 15)) * CHUNK) + (x & 15));
  }

  // Put a body into the cells of `list` ([x, y, z] each) that are open air and that the player
  // has not touched. Returns how many cells took one.
  addBody(list) {
    const dirty = new Set();
    let n = 0;
    for (const [x, y, z] of list) {
      if (y < MIN_EDIT_Y || y >= MAX_Y - 3) continue;
      const key = chunkKey(x >> 4, z >> 4), own = this.chunks.get(key);
      if (!own || this.getBlock(x, y, z) !== B.AIR) continue;
      if (own.orig && own.orig.has((y * PS + (z & 15) + PAD) * PS + (x & 15) + PAD)) continue;
      let set = this.bodies.get(key);
      if (!set) this.bodies.set(key, (set = new Set()));
      set.add(((y * CHUNK + (z & 15)) * CHUNK) + (x & 15));
      this.copies(x, z, (ch, px, pz) => {
        this.putBody(ch, px, y, pz);
        dirty.add(ch);
      });
      this.updateMapPixel(own, x & 15, z & 15);
      n++;
    }
    if (n) this.bodiesChanged(dirty);
    return n;
  }

  // Take away the body that cell (x, y, z) is part of: every body cell joined to it becomes
  // the open air the map data has there. A hole the player broke into it is no change any more;
  // a block the player put into such a hole stays. Returns how many cells went.
  removeBody(x, y, z) {
    if (!this.isBody(x, y, z)) return 0;
    const dirty = new Set(), stack = [[x, y, z]];
    let n = 0;
    while (stack.length) {
      const [bx, by, bz] = stack.pop();
      const key = chunkKey(bx >> 4, bz >> 4), k = ((by * CHUNK + (bz & 15)) * CHUNK) + (bx & 15);
      const set = this.bodies.get(key);
      if (!set || !set.delete(k)) continue;
      if (!set.size) this.bodies.delete(key);
      n++;
      const m = this.edits.get(key);
      if (m && m.get(k) === B.AIR) {
        m.delete(k);
        if (!m.size) this.edits.delete(key);
      }
      this.copies(bx, bz, (ch, px, pz) => {
        const i = (by * PS + pz) * PS + px;
        if (ch.body) ch.body.delete(i);
        if (ch.orig && ch.orig.has(i)) {
          if (ch.data[i] === B.AIR) ch.orig.delete(i);
          else ch.orig.set(i, B.AIR);
        } else if (by < ch.H) ch.data[i] = B.AIR;
        dirty.add(ch);
      });
      const own = this.chunks.get(key);
      if (own) this.updateMapPixel(own, bx & 15, bz & 15);
      stack.push([bx + 1, by, bz], [bx - 1, by, bz], [bx, by + 1, bz], [bx, by - 1, bz], [bx, by, bz + 1], [bx, by, bz - 1]);
    }
    this.bodiesChanged(dirty);
    return n;
  }

  applyEdits(ch) {
    let changed = false;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const m = this.edits.get(chunkKey(ch.cx + dx, ch.cz + dz));
        if (!m) continue;
        for (const [k, id] of m) {
          const px = (k & 15) + dx * CHUNK + PAD, pz = ((k >> 4) & 15) + dz * CHUNK + PAD;
          if (px < 0 || px >= PS || pz < 0 || pz >= PS) continue;
          this.writeLocal(ch, px, k >> 8, pz, id);
          changed = true;
        }
      }
    }
    return changed;
  }

  updateMapPixel(ch, lx, lz) {
    const col = (lz + PAD) * PS + lx + PAD;
    let y = ch.H - 1;
    while (y > 0 && ch.data[y * SY + col] === 0) y--;
    const l = TEX_TOP[ch.data[y * SY + col]] * 3;
    const ctx = ch.map.getContext('2d');
    ctx.fillStyle = `rgb(${this.avg[l]},${this.avg[l + 1]},${this.avg[l + 2]})`;
    ctx.fillRect(lx, lz, 1, 1);
  }

  // The boxes of the shaped block `id` in cell (x, y, z), in block units from the cell's corner:
  // what is drawn and stood on, or (`grip`) what a look or a click takes hold of, which for the
  // thin ones is a little more.
  boxesAt(x, y, z, id, grip = false) {
    const m = MODEL[id];
    if (grip && m.sel) return m.sel;
    return m.byMask ? boxesOf(id, this.getBlock(x, y, z - 1), this.getBlock(x + 1, y, z), this.getBlock(x, y, z + 1), this.getBlock(x - 1, y, z)) : m.boxes;
  }

  // Where a ray meets the shaped block in a cell: the nearest of its boxes, or null if the ray
  // passes between them.
  rayModel(id, x, y, z, ox, oy, oz, dx, dy, dz) {
    const o = [ox - x, oy - y, oz - z], d = [dx, dy, dz];
    let best = null;
    for (const b of this.boxesAt(x, y, z, id, true)) {
      let t0 = -Infinity, t1 = Infinity, axis = 1, sign = 1;
      for (let a = 0; a < 3 && t0 <= t1; a++) {
        if (Math.abs(d[a]) < 1e-9) {
          if (o[a] < b[a] || o[a] > b[a + 3]) t0 = Infinity; // runs alongside, outside
          continue;
        }
        let near = (b[a] - o[a]) / d[a], far = (b[a + 3] - o[a]) / d[a];
        if (near > far) [near, far] = [far, near];
        if (near > t0) {
          t0 = near;
          axis = a;
          sign = d[a] > 0 ? -1 : 1;
        }
        if (far < t1) t1 = far;
      }
      if (t0 > t1 || t1 < 0) continue;
      const t = Math.max(t0, 0);
      if (!best || t < best.t) best = { x, y, z, nx: axis === 0 ? sign : 0, ny: axis === 1 ? sign : 0, nz: axis === 2 ? sign : 0, id, t };
    }
    return best;
  }

  // Voxel traversal. Returns the first solid block hit and the face normal.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tx = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tdx : Infinity;
    let ty = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tdy : Infinity;
    let tz = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    while (t <= maxDist) {
      const id = this.getBlock(x, y, z);
      if (TOUCH[id]) {
        if (MODEL[id] === null) return { x, y, z, nx, ny, nz, id, t };
        const hit = this.rayModel(id, x, y, z, ox, oy, oz, dx, dy, dz);
        if (hit && hit.t <= maxDist) return hit;
      }
      if (tx < ty && tx < tz) {
        x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0;
      } else if (ty < tz) {
        y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0;
      } else {
        z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz;
      }
    }
    return null;
  }

  // Terrain surface y under a flat list of [x, z] points -> Float32Array
  groundY(pts) {
    return new Promise((resolve) => {
      const id = ++this.queryId;
      this.queries.set(id, resolve);
      this.worker.postMessage({ type: 'ground', id, pts });
    });
  }

  // Match a panorama's skyline against the city model -> { dx, dz, heading, confident, ... }
  alignPano(req) {
    return new Promise((resolve) => {
      const id = ++this.queryId;
      this.queries.set(id, resolve);
      this.worker.postMessage({ type: 'align', id, ...req });
    });
  }

  queryBuilding(x, z) {
    return new Promise((resolve) => {
      const id = ++this.queryId;
      this.queries.set(id, resolve);
      this.worker.postMessage({ type: 'query', id, x, z });
    });
  }

  // ---- edit persistence

  loadEdits() {
    try {
      let raw = localStorage.getItem(this.storageKey);
      let lift = 0;
      if (!raw) {
        // saved before the ground was deepened: every level sits OLD_LIFT blocks higher now
        const old = this.storageKey.replace(':v2:', ':v1:');
        raw = localStorage.getItem(old);
        if (!raw) return;
        lift = OLD_LIFT * CHUNK * CHUNK;
        localStorage.removeItem(old);
      }
      // per chunk: [key, changes, body cells (left out when there are none)]
      for (const [key, list, body] of JSON.parse(raw)) {
        if (list.length) this.edits.set(key, new Map(lift ? list.map(([k, id]) => [k + lift, id]) : list));
        if (body && body.length) this.bodies.set(key, new Set(body));
      }
      if (lift) this.saveEditsSoon();
    } catch (e) {
      console.warn('could not load saved edits', e);
    }
  }

  saveEditsSoon() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        const out = [];
        for (const key of new Set([...this.edits.keys(), ...this.bodies.keys()])) {
          const m = this.edits.get(key), body = this.bodies.get(key);
          out.push(body ? [key, m ? [...m] : [], [...body]] : [key, [...m]]);
        }
        if (out.length) localStorage.setItem(this.storageKey, JSON.stringify(out));
        else localStorage.removeItem(this.storageKey);
      } catch (e) {
        console.warn('could not save edits', e);
      }
    }, 800);
  }

  // Cells the player changed, bodies they pointed out included.
  editCount() {
    let n = 0;
    for (const m of this.edits.values()) n += m.size;
    for (const set of this.bodies.values()) n += set.size;
    return n;
  }

  // Undo every edit: the loaded chunks go back to what the map data gave them, and the saved
  // changes of this place are forgotten.
  resetEdits() {
    clearTimeout(this.saveTimer);
    const bodies = this.bodies.size > 0;
    this.edits.clear();
    this.bodies.clear();
    localStorage.removeItem(this.storageKey);
    for (const ch of this.chunks.values()) {
      if (!(ch.orig && ch.orig.size) && !(ch.body && ch.body.size)) continue;
      const cells = [...(ch.orig ? ch.orig.keys() : []), ...(ch.body || [])];
      if (ch.orig) for (const [i, id] of ch.orig) ch.data[i] = id;
      if (ch.body) for (const i of ch.body) ch.data[i] = B.AIR;
      ch.orig = null;
      ch.body = null;
      this.remesh(ch);
      // the map tile: repaint the columns that had changed
      for (const i of cells) {
        const px = i % PS, pz = Math.floor(i / PS) % PS;
        if (px >= PAD && px < PS - PAD && pz >= PAD && pz < PS - PAD) this.updateMapPixel(ch, px - PAD, pz - PAD);
      }
    }
    if (bodies) this.version++;
  }
}
