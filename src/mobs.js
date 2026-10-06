// Skeleton archers and every arrow in flight (theirs and the player's). The skeleton is the
// game's own: the bones of a road worker, hard hat still on. It keeps its distance and shoots.
import * as THREE from 'three';
import { SOLID } from './blocks.js';

const SPEED = 2.6;
const GRAVITY = 24;
const JUMP = 7.5;
const HP = 20;
const MAX = 6;
const HALF = 0.28; // half width of the body
const HEIGHT = 1.9;
const SIGHT = 22; // how far it sees and shoots
const NEAR = 6, FAR = 11; // the band of distance it likes to shoot from
const ARROW_SPEED = 28;
const ARROW_GRAVITY = 20;
const BONE = ['#dcdcd2', '#cfcfc4', '#e6e6dc', '#c4c4b8', '#dcdcd2', '#d4d4c8', '#e0e0d6'];
const DARK = '#2c2c2a';
const Zp = new THREE.Vector3(0, 0, 1);

function texture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = BONE[(x * 5 + y * 11 + x * y * 3) % 7];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  if (draw) draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The face: two sockets, a nose gap, a row of teeth.
function skull(ctx) {
  ctx.fillStyle = DARK;
  ctx.fillRect(1, 3, 2, 2);
  ctx.fillRect(5, 3, 2, 2);
  ctx.fillRect(3, 5, 2, 1);
  for (let x = 1; x < 7; x += 2) ctx.fillRect(x, 7, 1, 1);
}

// The chest: a spine with ribs either side.
function ribs(ctx) {
  ctx.fillStyle = DARK;
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillStyle = BONE[0];
  ctx.fillRect(3, 0, 2, 8);
  for (let y = 0; y < 8; y += 2) ctx.fillRect(0, y, 8, 1);
}

let shared = null;
function parts() {
  if (!shared) {
    shared = {
      bone: texture(),
      skull: texture(skull),
      ribs: texture(ribs),
      head: new THREE.BoxGeometry(0.44, 0.44, 0.44),
      hat: new THREE.BoxGeometry(0.5, 0.14, 0.5),
      brim: new THREE.BoxGeometry(0.56, 0.04, 0.62),
      chest: new THREE.BoxGeometry(0.42, 0.62, 0.2),
      limb: new THREE.BoxGeometry(0.12, 0.7, 0.12),
      stave: new THREE.BoxGeometry(0.05, 0.3, 0.05),
      // an arrow lies along +z, point first
      shaft: new THREE.BoxGeometry(0.045, 0.045, 0.7),
      point: new THREE.BoxGeometry(0.08, 0.08, 0.1),
      vane: new THREE.BoxGeometry(0.16, 0.02, 0.16),
      wood: new THREE.MeshBasicMaterial({ color: 0x8a5a2b }),
      iron: new THREE.MeshBasicMaterial({ color: 0x9aa2a9 }),
      feather: new THREE.MeshBasicMaterial({ color: 0xe9e9e2 }),
      yellow: new THREE.MeshBasicMaterial({ color: 0xf2c21a }),
    };
  }
  return shared;
}

export class Mobs {
  // hooks: onShoot(x, y, z), onStruck(damage, dx, dz) - an arrow hit the player,
  //        onThud(x, y, z) - an arrow stuck in something, onDeath(x, y, z)
  constructor(scene, world, hooks = {}) {
    this.world = world;
    this.hooks = hooks;
    this.group = new THREE.Group(); // kept out of the photo depth maps
    scene.add(this.group);
    this.list = [];
    this.arrows = [];
    this.v = new THREE.Vector3();
  }

  // Body box against the blocks, feet at (x, y, z).
  free(x, y, z) {
    const w = this.world;
    for (const h of [0.05, 0.95, HEIGHT - 0.05]) {
      const by = Math.floor(y + h);
      for (const dx of [-HALF, HALF]) {
        for (const dz of [-HALF, HALF]) if (SOLID[w.getBlock(Math.floor(x + dx), by, Math.floor(z + dz))]) return false;
      }
    }
    return true;
  }

  // Feet on the floor of block cell (bx, by, bz). False when there is no room (or too many).
  spawn(bx, by, bz) {
    if (this.list.length >= MAX || !this.free(bx + 0.5, by, bz + 0.5)) return false;
    const p = parts();
    const bone = new THREE.MeshBasicMaterial({ map: p.bone });
    const face = new THREE.MeshBasicMaterial({ map: p.skull });
    const chest = new THREE.MeshBasicMaterial({ map: p.ribs });
    const mesh = new THREE.Group();
    const add = (geometry, materials, x, y, z, parent = mesh) => {
      const m = new THREE.Mesh(geometry, materials);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    add(p.head, [bone, bone, bone, bone, face, bone], 0, 1.56, 0);
    add(p.hat, p.yellow, 0, 1.83, 0);
    add(p.brim, p.yellow, 0, 1.77, 0.04);
    add(p.chest, [bone, bone, bone, bone, chest, chest], 0, 1.03, 0);
    // limbs hang from a joint at their upper end
    const joint = (x, y) => {
      const g = new THREE.Group();
      g.position.set(x, y, 0);
      add(p.limb, bone, 0, -0.35, 0, g);
      mesh.add(g);
      return g;
    };
    const legs = [joint(-0.11, 0.72), joint(0.11, 0.72)];
    const arms = [joint(-0.28, 1.3), joint(0.28, 1.3)];
    arms[0].rotation.x = -1.45; // the bow arm, held out
    arms[1].rotation.x = -1.2;
    // a bow in the outstretched hand: three short pieces, bent
    const bow = new THREE.Group();
    bow.position.set(0, -0.7, 0);
    bow.rotation.x = 1.45;
    add(p.stave, p.wood, 0, 0, 0.05, bow);
    add(p.stave, p.wood, 0, 0.27, -0.01, bow).rotation.x = 0.4;
    add(p.stave, p.wood, 0, -0.27, -0.01, bow).rotation.x = -0.4;
    arms[0].add(bow);
    this.group.add(mesh);
    this.list.push({ x: bx + 0.5, y: by, z: bz + 0.5, vy: 0, ground: false, hp: HP, cool: 2.5, hurt: 0, knock: 0, kx: 0, kz: 0, age: 0, walk: 0, side: Math.random() < 0.5 ? 1 : -1, mesh, legs, arms, mats: [bone, face, chest] });
    return true;
  }

  remove(i) {
    const m = this.list[i];
    this.group.remove(m.mesh);
    m.mats.forEach((mat) => mat.dispose());
    this.list.splice(i, 1);
  }

  // Nearest skeleton hit by a ray (unit direction as [x, y, z]) within maxT: { mob, t } or null.
  pick(o, d, maxT) {
    let best = null;
    for (const m of this.list) {
      let t0 = 0, t1 = maxT;
      const lo = [m.x - HALF - 0.08, m.y, m.z - HALF - 0.08], hi = [m.x + HALF + 0.08, m.y + HEIGHT, m.z + HALF + 0.08];
      const from = [o.x, o.y, o.z];
      for (let k = 0; k < 3 && t0 <= t1; k++) {
        if (Math.abs(d[k]) < 1e-9) {
          if (from[k] < lo[k] || from[k] > hi[k]) t0 = Infinity;
          continue;
        }
        const a = (lo[k] - from[k]) / d[k], b = (hi[k] - from[k]) / d[k];
        t0 = Math.max(t0, Math.min(a, b));
        t1 = Math.min(t1, Math.max(a, b));
      }
      if (t0 <= t1 && (!best || t0 < best.t)) best = { mob: m, t: t0 };
    }
    return best;
  }

  // (dx, dz): direction of the blow, for the knock-back.
  hurt(m, damage, dx, dz) {
    const l = Math.hypot(dx, dz) || 1;
    m.hp -= damage;
    m.hurt = 0.3;
    m.knock = 0.22;
    m.kx = (dx / l) * 7;
    m.kz = (dz / l) * 7;
    m.vy = 5;
    if (m.hp > 0) return;
    const i = this.list.indexOf(m);
    if (i >= 0) this.remove(i);
    if (this.hooks.onDeath) this.hooks.onDeath(m.x, m.y + 1, m.z);
  }

  // Let an arrow fly from (x, y, z) with velocity (vx, vy, vz). mine: shot by the player.
  shoot(x, y, z, vx, vy, vz, damage, mine) {
    const p = parts();
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(p.shaft, p.wood));
    const point = new THREE.Mesh(p.point, p.iron);
    point.position.z = 0.38;
    const vane = new THREE.Mesh(p.vane, p.feather), vane2 = new THREE.Mesh(p.vane, p.feather);
    vane.position.z = vane2.position.z = -0.3;
    vane2.rotation.z = Math.PI / 2;
    mesh.add(point, vane, vane2);
    this.group.add(mesh);
    if (this.arrows.length > 60) this.dropArrow(0);
    this.arrows.push({ x, y, z, vx, vy, vz, damage, mine, stuck: false, life: 14, mesh });
  }

  dropArrow(i) {
    this.group.remove(this.arrows[i].mesh);
    this.arrows.splice(i, 1);
  }

  // target: the player's feet. eye: where the player's head is. chase: false while not playing.
  update(dt, target, eye, chase) {
    const w = this.world;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      m.age += dt;
      m.hurt = Math.max(0, m.hurt - dt);
      const dx = target.x - m.x, dz = target.z - m.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 90 || m.age > 300 || !w.isLoaded(m.x, m.z)) {
        this.remove(i);
        continue;
      }

      // a clear line from its bow to the player's head?
      const hx = m.x, hy = m.y + 1.45, hz = m.z;
      const ex = eye.x - hx, ey = eye.y - 0.3 - hy, ez = eye.z - hz;
      const el = Math.hypot(ex, ey, ez) || 1;
      const sees = chase && el < SIGHT && !w.raycast(hx, hy, hz, ex / el, ey / el, ez / el, el - 0.6);

      let vx = 0, vz = 0;
      if (m.knock > 0) {
        m.knock -= dt;
        vx = m.kx;
        vz = m.kz;
      } else if (chase) {
        // come closer until it can shoot, back off when crowded, drift sideways in between
        const go = !sees || d > FAR ? 1 : d < NEAR ? -1 : 0;
        if (Math.sin(m.age * 0.7) > 0.96) m.side = -m.side;
        vx = (dx / d) * SPEED * go + (go ? 0 : (-dz / d) * m.side * SPEED * 0.45);
        vz = (dz / d) * SPEED * go + (go ? 0 : (dx / d) * m.side * SPEED * 0.45);
      }
      // one axis at a time, so it slides along walls
      let blocked = false;
      if (vx) {
        if (this.free(m.x + vx * dt, m.y, m.z)) m.x += vx * dt;
        else blocked = true;
      }
      if (vz) {
        if (this.free(m.x, m.y, m.z + vz * dt)) m.z += vz * dt;
        else blocked = true;
      }
      m.vy -= GRAVITY * dt;
      const ny = m.y + m.vy * dt;
      if (this.free(m.x, ny, m.z)) {
        m.y = ny;
        m.ground = false;
      } else {
        if (m.vy < 0) {
          m.y = Math.floor(ny) + 1;
          m.ground = true;
        }
        m.vy = 0;
      }
      // a one-block step in the way: hop onto it
      if (blocked && m.ground && m.knock <= 0 && this.free(m.x, m.y + 1.05, m.z)) m.vy = JUMP;
      if (m.y < 1) {
        this.remove(i);
        continue;
      }

      // loose an arrow: aimed a little high, the faster the flight the less
      m.cool -= dt;
      if (sees && m.cool <= 0 && m.knock <= 0) {
        m.cool = 2.6 + Math.random() * 1.2;
        const t = el / ARROW_SPEED;
        // no marksman: standing in a photo the player cannot step aside, so a good half must miss
        const wild = () => 1 + (Math.random() - 0.5) * 0.13;
        this.shoot(hx + (ex / el) * 0.5, hy, hz + (ez / el) * 0.5, (ex / t) * wild(), (ey / t + 0.5 * ARROW_GRAVITY * t) * wild(), (ez / t) * wild(), 2 + Math.floor(Math.random() * 2), false);
        if (this.hooks.onShoot) this.hooks.onShoot(hx, hy, hz);
      }

      const moving = (vx || vz) && !blocked;
      m.walk += dt * (moving ? 10 : 0);
      const swing = moving ? Math.sin(m.walk) * 0.7 : 0;
      m.legs[0].rotation.x = swing;
      m.legs[1].rotation.x = -swing;
      m.arms[1].rotation.x = -1.2 + Math.max(0, 0.5 - m.cool) * 0.8; // draws just before it shoots
      // the drawn ground follows the measured height, the blocks under it are whole metres
      m.mesh.position.set(m.x, m.y + (m.ground ? w.groundDelta(m.x, m.y, m.z) : 0), m.z);
      if (chase) m.mesh.rotation.y = Math.atan2(dx, dz);
      const tint = m.hurt > 0 ? 0.45 : 1;
      for (const mat of m.mats) mat.color.setRGB(1, tint, tint);
    }

    // arrows in flight
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life -= dt;
      if (a.life <= 0) {
        this.dropArrow(i);
        continue;
      }
      if (a.stuck) continue;
      a.vy -= ARROW_GRAVITY * dt;
      const sp = Math.hypot(a.vx, a.vy, a.vz) || 1;
      const dir = [a.vx / sp, a.vy / sp, a.vz / sp];
      const step = sp * dt;
      const wall = w.raycast(a.x, a.y, a.z, dir[0], dir[1], dir[2], step);
      const reach = wall ? wall.t : step;
      if (a.mine) {
        const hit = this.pick(a, dir, reach);
        if (hit) {
          this.hurt(hit.mob, a.damage, dir[0], dir[2]);
          if (this.hooks.onThud) this.hooks.onThud(a.x, a.y, a.z);
          this.dropArrow(i);
          continue;
        }
      } else if (chase) {
        // the player: a column from the feet to the head; closest point of this step to it
        const k = Math.max(0, Math.min(reach, (target.x - a.x) * dir[0] + (eye.y - 0.5 - a.y) * dir[1] + (target.z - a.z) * dir[2]));
        const px = a.x + dir[0] * k, py = a.y + dir[1] * k, pz = a.z + dir[2] * k;
        if (Math.hypot(px - target.x, pz - target.z) < 0.4 && py > target.y - 0.1 && py < eye.y + 0.25) {
          if (this.hooks.onStruck) this.hooks.onStruck(a.damage, dir[0], dir[2]);
          this.dropArrow(i);
          continue;
        }
      }
      a.x += dir[0] * reach;
      a.y += dir[1] * reach;
      a.z += dir[2] * reach;
      a.mesh.quaternion.setFromUnitVectors(Zp, this.v.set(dir[0], dir[1], dir[2]));
      if (wall) {
        a.stuck = true;
        a.x -= dir[0] * 0.25; // the point buried, the shaft standing out
        a.y -= dir[1] * 0.25;
        a.z -= dir[2] * 0.25;
        if (this.hooks.onThud) this.hooks.onThud(a.x, a.y, a.z);
      }
      a.mesh.position.set(a.x, a.y, a.z);
    }
  }
}
