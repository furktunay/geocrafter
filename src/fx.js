// Things that happen in the world for a moment: lit TNT, explosions, flying debris.
import * as THREE from 'three';
import { B, SOLID, BLASTPROOF, MATE, TEX_TOP, TEX_SIDE, TEX_BOTTOM } from './blocks.js';
import { buildTextures } from './textures.js';
import { layerCanvas } from './items.js';

const MAX = 700;
const GRAVITY = 22;
const BLAST = 4.3; // TNT crater radius in blocks

export class Effects {
  // hooks: onExplode({ x, y, z, blocks, power }), onFuse(seconds)
  constructor(scene, world, hooks = {}) {
    this.group = new THREE.Group(); // everything here is momentary: kept out of the photo depth maps
    scene.add(this.group);
    this.world = world;
    this.hooks = hooks;
    this.avg = buildTextures().avg;

    this.cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), MAX);
    this.cubes.count = 0;
    this.cubes.frustumCulled = false;
    this.cubes.setColorAt(0, new THREE.Color(1, 1, 1));
    this.group.add(this.cubes);
    this.parts = [];

    this.flashes = [];
    this.primed = [];
    const tex = (layer) => {
      const t = new THREE.CanvasTexture(layerCanvas(layer));
      t.magFilter = t.minFilter = THREE.NearestFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshBasicMaterial({ map: t });
    };
    const side = tex(TEX_SIDE[B.TNT]);
    this.tntMaterials = [side, side, tex(TEX_TOP[B.TNT]), tex(TEX_BOTTOM[B.TNT]), side, side];
    this.tntGeometry = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
  }

  colorOf(id) {
    const l = TEX_SIDE[id] * 3;
    return [this.avg[l] / 255, this.avg[l + 1] / 255, this.avg[l + 2] / 255];
  }

  // n flying cubes from a point
  burst(x, y, z, color, n, speed, size = 0.16, life = 1.3, rise = 0) {
    for (let i = 0; i < n && this.parts.length < MAX; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.3 - 0.2;
      const v = speed * (0.35 + Math.random() * 0.65);
      const k = 0.75 + Math.random() * 0.4;
      this.parts.push({
        x, y, z,
        vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(e) * v + rise, vz: Math.sin(a) * Math.cos(e) * v,
        life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8),
        r: color[0] * k, g: color[1] * k, b: color[2] * k, float: rise > 0,
      });
    }
  }

  sparks(x, y, z) {
    this.burst(x, y, z, [1, 0.82, 0.3], 10, 2.6, 0.06, 0.4);
  }

  // A lit TNT block: hops, blinks, then goes off.
  prime(x, y, z, fuse = 4) {
    const mesh = new THREE.Mesh(this.tntGeometry, this.tntMaterials);
    const glow = new THREE.Mesh(this.tntGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    glow.scale.setScalar(1.02);
    mesh.add(glow);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.group.add(mesh);
    this.primed.push({ mesh, glow, vy: 4.2, fuse, age: 0 });
    if (this.hooks.onFuse) this.hooks.onFuse(fuse);
  }

  ignite(x, y, z, fuse = 4) {
    if (this.world.getBlock(x, y, z) !== B.TNT) return false;
    this.world.setBlock(x, y, z, B.AIR);
    this.prime(x, y, z, fuse);
    return true;
  }

  explode(cx, cy, cz, power = BLAST) {
    const w = this.world;
    const edits = [];
    const chain = [];
    const samples = [];
    const R = Math.ceil(power) + 1;
    const bx = Math.floor(cx), by = Math.floor(cy), bz = Math.floor(cz);
    for (let dy = -R; dy <= R; dy++) {
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.hypot(dx, dy * 1.15, dz);
          if (d > power - 0.9 + Math.random() * 1.2) continue; // ragged edge
          const x = bx + dx, y = by + dy, z = bz + dz;
          const id = w.getBlock(x, y, z);
          if (!id || BLASTPROOF.has(id)) continue;
          edits.push([x, y, z, B.AIR]);
          // half a door or a bed does not outlive the other half
          const m = MATE[id];
          if (m && w.getBlock(x + m[0], y + m[1], z + m[2]) === m[3]) edits.push([x + m[0], y + m[1], z + m[2], B.AIR]);
          if (id === B.TNT) chain.push([x, y, z]);
          else if (samples.length < 40 && Math.random() < 0.25) samples.push([x, y, z, id]);
        }
      }
    }
    w.setBlocks(edits);
    for (const [x, y, z] of chain) this.prime(x, y, z, 0.35 + Math.random() * 0.9);

    this.flashes.push({ mesh: this.flashMesh(cx, cy, cz), age: 0, power });
    for (const [x, y, z, id] of samples) this.burst(x + 0.5, y + 0.5, z + 0.5, this.colorOf(id), 3, 13, 0.24, 1.6);
    this.burst(cx, cy, cz, [1, 0.72, 0.25], 40, 16, 0.14, 0.5);
    this.burst(cx, cy, cz, [0.32, 0.32, 0.33], 46, 4.5, 0.55, 2.6, 2.4); // smoke
    if (this.hooks.onExplode) this.hooks.onExplode({ x: cx, y: cy, z: cz, blocks: edits.length, power, cells: edits });
  }

  flashMesh(x, y, z) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    return mesh;
  }

  update(dt) {
    const w = this.world;
    // lit TNT
    for (let i = this.primed.length - 1; i >= 0; i--) {
      const t = this.primed[i];
      t.age += dt;
      t.vy -= GRAVITY * dt;
      const p = t.mesh.position;
      let ny = p.y + t.vy * dt;
      if (t.vy < 0 && SOLID[w.getBlock(Math.floor(p.x), Math.floor(ny - 0.5), Math.floor(p.z))]) {
        ny = Math.floor(ny - 0.5) + 1.5;
        t.vy = 0;
      }
      p.y = ny;
      const left = t.fuse - t.age;
      t.glow.material.opacity = Math.floor(t.age / (left < 1 ? 0.1 : 0.22)) % 2 ? 0.6 : 0;
      t.mesh.scale.setScalar(left < 0.35 ? 1 + (0.35 - left) * 0.8 : 1);
      if (left <= 0) {
        this.group.remove(t.mesh);
        t.glow.material.dispose();
        this.primed.splice(i, 1);
        this.explode(p.x, p.y, p.z);
      }
    }
    // fireballs
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += dt;
      const k = f.age / 0.32;
      f.mesh.scale.setScalar(1 + k * f.power * 1.25);
      f.mesh.material.opacity = Math.max(0, 0.95 * (1 - k));
      if (k >= 1) {
        this.group.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mesh.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
    // debris and smoke
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      if (p.float) {
        p.vx *= 1 - dt * 1.6;
        p.vz *= 1 - dt * 1.6;
        p.vy += (1.1 - p.vy) * dt * 1.2;
      } else p.vy -= GRAVITY * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (!p.float && SOLID[w.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz))]) {
        p.vy = Math.abs(p.vy) * 0.3;
        p.vx *= 0.5;
        p.vz *= 0.5;
        if (p.vy < 0.8) p.life = Math.min(p.life, 0.35);
      } else {
        p.x = nx;
        p.y = ny;
        p.z = nz;
      }
    }
    for (const p of this.parts) {
      const s = p.size * (p.float ? 1 + (1 - Math.min(1, p.life)) * 0.6 : Math.min(1, p.life * 3));
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.set(s, s, s));
      this.cubes.setMatrixAt(n, this.m);
      this.cubes.setColorAt(n, this.c.setRGB(p.r, p.g, p.b, THREE.SRGBColorSpace));
      n++;
    }
    this.cubes.count = n;
    this.cubes.instanceMatrix.needsUpdate = true;
    if (this.cubes.instanceColor) this.cubes.instanceColor.needsUpdate = true;
  }

  busy() {
    return this.primed.length > 0 || this.flashes.length > 0 || this.parts.length > 0;
  }
}
