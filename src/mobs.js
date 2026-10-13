// Creatures, and every arrow in flight (theirs and the player's).
//
// Four kinds: the skeleton archer keeps its distance and shoots; the zombie and the zombified
// piglin walk up and hit; the creeper walks up and blows itself up. None of them knows where
// the player is until it has caught sight of them, within the distance its kind can see: until
// then it ambles about. Each is a model of boxes skinned from one sheet, laid out the way such
// sheets are (see box()). A texture pack's sheet is used if it has one (pack.js, "entities");
// without it the game paints its own.
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { skins } from './pack.js';

const GRAVITY = 24;
const JUMP = 7.5;
const MAX = 10;
const NEAR = 6, FAR = 11; // the band of distance an archer likes to shoot from
const ARROW_SPEED = 28;
const ARROW_GRAVITY = 20;
const FORGET = 3; // seconds without a sight of the player before a creature gives them up
// A creeper, as the original has it: within LIGHT blocks of the player it is after it stands
// still and swells for FUSE seconds, then goes off. It keeps swelling while they stay in plain
// view within CALM blocks; otherwise the air goes out of it again as fast as it came.
const FUSE = 1.5, LIGHT = 3, CALM = 7;
const Zp = new THREE.Vector3(0, 0, 1);

// px: height of the model in sheet pixels (16 to the metre before scaling to `height`).
// see: how far the kind can spot the player (the zombie a long way, like the original's).
const KINDS = {
  skeleton: { name: 'Skeleton', hp: 20, speed: 2.6, see: 16, half: 0.28, height: 1.9, px: 32, ai: 'archer', dust: [0.86, 0.86, 0.82] },
  zombie: { name: 'Zombie', hp: 20, speed: 2.1, see: 35, half: 0.3, height: 1.9, px: 32, ai: 'brawler', hit: 3, dust: [0.3, 0.5, 0.28] },
  piglin: { name: 'Zombified piglin', hp: 22, speed: 2.4, see: 35, half: 0.3, height: 1.9, px: 32, ai: 'brawler', hit: 3, calm: true, dust: [0.82, 0.56, 0.5] },
  creeper: { name: 'Creeper', hp: 20, speed: 2.6, see: 16, half: 0.3, height: 1.65, px: 26, ai: 'creeper', dust: [0.36, 0.66, 0.3] },
};
// the smaller way round from one heading to another
const turnTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export const MOB_NAMES = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.name]));

// ---------------------------------------------------------------- skins

// The game's own sheets, for when no pack brings one: plain colours with a face.
function paint(kind) {
  const tall = kind === 'zombie' || kind === 'piglin';
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = tall ? 64 : 32;
  const ctx = c.getContext('2d');
  // every face of a box at (u, v), speckled around one colour
  const fill = (u, v, w, h, d, [r, g, b], n = 12) => {
    for (const [x0, y0, fw, fh] of [[u + d, v, 2 * w, d], [u, v + d, 2 * (w + d), h]]) {
      for (let y = y0; y < y0 + fh; y++) {
        for (let x = x0; x < x0 + fw; x++) {
          const k = (((x * 7 + y * 13 + x * y * 3) % 9) / 8 - 0.5) * n;
          ctx.fillStyle = `rgb(${r + k | 0},${g + k | 0},${b + k | 0})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  };
  const dot = (colour, ...rects) => {
    ctx.fillStyle = colour;
    for (const [x, y, w, h] of rects) ctx.fillRect(x, y, w, h);
  };
  if (kind === 'skeleton') {
    const bone = [214, 214, 204];
    fill(0, 0, 8, 8, 8, bone, 10);
    fill(16, 16, 8, 12, 4, [44, 44, 42], 4);
    dot('rgb(214,214,204)', [23, 20, 2, 12], [20, 21, 8, 1], [20, 23, 8, 1], [20, 25, 8, 1], [20, 27, 8, 1]); // spine and ribs
    fill(40, 16, 2, 12, 2, bone, 10);
    fill(0, 16, 2, 12, 2, bone, 10);
    dot('#2c2c2a', [9, 11, 2, 2], [13, 11, 2, 2], [11, 13, 2, 1], [9, 15, 1, 1], [11, 15, 1, 1], [13, 15, 1, 1], [15, 15, 1, 1]); // sockets, nose, teeth
  } else if (kind === 'creeper') {
    const green = [92, 170, 74];
    fill(0, 0, 8, 8, 8, green, 34);
    fill(16, 16, 8, 12, 4, green, 34);
    fill(0, 16, 4, 6, 4, [70, 140, 58], 26);
    dot('#101010', [9, 10, 2, 2], [13, 10, 2, 2], [11, 12, 2, 3], [10, 13, 1, 3], [13, 13, 1, 3]); // eyes and the long mouth
  } else {
    const skin = kind === 'zombie' ? [86, 132, 70] : [222, 148, 138];
    const shirt = kind === 'zombie' ? [52, 150, 162] : [112, 78, 50];
    const legs = kind === 'zombie' ? [68, 58, 150] : [84, 60, 42];
    fill(0, 0, kind === 'piglin' ? 10 : 8, 8, 8, skin);
    fill(16, 16, 8, 12, 4, shirt);
    fill(40, 16, 4, 12, 4, skin);
    fill(32, 48, 4, 12, 4, skin);
    fill(0, 16, 4, 12, 4, legs);
    fill(16, 48, 4, 12, 4, legs);
    if (kind === 'zombie') dot('#16240f', [9, 11, 2, 1], [13, 11, 2, 1], [11, 14, 2, 1]);
    else {
      fill(31, 1, 4, 4, 1, [196, 118, 110], 6); // the snout
      dot('#f4f0e0', [9, 12, 2, 1], [15, 12, 2, 1]);
      dot('#3c2420', [10, 12, 1, 1], [15, 12, 1, 1]);
      dot('rgb(96,130,70)', [8, 8, 4, 3], [44, 20, 4, 6], [20, 22, 5, 4], [36, 52, 4, 5]); // where it has rotted
    }
  }
  return c;
}

const sheets = new Map();
// -> { tex, w, h: the sheet's size in model pixels, own: painted here }
function sheet(kind) {
  let s = sheets.get(kind);
  if (!s) {
    const img = skins.get(kind);
    const src = img || paint(kind);
    const tex = img ? new THREE.Texture(img) : new THREE.CanvasTexture(src);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const iw = img ? img.naturalWidth : src.width, ih = img ? img.naturalHeight : src.height;
    s = { tex, w: 64, h: Math.round((64 * ih) / iw), own: !img };
    sheets.set(kind, s);
  }
  return s;
}

// One box of a model, w x h x d sheet pixels, skinned from the sheet at (u, v): top and bottom
// side by side, and under them a strip of the box's right side, front, left side and back.
// The front is +z here; `sw`, `sh`: the sheet's size.
const boxes = new Map();
function box(w, h, d, u, v, sw, sh) {
  const key = [w, h, d, u, v, sw, sh].join();
  let g = boxes.get(key);
  if (g) return g;
  g = new THREE.BoxGeometry(w / 16, h / 16, d / 16);
  const uv = g.attributes.uv;
  // three's faces come +x, -x, +y, -y, +z, -z, four corners each: top left, top right, bottom left, bottom right
  const face = (i, x, y, fw, fh) => {
    const u0 = x / sw, u1 = (x + fw) / sw, v0 = 1 - y / sh, v1 = 1 - (y + fh) / sh;
    uv.setXY(i * 4, u0, v0);
    uv.setXY(i * 4 + 1, u1, v0);
    uv.setXY(i * 4 + 2, u0, v1);
    uv.setXY(i * 4 + 3, u1, v1);
  };
  face(1, u, v + d, d, h);
  face(4, u + d, v + d, w, h);
  face(0, u + d + w, v + d, d, h);
  face(5, u + 2 * d + w, v + d, w, h);
  face(2, u + d, v, w, d);
  face(3, u + d + w, v, w, d);
  boxes.set(key, g);
  return g;
}

let shared = null;
function parts() {
  if (!shared) {
    shared = {
      hat: new THREE.BoxGeometry(0.56, 0.16, 0.56),
      brim: new THREE.BoxGeometry(0.62, 0.04, 0.7),
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

// -> { mesh, legs, arms, mat }: a model standing on y = 0, facing +z, limbs on joints.
function build(kind) {
  const def = KINDS[kind], s = sheet(kind), p = parts();
  const mat = new THREE.MeshBasicMaterial({ map: s.tex, alphaTest: 0.5 });
  const mesh = new THREE.Group();
  const body = new THREE.Group(); // in sheet pixels / 16, scaled to the creature's height
  body.scale.setScalar(def.height / (def.px / 16));
  mesh.add(body);
  const px = (v) => v / 16;
  const add = (w, h, d, u, v, x, y, z, parent = body) => {
    const m = new THREE.Mesh(box(w, h, d, u, v, s.w, s.h), mat);
    m.position.set(px(x), px(y), px(z));
    parent.add(m);
    return m;
  };
  // a limb hangs from a joint at its upper end
  const limb = (w, h, d, u, v, x, y, z) => {
    const j = new THREE.Group();
    j.position.set(px(x), px(y), px(z));
    add(w, h, d, u, v, 0, -h / 2 + (kind === 'creeper' ? 0 : 2), 0, j);
    body.add(j);
    return j;
  };
  let legs, arms = [];
  if (kind === 'creeper') {
    add(8, 8, 8, 0, 0, 0, 22, 0);
    add(8, 12, 4, 16, 16, 0, 12, 0);
    legs = [limb(4, 6, 4, 0, 16, -2, 6, 4), limb(4, 6, 4, 0, 16, 2, 6, 4), limb(4, 6, 4, 0, 16, -2, 6, -4), limb(4, 6, 4, 0, 16, 2, 6, -4)];
  } else {
    const thin = kind === 'skeleton', tall = s.h >= 64, t = thin ? 2 : 4;
    add(kind === 'piglin' ? 10 : 8, 8, 8, 0, 0, 0, 28, 0);
    if (kind === 'piglin') add(4, 4, 1, 31, 1, 0, 26, 4.5);
    add(8, 12, 4, 16, 16, 0, 18, 0);
    // the creature's right is -x; sheets twice as high carry their own left limbs
    arms = [limb(t, 12, t, 40, 16, -(4 + t / 2), 22, 0), limb(t, 12, t, tall ? 32 : 40, tall ? 48 : 16, 4 + t / 2, 22, 0)];
    legs = [limb(t, 12, t, 0, 16, -2, 10, 0), limb(t, 12, t, tall ? 16 : 0, tall ? 48 : 16, 2, 10, 0)];
    if (thin) {
      // a bow in the outstretched hand: three short pieces, bent
      const bow = new THREE.Group();
      bow.position.set(0, px(-10), 0);
      bow.rotation.x = 1.45;
      const piece = (y, z, turn) => {
        const m = new THREE.Mesh(p.stave, p.wood);
        m.position.set(0, y, z);
        m.rotation.x = turn;
        bow.add(m);
      };
      piece(0, 0.05, 0);
      piece(0.27, -0.01, 0.4);
      piece(-0.27, -0.01, -0.4);
      arms[0].add(bow);
      if (s.own) {
        // the game's own skeleton is what is left of a road worker: the hard hat is still on
        const hat = new THREE.Mesh(p.hat, p.yellow), brim = new THREE.Mesh(p.brim, p.yellow);
        hat.position.set(0, px(32) + 0.06, 0);
        brim.position.set(0, px(32), 0.05);
        body.add(hat, brim);
      }
    }
  }
  return { mesh, legs, arms, mat };
}

// ---------------------------------------------------------------- the creatures

export class Mobs {
  // hooks: onShoot(x, y, z), onStruck(damage, dx, dz) - the player was hit, onThud(x, y, z) -
  //        an arrow stuck in something, onDeath(x, y, z, kind), onHiss() - a creeper lit up,
  //        onBlast(x, y, z) - it went off
  constructor(scene, world, hooks = {}) {
    this.world = world;
    this.hooks = hooks;
    this.group = new THREE.Group(); // kept out of the photo depth maps
    scene.add(this.group);
    this.list = [];
    this.arrows = [];
    this.v = new THREE.Vector3();
  }

  // A body box against the blocks, feet at (x, y, z).
  free(x, y, z, def = KINDS.skeleton) {
    const w = this.world;
    for (const h of [0.05, 0.95, def.height - 0.05]) {
      const by = Math.floor(y + h);
      for (const dx of [-def.half, def.half]) {
        for (const dz of [-def.half, def.half]) if (SOLID[w.getBlock(Math.floor(x + dx), by, Math.floor(z + dz))]) return false;
      }
    }
    return true;
  }

  // Somewhere to put a foot: a floor within three blocks below, and no lava to wade into.
  footing(x, y, z) {
    const w = this.world, bx = Math.floor(x), by = Math.floor(y + 0.1), bz = Math.floor(z);
    for (let k = 0; k <= 3; k++) {
      const id = w.getBlock(bx, by - k, bz);
      if (id === B.LAVA) return false;
      if (k && SOLID[id]) return true;
    }
    return false;
  }

  // Feet on the floor of block cell (bx, by, bz). False when there is no room (or too many).
  spawn(kind, bx, by, bz) {
    const def = KINDS[kind];
    if (!def || this.list.length >= MAX || !this.free(bx + 0.5, by, bz + 0.5, def)) return false;
    const m = build(kind);
    this.group.add(m.mesh);
    // aware: it has seen the player and is after them; unseen: seconds since it last did
    this.list.push({
      kind, def, x: bx + 0.5, y: by, z: bz + 0.5, vy: 0, ground: false, hp: def.hp, cool: 2.5, hurt: 0, knock: 0, kx: 0, kz: 0,
      age: 0, walk: 0, gait: 0, fuse: 0, aware: false, unseen: 0, yaw: Math.random() * Math.PI * 2, roam: null, turnAt: 1 + Math.random() * 3,
      side: Math.random() < 0.5 ? 1 : -1, ...m,
    });
    return true;
  }

  count(kind) {
    return this.list.filter((m) => m.kind === kind).length;
  }

  remove(i) {
    const m = this.list[i];
    this.group.remove(m.mesh);
    m.mat.dispose();
    this.list.splice(i, 1);
  }

  // Take away every creature for which keep(mob) is false (leaving the Nether, say).
  clear(keep = () => false) {
    for (let i = this.list.length - 1; i >= 0; i--) if (!keep(this.list[i])) this.remove(i);
  }

  // Nearest creature hit by a ray (unit direction as [x, y, z]) within maxT: { mob, t } or null.
  pick(o, d, maxT) {
    let best = null;
    for (const m of this.list) {
      let t0 = 0, t1 = maxT;
      const r = m.def.half + 0.08;
      const lo = [m.x - r, m.y, m.z - r], hi = [m.x + r, m.y + m.def.height, m.z + r];
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
    m.aware = true; // it knows who did that
    m.unseen = 0;
    // hit one of a peaceable kind and every one of them nearby takes it personally, for a while
    if (m.def.calm) for (const o of this.list) if (o.kind === m.kind && Math.hypot(o.x - m.x, o.z - m.z) < 40) o.angry = 25;
    if (m.hp > 0) return;
    const i = this.list.indexOf(m);
    if (i >= 0) this.remove(i);
    if (this.hooks.onDeath) this.hooks.onDeath(m.x, m.y + 1, m.z, m.kind);
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
      const m = this.list[i], def = m.def;
      m.age += dt;
      m.hurt = Math.max(0, m.hurt - dt);
      const dx = target.x - m.x, dz = target.z - m.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 90 || m.age > 300 || !w.isLoaded(m.x, m.z)) {
        this.remove(i);
        continue;
      }

      // a clear line from its head to the player's?
      const hx = m.x, hy = m.y + def.height * 0.76, hz = m.z;
      const ex = eye.x - hx, ey = eye.y - 0.3 - hy, ez = eye.z - hz;
      const el = Math.hypot(ex, ey, ez) || 1;
      const sees = chase && el < def.see && !w.raycast(hx, hy, hz, ex / el, ey / el, ez / el, el - 0.6);
      // it comes after the player once it has caught sight of them, and gives them up out of
      // range or after a while without one
      if (sees) {
        m.aware = true;
        m.unseen = 0;
      } else if (m.aware && chase) {
        m.unseen += dt;
        if (el > def.see || m.unseen > FORGET) m.aware = false;
      }
      if (m.angry > 0) m.angry -= dt;
      const hunting = chase && (def.calm ? m.angry > 0 : m.aware);

      if (def.ai === 'creeper') {
        const near = Math.hypot(dx, target.y - m.y, dz);
        m.lit = hunting && sees && near < (m.fuse > 0 ? CALM : LIGHT);
        if (m.lit && m.fuse <= 0 && this.hooks.onHiss) this.hooks.onHiss();
        m.fuse = m.lit ? m.fuse + dt : Math.max(0, m.fuse - dt);
        if (m.fuse >= FUSE) {
          this.remove(i);
          if (this.hooks.onBlast) this.hooks.onBlast(m.x, m.y + 0.8, m.z);
          continue;
        }
      }

      let vx = 0, vz = 0, face = null;
      if (m.knock > 0) {
        m.knock -= dt;
        vx = m.kx;
        vz = m.kz;
      } else if (!chase) {
        // the game is not being played: everything waits
      } else if (!hunting) {
        // nothing to go after: a few steps one way, a rest, a few steps another
        if (m.age > m.turnAt) {
          m.roam = m.roam === null && Math.random() < 0.7 ? Math.random() * Math.PI * 2 : null;
          m.turnAt = m.age + (m.roam === null ? 2 + Math.random() * 5 : 1.5 + Math.random() * 2.5);
        }
        if (m.roam !== null) {
          vx = Math.sin(m.roam) * def.speed * 0.5;
          vz = Math.cos(m.roam) * def.speed * 0.5;
          face = m.roam;
        }
      } else {
        face = Math.atan2(dx, dz);
        if (def.ai === 'archer') {
          // come closer until it can shoot, back off when crowded, drift sideways in between
          const go = !sees || d > FAR ? 1 : d < NEAR ? -1 : 0;
          if (Math.sin(m.age * 0.7) > 0.96) m.side = -m.side;
          vx = (dx / d) * def.speed * go + (go ? 0 : (-dz / d) * m.side * def.speed * 0.45);
          vz = (dz / d) * def.speed * go + (go ? 0 : (dx / d) * m.side * def.speed * 0.45);
        } else if (d > 1.0 && !m.lit) {
          // the others walk straight up to the player
          vx = (dx / d) * def.speed;
          vz = (dz / d) * def.speed;
        }
      }
      // one axis at a time, so it slides along walls; no step is taken off a cliff or into lava
      let wall = null, edge = false;
      const x0 = m.x, z0 = m.z;
      const sure = m.knock > 0 || !m.ground;
      if (vx) {
        const nx = m.x + vx * dt;
        if (!this.free(nx, m.y, m.z, def)) wall = [nx, m.z];
        else if (sure || this.footing(nx + Math.sign(vx) * def.half, m.y, m.z)) m.x = nx;
        else edge = true;
      }
      if (vz) {
        const nz = m.z + vz * dt;
        if (!this.free(m.x, m.y, nz, def)) wall = [m.x, nz];
        else if (sure || this.footing(m.x, m.y, nz + Math.sign(vz) * def.half)) m.z = nz;
        else edge = true;
      }
      if ((wall || edge) && !hunting) m.turnAt = 0; // ambling into something: enough of that way
      m.vy -= GRAVITY * dt;
      const ny = m.y + m.vy * dt;
      if (this.free(m.x, ny, m.z, def)) {
        m.y = ny;
        m.ground = false;
      } else {
        if (m.vy < 0) {
          m.y = Math.floor(ny) + 1;
          m.ground = true;
        }
        m.vy = 0;
      }
      // a one-block step in the way: hop onto it (what is higher than that is a wall, and stays one)
      if (wall && m.ground && m.knock <= 0 && this.free(m.x, m.y + 1.05, m.z, def) && this.free(wall[0], m.y + 1.05, wall[1], def)) m.vy = JUMP;
      if (m.y < 1) {
        this.remove(i);
        continue;
      }

      m.cool -= dt;
      const reach = Math.abs(target.y - m.y) < 2.2;
      if (def.ai === 'archer') {
        // loose an arrow: aimed a little high, the faster the flight the less
        if (hunting && sees && m.cool <= 0 && m.knock <= 0) {
          m.cool = 2.6 + Math.random() * 1.2;
          const t = el / ARROW_SPEED;
          // no marksman: standing in a photo the player cannot step aside, so a good half must miss
          const wild = () => 1 + (Math.random() - 0.5) * 0.13;
          this.shoot(hx + (ex / el) * 0.5, hy, hz + (ez / el) * 0.5, (ex / t) * wild(), (ey / t + 0.5 * ARROW_GRAVITY * t) * wild(), (ez / t) * wild(), 2 + Math.floor(Math.random() * 2), false);
          if (this.hooks.onShoot) this.hooks.onShoot(hx, hy, hz);
        }
      } else if (def.ai === 'brawler') {
        if (hunting && d < 1.5 && reach && m.cool <= 0 && m.knock <= 0) {
          m.cool = 1.1;
          m.swing = 0.3;
          if (this.hooks.onStruck) this.hooks.onStruck(def.hit, dx / d, dz / d);
        }
      }

      // the legs swing with the ground covered, wide at a run and hardly at all at an amble
      const pace = m.knock > 0 ? 0 : Math.hypot(m.x - x0, m.z - z0) / Math.max(dt, 1e-4);
      m.gait += (Math.min(1, pace / 5) - m.gait) * Math.min(1, dt * 8);
      m.walk += dt * 13.3 * m.gait;
      const stride = Math.sin(m.walk) * 1.4 * m.gait;
      m.legs.forEach((leg, k) => (leg.rotation.x = (k === 0 || k === 3 ? stride : -stride)));
      if (def.ai === 'archer') {
        m.arms[0].rotation.x = hunting ? -1.45 : -0.2; // the bow arm, held out at the player
        m.arms[1].rotation.x = hunting ? -1.2 + Math.max(0, 0.5 - m.cool) * 0.8 : 0; // draws just before it shoots
      } else if (def.ai === 'brawler') {
        // arms out in front, flung down when it hits
        m.swing = Math.max(0, (m.swing || 0) - dt);
        const a = -1.5 + (m.swing > 0 ? Math.sin((m.swing / 0.3) * Math.PI) * 0.9 : Math.sin(m.age * 2) * 0.06);
        m.arms[0].rotation.x = a;
        m.arms[1].rotation.x = a;
      }
      // the drawn ground follows the measured height, the blocks under it are whole metres
      m.mesh.position.set(m.x, m.y + (m.ground ? w.groundDelta(m.x, m.y, m.z) : 0), m.z);
      // turns to the player it is after, or the way it is ambling
      if (face !== null) m.yaw += turnTo(m.yaw, face) * Math.min(1, dt * 9);
      m.mesh.rotation.y = m.yaw;
      // hurt: red. A creeper about to go off swells, shivers and blinks white.
      const f = m.fuse / (FUSE - 0.1);
      if (f > 0) {
        const shiver = 1 + Math.sin(f * 100) * f * 0.035, k = Math.min(1, f) ** 4;
        m.mesh.scale.set((1 + k * 0.4) * shiver, (1 + k * 0.1) / shiver, (1 + k * 0.4) * shiver);
      } else m.mesh.scale.setScalar(1);
      const white = f > 0 && Math.floor(f * 10) % 2 ? Math.min(1, Math.max(0.5, f)) * 1.6 : 0;
      const tint = m.hurt > 0 ? 0.45 : 1;
      m.mat.color.setRGB(1 + white, tint + white, tint + white);
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
