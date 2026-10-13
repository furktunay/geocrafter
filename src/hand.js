// First-person arm and the item it holds, drawn over the world in its own little scene.
import * as THREE from 'three';
import { isBlock, layerCanvas, itemLook } from './items.js';

const FOV = 70;
const DEG = Math.PI / 180;
const X = new THREE.Vector3(1, 0, 0), UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
// View space, camera looking down -z. A held item hangs low on the right; the arm comes from
// below the right edge of the screen and ends in a fist there.
const HOLD = new THREE.Vector3(0.56, -0.52, -0.72);
const SHOULDER = new THREE.Vector3(0.91, -1.0, -0.52);
const FIST = { empty: new THREE.Vector3(0.51, -0.23, -0.82), block: new THREE.Vector3(0.65, -0.48, -0.74) };

function pixelTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The arm of the game's own character, a road worker: orange high-visibility sleeve with a
// reflective band, bare forearm, work glove. `rows` lists the colour of each row from the
// shoulder to the fist.
const ORANGE = [240, 124, 26], BAND = [217, 221, 224], SKIN = [198, 142, 104], GLOVE = [61, 65, 72];
const ARM_ROWS = [ORANGE, ORANGE, ORANGE, ORANGE, ORANGE, BAND, SKIN, SKIN, SKIN, GLOVE, GLOVE, GLOVE];

function armCanvas(w, rows) {
  const h = rows.length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    const base = rows[h - 1 - y]; // canvas bottom = shoulder
    for (let x = 0; x < w; x++) {
      const n = ((x * 7 + y * 13) % 5) * 3 - 6 - (x === 0 || x === w - 1 ? 14 : 0);
      ctx.fillStyle = `rgb(${base[0] + n},${base[1] + n},${base[2] + n})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

// The six sides of a pixel box: four corners (counter-clockwise from outside) and how bright
// that side is drawn.
const SIDES = [
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], 1], // front
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0], 0.62], // back
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0], 0.92], // top
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], 0.5], // bottom
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1], 0.78], // right
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], 0.78], // left
];

// A flat sprite as a slab one pixel thick: every opaque pixel becomes a little box, so the item
// has an edge when it is seen from the side. One unit wide and high, centred.
function slab(canvas) {
  const n = canvas.width;
  const px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, n, n).data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < n && y < n && px[(y * n + x) * 4 + 3] >= 128;
  const u = 1 / n;
  const pos = [], col = [];
  const c = new THREE.Color();
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!solid(x, y)) continue;
      const i = (y * n + x) * 4;
      const x0 = x * u - 0.5, y0 = 0.5 - (y + 1) * u; // the pixel's lower left corner
      const covered = [false, false, solid(x, y - 1), solid(x, y + 1), solid(x + 1, y), solid(x - 1, y)];
      SIDES.forEach(([p, q, r, s, light], side) => {
        if (covered[side]) return;
        c.setRGB((px[i] / 255) * light, (px[i + 1] / 255) * light, (px[i + 2] / 255) * light, THREE.SRGBColorSpace);
        for (const v of [p, q, r, p, r, s]) {
          pos.push(x0 + v[0] * u, y0 + v[1] * u, (v[2] - 0.5) * u);
          col.push(c.r, c.g, c.b);
        }
      });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// A shaped block as a mesh: its boxes, each face showing the part of its texture that lies where
// the face does. Fitted into a unit cube and centred; one material for each texture used.
const FACES = [
  [0, 1, 0.78, (b) => [[b[3], b[1], b[2]], [b[3], b[1], b[5]], [b[3], b[4], b[5]], [b[3], b[4], b[2]]], (p) => [p[2], p[1]]],
  [0, -1, 0.62, (b) => [[b[0], b[1], b[2]], [b[0], b[1], b[5]], [b[0], b[4], b[5]], [b[0], b[4], b[2]]], (p) => [p[2], p[1]]],
  [1, 1, 0.92, (b) => [[b[0], b[4], b[2]], [b[3], b[4], b[2]], [b[3], b[4], b[5]], [b[0], b[4], b[5]]], (p) => [p[0], p[2]]],
  [1, -1, 0.5, (b) => [[b[0], b[1], b[2]], [b[3], b[1], b[2]], [b[3], b[1], b[5]], [b[0], b[1], b[5]]], (p) => [p[0], p[2]]],
  [2, 1, 1, (b) => [[b[0], b[1], b[5]], [b[3], b[1], b[5]], [b[3], b[4], b[5]], [b[0], b[4], b[5]]], (p) => [p[0], p[1]]],
  [2, -1, 0.7, (b) => [[b[0], b[1], b[2]], [b[3], b[1], b[2]], [b[3], b[4], b[2]], [b[0], b[4], b[2]]], (p) => [p[0], p[1]]],
];
function shapeMesh(parts, span) {
  const byLayer = new Map();
  const k = 1 / Math.max(span[0], span[1], span[2], 1);
  for (const part of parts) {
    for (const b of part.boxes) {
      const t = b[6] || part.tex;
      FACES.forEach(([axis, , light, corners, uvOf], d) => {
        if (b[axis] === b[axis + 3] && d % 2) return; // a sheet: one face, drawn from both sides
        let g = byLayer.get(t[d]);
        if (!g) byLayer.set(t[d], (g = { pos: [], uv: [], col: [] }));
        const c = corners(b);
        for (const i of [0, 1, 2, 0, 2, 3]) {
          g.pos.push((c[i][0] + part.off[0] - span[0] / 2) * k, (c[i][1] + part.off[1] - span[1] / 2) * k, (c[i][2] + part.off[2] - span[2] / 2) * k);
          g.uv.push(...uvOf(c[i]));
          g.col.push(light, light, light);
        }
      });
    }
  }
  const group = new THREE.Group();
  for (const [layer, g] of byLayer) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
    const map = pixelTexture(layerCanvas(layer));
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, vertexColors: true, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide })));
  }
  return group;
}

export class Hand {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 10);
    this.root = new THREE.Group(); // bobs while moving, dips while changing item
    this.scene.add(this.root);

    const side = new THREE.MeshBasicMaterial({ map: pixelTexture(armCanvas(4, ARM_ROWS)) });
    const dark = side.clone();
    dark.color.setScalar(0.78);
    const fist = new THREE.MeshBasicMaterial({ map: pixelTexture(armCanvas(4, [GLOVE, GLOVE, GLOVE, GLOVE])) });
    const sleeve = new THREE.MeshBasicMaterial({ map: pixelTexture(armCanvas(4, [ORANGE, ORANGE, ORANGE, ORANGE])) });
    // a unit-length box along +y from the shoulder; stretched to reach the fist
    const box = new THREE.BoxGeometry(0.175, 1, 0.175);
    box.translate(0, 0.5, 0);
    this.arm = new THREE.Mesh(box, [side, dark, fist, sleeve, dark, side]);
    this.arm.position.copy(SHOULDER);
    this.armRig = new THREE.Group(); // the arm's own swing
    this.armRig.add(this.arm);
    this.root.add(this.armRig);
    this.fist = FIST.empty.clone();
    this.dir = new THREE.Vector3();
    this.q = new THREE.Quaternion();

    this.holder = new THREE.Group(); // the held item: sits at HOLD and swings from there
    this.root.add(this.holder);
    this.flat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.item = null;
    this.id = -1;
    this.swingT = 1;
    this.equipT = 1;
    this.pull = 0; // 0..1 while a bow is being drawn
    this.time = 0;
    this.cache = new Map();
  }

  // Narrow windows get a wider view, so the hand stays in the corner instead of filling it.
  resize(aspect) {
    this.camera.aspect = aspect;
    const half = Math.max(Math.tan((FOV / 2) * DEG), 1.2 / aspect);
    this.camera.fov = (Math.atan(half) / DEG) * 2;
    this.camera.updateProjectionMatrix();
  }

  // Positions are relative to the holder.
  mesh(id) {
    let m = this.cache.get(id);
    if (m) return m;
    const look = itemLook(id);
    if (look.cube) {
      const mat = (layer, light) => {
        const mm = new THREE.MeshBasicMaterial({ map: pixelTexture(layerCanvas(layer)), transparent: true, alphaTest: 0.1 });
        mm.color.setScalar(light);
        return mm;
      };
      const c = look.cube;
      // the two sides in view are the ones the slots show: west on the left, north on the right
      m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), [mat(c[0], 1), mat(c[1], 0.7), mat(c[2], 1), mat(c[3], 1), mat(c[5], 0.7), mat(c[4], 1)]);
      m.position.set(0.02, 0.18, -0.02);
      m.rotation.set(0.3, 0.7, 0.05);
    } else if (look.parts) {
      m = shapeMesh(look.parts, look.span);
      m.scale.setScalar(0.22);
      m.position.set(0.02, 0.18, -0.02);
      m.rotation.set(0.3, 0.7 + Math.PI, 0.05); // its north-west corner towards the eye, as in the slots
    } else {
      // A tool is held upright by its lower end: the sprite is turned edge-on to the viewer
      // and tipped back, so it rises from the bottom right corner towards the top of the screen.
      m = new THREE.Mesh(slab(look.flat), this.flat);
      m.position.set(1.13 / 16, 3.2 / 16, 1.13 / 16);
      m.rotation.set(0, -90 * DEG, 25 * DEG);
      m.scale.setScalar(0.68);
    }
    this.cache.set(id, m);
    return m;
  }

  // 0 = empty hand
  hold(id) {
    if (id === this.id) return;
    this.id = id;
    if (this.item) this.holder.remove(this.item);
    this.item = id ? this.mesh(id) : null;
    if (this.item) this.holder.add(this.item);
    this.arm.visible = !id || !itemLook(id).flat; // a tool's grip is below the screen: no arm in view
    this.equipT = 0;
  }

  swing() {
    this.swingT = 0;
  }

  update(dt, moving) {
    this.time += dt * (moving ? 9 : 1.6);
    this.swingT = Math.min(1, this.swingT + dt / 0.42); // an unhurried chop: one per block broken
    this.equipT = Math.min(1, this.equipT + dt / 0.22);
    const t = this.swingT;
    const dip = 1 - Math.sin(this.equipT * Math.PI * 0.5);
    const bob = Math.sin(this.time) * (moving ? 0.022 : 0.006);
    this.root.position.set(0, bob - dip * 0.6, 0);

    // the item: a chop that sweeps in towards the middle of the view and back
    const f = Math.sin(t * t * Math.PI), g = Math.sin(Math.sqrt(t) * Math.PI);
    this.holder.position.set(HOLD.x - 0.4 * g - 0.16 * this.pull, HOLD.y + 0.2 * Math.sin(Math.sqrt(t) * Math.PI * 2) + 0.07 * this.pull, HOLD.z - 0.2 * Math.sin(t * Math.PI) + 0.06 * this.pull);
    this.holder.quaternion.setFromAxisAngle(UP, (45 - 20 * f) * DEG)
      .multiply(this.q.setFromAxisAngle(Z, -20 * g * DEG))
      .multiply(this.q.setFromAxisAngle(X, -80 * g * DEG))
      .multiply(this.q.setFromAxisAngle(UP, -45 * DEG));

    // the arm: a shorter jab of its own
    const s = Math.sin(t * Math.PI);
    this.armRig.position.set(-s * 0.16, -s * 0.05, -s * 0.12);
    this.armRig.rotation.set(-s * 0.55, s * 0.3, s * 0.2);
    // it reaches from the shoulder to wherever the fist belongs for what is held
    this.fist.lerp(this.id ? FIST.block : FIST.empty, Math.min(1, dt * 14));
    this.dir.copy(this.fist).sub(SHOULDER);
    this.arm.scale.y = this.dir.length();
    this.arm.quaternion.setFromUnitVectors(UP, this.dir.normalize());
    this.arm.quaternion.multiply(this.q.setFromAxisAngle(UP, 0.55)); // show two faces of it
  }

  render(renderer) {
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = auto;
  }
}
