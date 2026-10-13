// Street-level 360° panoramas: finding them, loading them, and keeping the photo skin's
// projection (texture + pose + depth cube map) up to date for two cross-fading slots.
import * as THREE from 'three';
import { SOLID, B } from './blocks.js';
import { photoProfile, groundMatch, smearOutline } from './skyline.js';
import { PATCH_TOP } from './materials.js';

const CELL = 0.005; // degrees per search cell (~500 m; small enough to stay under the API's result cap)
const DEFAULT_HEIGHT = 2.0; // camera height above the ground when nothing better is known
const SURVEY_HEIGHT = 2.4; // same, for survey vehicles, until measured from their own photos
const CALIB_KEY = 'geocrafter:calib:v2'; // v1 kept headings and offsets against north; the grid may be turned now
const DEPTH_SIZE = 1024;
const HD_MAX = 8192; // widest panorama texture kept on the GPU (8000 x 4000 is ~128 MB)
const MASK = 27; // degrees below the horizon where a survey vehicle starts to cover the ground
const FOOT = 44; // same, for a photographer on foot holding the camera overhead
const CACHE = 6; // standard-definition panoramas kept loaded (current, previous, the next ones)
const DECKS = new Set([B.DECK, B.DECK_LINE, B.DECK_RAIL, B.DECK_TRACK]);

// ---------------------------------------------------------------- providers
// search(west, south, east, north) -> [{ id, provider, lon, lat, heading, rot?, seq, date, author, sd, hd, page }]

export class PanoramaxProvider {
  constructor(base = 'https://api.panoramax.xyz/api') {
    this.name = 'Panoramax';
    this.base = base;
  }

  async search(w, s, e, n) {
    const r = await fetch(`${this.base}/search?bbox=${w},${s},${e},${n}&limit=1000`);
    if (!r.ok) throw new Error(`Panoramax HTTP ${r.status}`);
    const out = [];
    for (const f of (await r.json()).features || []) {
      const p = f.properties;
      if (p['pers:interior_orientation']?.field_of_view !== 360 || !f.assets?.sd) continue;
      out.push({
        id: f.id,
        provider: this.name,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        heading: p['view:azimuth'] ?? 0, // compass bearing of the image centre
        seq: f.collection,
        run: f.collection, // one walk or drive, with the frame's place in it
        order: p['geovisio:rank_in_collection'],
        date: (p.datetime || '').slice(0, 10),
        author: p['geovisio:producer'] || f.providers?.[0]?.name || '',
        width: p['pers:interior_orientation']?.sensor_array_dimensions?.[0] || 0,
        sd: f.assets.sd.href,
        hd: f.assets.hd?.href,
      });
    }
    return out;
  }
}

// City of Amsterdam open data: survey-vehicle panoramas every 5 m. The published images are
// already rotated so that north is at the image centre and the horizon is level, and their
// positions come from the survey rig - so these need no alignment at all (`exact`).
export class AmsterdamProvider {
  constructor() {
    this.name = 'Amsterdam';
  }

  static covers(lon, lat) {
    return lon > 4.72 && lon < 5.11 && lat > 52.27 && lat < 52.44;
  }

  // Panoramas around a point, handed over in batches: the immediate surroundings first (a big
  // page takes the service many seconds), then the wider area page by page.
  async around(lon, lat, radius, onBatch) {
    if (!AmsterdamProvider.covers(lon, lat)) return;
    // newest_in_range keeps one panorama per spot (the streets are re-driven every year)
    const base = `https://api.data.amsterdam.nl/panorama/panoramas/?near=${lon.toFixed(6)},${lat.toFixed(6)}&newest_in_range=true`;
    const page = async (r, n, size) => {
      const res = await fetch(`${base}&radius=${r}&page_size=${size}&page=${n}`);
      if (!res.ok) throw new Error(`Amsterdam HTTP ${res.status}`);
      const j = await res.json();
      const list = [];
      for (const p of j._embedded?.panoramas || []) {
        const l = p._links;
        if (!l?.equirectangular_small) continue;
        const cut = p.pano_id.lastIndexOf('_'); // ..._pano_<strip>_<frame>
        list.push({
          id: `a${p.pano_id}`,
          provider: this.name,
          exact: true,
          lon: p.geometry.coordinates[0],
          lat: p.geometry.coordinates[1],
          heading: 0,
          seq: `ams-${p.mission_year}-${p.mission_type}`, // one survey rig: one camera height
          run: p.pano_id.slice(0, cut),
          order: parseInt(p.pano_id.slice(cut + 1), 10),
          date: (p.timestamp || '').slice(0, 10),
          author: 'Gemeente Amsterdam',
          width: 8000,
          sd: l.equirectangular_medium.href, // 4000 px: sharp enough to travel on
          hd: l.equirectangular_full.href, // 8000 px: loaded once the player stands still
          onWater: p.surface_type === 'W',
        });
      }
      onBatch(list);
      return j.count || 0;
    };
    await page(45, 1, 250);
    const size = 300;
    const count = await page(radius, 1, size);
    const pages = Math.min(8, Math.ceil(count / size));
    await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => page(radius, i + 2, size)));
  }
}

// ---------------------------------------------------------------- manager

const ease = (t) => t * t * (3 - 2 * t);
const angle = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
// What counts as one survey when choosing the next step: the run, or the month it was driven in
// for sources that tell.
const era = (n) => n.epoch || n.seq;

// Ground under the capturing vehicle. A 360 camera always sees whatever carries it; the same
// paving is in plain view from the panoramas taken a few metres before and after. For every
// direction below this photo's own vehicle this finds the point on the ground and looks it up in
// those neighbours (whichever sees it from outside its own vehicle, the closer one weighing more).
// Every photo has its own frame (uR*: world -> photo) and its own outline of what carries it
// (uE*: degrees below the horizon / 90, per direction in that frame). The ground is level across
// the street and may rise or fall along it, towards each neighbour separately (uSlope).
// Output rows run from straight down (v = 0) to PATCH_TOP (v = 1), in this photo's frame;
// alpha = how valid it is, and zero above this photo's vehicle.
const PATCH_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
const PATCH_FRAG = /* glsl */ `
uniform sampler2D uN1;
uniform sampler2D uN2;
uniform sampler2D uN3;
uniform sampler2D uE0;
uniform sampler2D uE1;
uniform sampler2D uE2;
uniform sampler2D uE3;
uniform mat3 uR0;
uniform mat3 uR1;
uniform mat3 uR2;
uniform mat3 uR3;
uniform vec3 uO1; // neighbour camera relative to this one (world axes)
uniform vec3 uO2;
uniform vec3 uO3;
uniform vec3 uUse;
uniform vec2 uM1; // how far above its vehicle's outline a neighbour starts to count, and counts fully (radians)
uniform vec2 uM2;
uniform vec2 uM3;
uniform float uH; // this camera's height above its ground
uniform vec2 uAxis; // along the street: the way to the first neighbour (unit, x and z)
uniform vec2 uSlope; // rise per metre towards the first neighbour, and away from it
varying vec2 vUv;
const float TOP = ${PATCH_TOP.toFixed(7)};

// elevation at which a photo's own vehicle begins, in the direction of image column u
float vehicle(sampler2D outline, float u) {
  return -texture(outline, vec2(u, 0.5)).r * 1.5707963;
}

// -> colour times weight, weight. The nearest neighbour that sees the spot all but decides it:
// averaging two views that do not quite agree only blurs both. The last argument collects how
// well the spot is seen at all.
vec4 seenFrom(sampler2D tex, sampler2D outline, vec2 margin, mat3 rot, vec3 o, vec3 p, inout float seen) {
  vec3 v = p - o;
  float d = length(v);
  vec3 dir = rot * (v / d);
  float el = asin(clamp(dir.y, -1.0, 1.0));
  vec2 uv = vec2(atan(dir.x, -dir.z) * 0.15915494 + 0.5, el * 0.31830989 + 0.5);
  float ok = smoothstep(margin.x, margin.y, el - vehicle(outline, uv.x)); // outside that photo's own vehicle
  seen = max(seen, ok * min(1.0, 420.0 / (d * d)));
  float near = 100.0 / (d * d);
  float w = ok * near * near * near;
  return vec4(texture(tex, uv).rgb * w, w);
}

void main() {
  float az = (vUv.x - 0.5) * 6.2831853;
  float el = mix(-1.5707963, TOP, vUv.y);
  vec3 dir = transpose(uR0) * vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
  float along = dot(dir.xz, uAxis);
  float drop = (along >= 0.0 ? uSlope.x : -uSlope.y) * along - dir.y; // how fast the ray nears the ground
  vec4 a = vec4(0.0);
  vec4 b = vec4(0.0);
  vec4 c = vec4(0.0);
  float seen = 0.0;
  if (drop > 0.02) {
    vec3 p = dir * (uH / drop); // where this ray meets the ground
    if (uUse.x > 0.5) a = seenFrom(uN1, uE1, uM1, uR1, uO1, p, seen);
    if (uUse.y > 0.5) b = seenFrom(uN2, uE2, uM2, uR2, uO2, p, seen);
    if (uUse.z > 0.5) c = seenFrom(uN3, uE3, uM3, uR3, uO3, p, seen);
  }
  float w = a.a + b.a + c.a;
  // comes in from two degrees above this photo's own vehicle
  float mine = smoothstep(0.035, -0.026, el - vehicle(uE0, vUv.x));
  gl_FragColor = w > 1e-9 ? vec4((a.rgb + b.rgb + c.rgb) / w, seen * mine) : vec4(0.0);
}
`;

// A vehicle outline for the patch shader: `below(u)` = degrees below the horizon at image
// column u (0..1).
function outlineTexture(below) {
  const N = 256, data = new Uint8Array(N);
  for (let i = 0; i < N; i++) data[i] = Math.round(THREE.MathUtils.clamp(below((i + 0.5) / N) / 90, 0, 1) * 255);
  const tex = new THREE.DataTexture(data, N, 1, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Free a panorama texture and, for the full-resolution ones, the decoded bitmap behind it.
function drop(tex) {
  tex.dispose();
  if (tex.image && tex.image.close) tex.image.close();
}

export class PanoManager {
  constructor({ renderer, scene, world, materials, proj, providers, hidden }) {
    this.renderer = renderer;
    this.scene = scene;
    this.world = world;
    this.materials = materials;
    this.proj = proj;
    this.providers = providers;
    this.hidden = hidden; // objects that must not appear in depth renders
    this.nodes = new Map();
    this.list = [];
    this.cells = new Map();
    this.errors = new Map();
    this.hd = true;
    this.active = -1; // slot showing the current panorama
    this.current = null;
    this.pending = null; // node whose image is downloading
    this.token = 0;
    this.fade = null;
    this.hop = null; // camera travelling to a panorama centre
    this.snapped = null; // node the camera is locked to
    this.clip = 0;
    this.player = [0, 0];
    this.searchAt = 0;
    this.switchAt = 0;
    this.onChange = null;
    this.pace = 1; // how briskly the camera travels between photos (set from the options)
    this.loader = new THREE.TextureLoader();
    this.prefetchAt = 0;
    this.images = new Map(); // node id -> Promise<texture>, a few panoramas loaded ahead
    this.heights = new Map(); // sequence -> Promise, camera height being measured
    this.groundAt = 0;
    this.linkKey = 0; // changes whenever the set of usable panoramas does
    this.warmed = null; // panorama whose neighbours have been loaded ahead
    // seq: manual heading/height per sequence, pano: manual position per image, auto: solved poses
    this.calib = { seq: {}, pano: {}, auto: {} };
    try {
      const saved = localStorage.getItem(CALIB_KEY);
      if (saved) Object.assign(this.calib, JSON.parse(saved));
      // from before the grid could turn: camera heights still hold, poses do not
      else Object.assign(this.calib.seq, (JSON.parse(localStorage.getItem('geocrafter:calib:v1') || '{}').seq) || {});
    } catch (e) {
      console.warn('calibration data unreadable', e);
    }
    const u = materials.uniforms;
    this.slots = [
      { i: 0, node: null, tex: null, target: null, cam: null, pos: u.uPosA.value, rot: u.uRotA.value, texU: u.uPanoA, depthU: u.uDepthA, patchU: u.uPatchA, patch: null, depthAt: 0, depthVersion: -1, depthKey: '' },
      { i: 1, node: null, tex: null, target: null, cam: null, pos: u.uPosB.value, rot: u.uRotB.value, texU: u.uPanoB, depthU: u.uDepthB, patchU: u.uPatchB, patch: null, depthAt: 0, depthVersion: -1, depthKey: '' },
    ];
    this.patchOn = u.uPatchOn.value;

    // what carries the camera: a survey vehicle from MASK degrees down, or nothing at all
    this.outlines = { survey: outlineTexture(() => MASK), none: outlineTexture(() => 90) };

    // one pass that rebuilds the ground under the capturing vehicle from two neighbouring photos
    this.patchMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uN1: { value: null }, uN2: { value: null }, uN3: { value: null },
        uE0: { value: null }, uE1: { value: null }, uE2: { value: null }, uE3: { value: null },
        uR0: { value: new THREE.Matrix3() }, uR1: { value: new THREE.Matrix3() }, uR2: { value: new THREE.Matrix3() }, uR3: { value: new THREE.Matrix3() },
        uO1: { value: new THREE.Vector3() }, uO2: { value: new THREE.Vector3() }, uO3: { value: new THREE.Vector3() },
        uUse: { value: new THREE.Vector3() }, uH: { value: 2 },
        uM1: { value: new THREE.Vector2() }, uM2: { value: new THREE.Vector2() }, uM3: { value: new THREE.Vector2() },
        uAxis: { value: new THREE.Vector2(1, 0) }, uSlope: { value: new THREE.Vector2() },
      },
      vertexShader: PATCH_VERT,
      fragmentShader: PATCH_FRAG,
      depthTest: false,
    });
    this.patchScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.patchMaterial);
    quad.frustumCulled = false;
    this.patchScene.add(quad);
    this.patchCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // where one can go from here: chevrons on the ground, like a street-view viewer
    const shape = new THREE.Shape();
    [[-0.5, -0.2], [0, 0.26], [0.5, -0.2], [0.5, -0.38], [0, 0.08], [-0.5, -0.38]].forEach(([x, y], k) => (k ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    const chevron = new THREE.ShapeGeometry(shape);
    chevron.rotateX(-Math.PI / 2); // lie flat, pointing north
    this.arrows = new THREE.Group();
    this.arrowMeshes = [];
    for (let k = 0; k < 6; k++) {
      // drawn over the ground whatever its exact height: the measured surface is never quite flat
      const edge = new THREE.Mesh(chevron, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false, depthTest: false }));
      edge.scale.setScalar(1.12);
      const face = new THREE.Mesh(chevron, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, depthTest: false }));
      face.renderOrder = 1; // after its own outline
      const g = new THREE.Group();
      g.add(edge, face);
      g.visible = false;
      g.renderOrder = 4;
      this.arrows.add(g);
      this.arrowMeshes.push({ group: g, face, link: null });
    }
    scene.add(this.arrows);

    const ring = new THREE.RingGeometry(0.5, 0.6, 32);
    ring.rotateX(-Math.PI / 2);
    this.markers = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, side: THREE.DoubleSide }), 400);
    this.markers.count = 0;
    this.markers.frustumCulled = false;
    this.markers.renderOrder = 3;
    scene.add(this.markers);
    this.markersAt = 0;
  }

  // ---- pose

  seqCalib(node) {
    return this.calib.seq[node.seq] || { heading: 0, height: node.height || (node.exact ? SURVEY_HEIGHT : DEFAULT_HEIGHT) };
  }

  // Panorama centre in world coordinates (needs node.sy, the ground surface height under it).
  center(node, out = new THREE.Vector3()) {
    const off = this.calib.pano[node.id] || node.fix || [0, 0];
    return out.set(node.x0 + off[0], node.sy + this.seqCalib(node).height, node.z0 + off[1]);
  }

  // Ground surface height under a panorama (asked from the terrain once).
  groundOf(node) {
    if (node.sy !== undefined) return Promise.resolve();
    if (!node.grounding) {
      node.grounding = this.world.groundY(new Float64Array([node.x0, node.z0])).then((ys) => {
        node.sy = ys[0];
        node.grounding = null;
      });
    }
    return node.grounding;
  }

  // GPS drift can put a panorama inside a building: slide it to the nearest open ground.
  unbury(node) {
    if (node.exact || node.fix || this.calib.pano[node.id] || !this.world.isLoaded(node.x0, node.z0)) return;
    const w = this.world;
    const gy = Math.round(node.sy) - 1; // block row of the ground
    // open sky, or a street running under a viaduct
    const open = (x, z) => {
      if (!w.isLoaded(x, z)) return false;
      const ty = w.topY(x, z);
      if (ty <= gy + 1) return true;
      const deck = DECKS.has(w.getBlock(x, ty, z)) || DECKS.has(w.getBlock(x, ty - 1, z));
      return deck && !SOLID[w.getBlock(x, gy + 2, z)];
    };
    const fx = Math.floor(node.x0), fz = Math.floor(node.z0);
    node.fix = [0, 0];
    if (open(fx, fz)) return;
    let best = null, bd = Infinity;
    for (let dz = -12; dz <= 12; dz++) {
      for (let dx = -12; dx <= 12; dx++) {
        const d = dx * dx + dz * dz;
        // keep a block of clearance so the camera is not pressed against the wall
        if (d < bd && open(fx + dx, fz + dz) && open(fx + dx + Math.sign(dx), fz + dz + Math.sign(dz))) {
          bd = d;
          best = [dx + Math.sign(dx), dz + Math.sign(dz)];
        }
      }
    }
    if (best) node.fix = best;
  }

  place(slot) {
    const node = slot.node;
    this.unbury(node);
    this.center(node, slot.pos);
    this.rotOf(node, slot.rot);
    slot.depthVersion = -1;
  }

  // World direction -> the panorama's own frame (+y up, image centre at -z).
  rotOf(node, out = new THREE.Matrix3()) {
    if (node.rot) out.set(...node.rot);
    else out.setFromMatrix4(new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(node.heading)));
    const extra = this.seqCalib(node).heading;
    if (extra) out.multiply(new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(extra))));
    return out;
  }

  // ---- search

  search(lon, lat) {
    const fail = (p) => (e) => this.errors.set(p.name, e.message);
    for (const p of this.providers) {
      if (p.around) {
        // dense sources are asked for the surroundings, again once the player has moved on
        const k = Math.cos((lat * Math.PI) / 180) * 111320;
        if (p.asked && Math.hypot((lon - p.asked[0]) * k, (lat - p.asked[1]) * 111320) < 70) continue;
        p.asked = [lon, lat];
        const key = `${p.name}:${lon.toFixed(5)},${lat.toFixed(5)}`;
        this.cells.set(key, 'loading');
        p.around(lon, lat, 170, (list) => this.add(list)).catch(fail(p)).then(() => this.cells.set(key, 'done'));
        continue;
      }
      // sparse sources: the grid cell under the player plus the neighbours it is close to
      const cx = lon / CELL, cy = lat / CELL;
      for (const ix of [Math.floor(cx - 0.3), Math.floor(cx + 0.3)]) {
        for (const iy of [Math.floor(cy - 0.3), Math.floor(cy + 0.3)]) {
          const key = `${p.name}:${ix},${iy}`;
          if (this.cells.has(key)) continue;
          this.cells.set(key, 'loading');
          const box = [ix * CELL, iy * CELL, (ix + 1) * CELL, (iy + 1) * CELL].map((v) => v.toFixed(5));
          p.search(...box).then((list) => this.add(list)).catch(fail(p)).then(() => this.cells.set(key, 'done'));
        }
      }
    }
  }

  add(found) {
    for (const n of found) {
      if (this.nodes.has(n.id)) continue;
      [n.x0, n.z0] = this.proj.lonLatToBlock(n.lon, n.lat);
      // Sources speak of compass directions; in here every direction is against the block grid,
      // which may be turned to the streets (Projection.turn). Converted once, on the way in.
      const turn = this.proj.turn || 0;
      if (turn) {
        n.heading = (((n.heading - turn) % 360) + 360) % 360;
        if (n.rot) {
          // (world -> photo) for a north-up world, times (grid -> north-up)
          const t = THREE.MathUtils.degToRad(-turn), c = Math.cos(t), sn = Math.sin(t), r = n.rot;
          n.rot = [r[0] * c - r[2] * sn, r[1], r[0] * sn + r[2] * c, r[3] * c - r[5] * sn, r[4], r[3] * sn + r[5] * c, r[6] * c - r[8] * sn, r[7], r[6] * sn + r[8] * c];
        }
      }
      n.gps = n.heading;
      const known = this.calib.auto[n.id];
      if (n.exact) {
        // surveyed pose: nothing to solve
        n.fix = [0, 0];
        n.aligned = n.confident = true;
      } else if (known) {
        n.heading = known.h;
        n.fix = [known.dx, known.dz];
        n.aligned = true;
        n.confident = known.ok;
      }
      this.nodes.set(n.id, n);
      this.list.push(n);
      this.linkKey++;
    }
    this.markersAt = 0;
  }

  // ---- camera height of a survey rig, measured from its own photos.
  // Two neighbouring panoramas see the same paving. Project both onto the ground for a trial
  // height and compare: only the true height makes the two pictures of the pavement coincide.
  missionHeight(node) {
    if (!node.exact || node.height || this.calib.seq[node.seq]) return Promise.resolve();
    let p = this.heights.get(node.seq);
    if (!p) {
      p = this.measureHeight(node).then((h) => {
        if (h) {
          this.calib.seq[node.seq] = { heading: 0, height: h };
          localStorage.setItem(CALIB_KEY, JSON.stringify(this.calib));
        } else this.heights.delete(node.seq); // try again from another spot later
      });
      this.heights.set(node.seq, p);
    }
    return p;
  }

  async measureHeight(a) {
    const mates = this.list
      .filter((n) => n.seq === a.seq && n !== a)
      .map((n) => [n, Math.hypot(n.x0 - a.x0, n.z0 - a.z0)])
      .filter(([, d]) => d > 3.5 && d < 7.5)
      .sort((p, q) => p[1] - q[1])
      .slice(0, 3);
    const luma = async (n) => {
      const src = await this.urlOf(n, 'sd');
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = src;
      });
      const w = 2000, h = 1000;
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const px = ctx.getImageData(0, 0, w, h).data;
      const out = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) out[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      return out;
    };
    const found = [];
    try {
      const la = await luma(a);
      for (const [b] of mates) {
        const lb = await luma(b);
        // the step from a to b as the photos see it: they are level, their centre column faces a.heading
        const dx = b.x0 - a.x0, dz = b.z0 - a.z0, t = THREE.MathUtils.degToRad(a.heading), c = Math.cos(t), sn = Math.sin(t);
        const r = groundMatch(la, lb, dx * c + dz * sn, dz * c - dx * sn);
        if (r) found.push(r.height);
      }
    } catch (e) {
      return 0;
    }
    if (!found.length) return 0;
    found.sort((p, q) => p - q);
    return Math.round(found[found.length >> 1] * 100) / 100;
  }

  searching() {
    for (const v of this.cells.values()) if (v === 'loading') return true;
    return false;
  }

  // `stay`: a sequence to prefer. Neighbouring streets may have been photographed in another
  // year; staying with one survey run while it is within a few metres avoids flipping seasons.
  nearest(x, z, max = 200, stay = null) {
    let best = null, bd = max;
    for (const n of this.list) {
      if (n.bad) continue;
      const d = Math.hypot(n.x0 - x, n.z0 - z) + (stay && era(n) !== stay ? 3 : 0);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  // Best panorama to travel to when looking along (dx, dz) from (x, z).
  ahead(x, z, dx, dz) {
    const l = Math.hypot(dx, dz) || 1;
    let best = null, bs = 0.35;
    for (const n of this.list) {
      if (n.bad || n === this.current) continue;
      const vx = n.x0 - x, vz = n.z0 - z;
      const d = Math.hypot(vx, vz);
      if (d < 3 || d > 160) continue;
      // in line with the view, and about ten metres away (walk-captured sequences have one every 3 m)
      const score = (vx * dx + vz * dz) / (d * l) - Math.abs(d - 10) / 150;
      if (score > bs) {
        bs = score;
        best = n;
      }
    }
    return best;
  }

  // ---- slots

  // Standard-definition image of a panorama. The cache owns these textures (slots only borrow
  // them), so stepping back, or using a neighbour to rebuild the ground, costs no download.
  imageOf(node) {
    let p = this.images.get(node.id);
    if (p) return p;
    p = this.urlOf(node, 'sd').then((url) => this.loadTexture(url));
    p.catch(() => this.images.delete(node.id));
    this.images.set(node.id, p);
    // keep it small: the oldest pictures that nothing is showing or waiting for go first
    for (const [id, old] of this.images) {
      if (this.images.size <= CACHE) break;
      if (id === node.id || (this.pending && this.pending.id === id) || this.slots.some((s) => s.node && s.node.id === id)) continue;
      this.images.delete(id);
      old.then((t) => {
        t.cached = false;
        if (!this.slots.some((s) => s.tex === t)) drop(t);
      }).catch(() => {});
    }
    return p;
  }

  // Load the panoramas the player is walking towards before they are needed.
  lookAhead(player) {
    const px = player.x + player.vx * 1.5, pz = player.z + player.vz * 1.5;
    let n = 0;
    for (const node of this.list
      .filter((q) => !q.bad && (q.x0 - px) ** 2 + (q.z0 - pz) ** 2 < 18 * 18)
      .sort((p, q) => (p.x0 - px) ** 2 + (p.z0 - pz) ** 2 - ((q.x0 - px) ** 2 + (q.z0 - pz) ** 2))) {
      if (n++ >= (node.picture ? 1 : 3)) break;
      if (!this.images.has(node.id)) this.imageOf(node).catch(() => {});
      this.groundOf(node);
    }
  }

  // Where a panorama's picture is: a plain address for most sources, something the source puts
  // together first for those that serve a panorama in pieces.
  urlOf(node, which) {
    return node.picture ? node.picture(which) : Promise.resolve(node[which]);
  }

  loadTexture(url) {
    return new Promise((resolve, reject) => {
      this.loader.load(url, (tex) => {
        tex.colorSpace = THREE.NoColorSpace;
        tex.minFilter = tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.cached = true;
        resolve(tex);
      }, undefined, () => reject(new Error('panorama image failed to load')));
    });
  }

  assign(idx, node, tex) {
    const slot = this.slots[idx];
    if (slot.tex && !slot.tex.cached) drop(slot.tex);
    slot.node = node;
    slot.tex = tex;
    slot.texU.value = tex;
    if (!slot.target) {
      slot.target = new THREE.WebGLCubeRenderTarget(DEPTH_SIZE, {
        type: THREE.FloatType,
        format: THREE.RedFormat,
        magFilter: THREE.NearestFilter,
        minFilter: THREE.NearestFilter,
        generateMipmaps: false,
      });
      slot.cam = new THREE.CubeCamera(0.05, 6000, slot.target);
      slot.depthU.value = slot.target.texture;
    }
    if (node.sky === undefined && !node.aligned && !node.rot) node.sky = photoProfile(tex.image);
    this.place(slot);
    this.renderDepth(slot);
    slot.patched = false;
    this.patchOn.setComponent(idx, 0);
    this.buildPatch(slot, node);
    if (this.hd && node.hd) this.upgrade(slot, node);
  }

  // ---- links: where one can travel from a panorama (nearest neighbour in each direction)

  links(node) {
    const key = `${this.linkKey}:${this.world.version}`;
    if (node.links && node.linksKey === key) return node.links;
    const cand = [];
    for (const n of this.list) {
      if (n === node || n.bad) continue;
      const dx = n.x0 - node.x0, dz = n.z0 - node.z0;
      const d = Math.hypot(dx, dz);
      if (d < 2.5 || d > 70) continue;
      // another survey year at the same spot is a worse step than staying with this one
      cand.push({ node: n, d, az: Math.atan2(dx, -dz), rank: d + (era(n) === era(node) ? 0 : 2.5) });
    }
    cand.sort((a, b) => a.rank - b.rank);
    const out = [];
    for (const c of cand) {
      if (c.d > Math.max(13, cand[0].d * 2.4) || out.length >= 6) break;
      if (out.some((o) => angle(o.az, c.az) < 0.85)) continue;
      // whoever took the photos went from one frame to the next; any other step needs a clear view
      const driven = (c.node.run !== undefined && c.node.run === node.run && Math.abs(c.node.order - node.order) <= 3) || (node.near !== undefined && node.near.has(c.node.id));
      if (driven || this.clearBetween(node, c.node)) out.push(c);
    }
    node.links = out;
    node.linksKey = key;
    return out;
  }

  // No wall between two panoramas (checked at head height; tree crowns do not count).
  clearBetween(a, b) {
    if (a.sy === undefined) return true;
    const w = this.world;
    const y = Math.floor(a.sy + 1.5);
    const dx = b.x0 - a.x0, dz = b.z0 - a.z0;
    const n = Math.ceil(Math.hypot(dx, dz) / 0.5);
    for (let i = 1; i < n; i++) {
      const x = Math.floor(a.x0 + (dx * i) / n), z = Math.floor(a.z0 + (dz * i) / n);
      const id = w.getBlock(x, y, z);
      if (SOLID[id] && id !== B.CANOPY && SOLID[w.getBlock(x, y + 1, z)]) return false;
    }
    return true;
  }

  // The link closest to a compass direction (radians, clockwise from north), or null.
  linkToward(node, az, tolerance = 1.0) {
    let best = null, bd = tolerance;
    for (const l of this.links(node)) {
      const d = angle(l.az, az);
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best;
  }

  // Replace whatever carried the camera with ground. Survey panoramas get the real paving, as
  // the panoramas taken just before and after saw it. The others (poses too rough for that) get
  // a soft fill in the colours of the ground around the feet.
  // `stay`: the player has stopped here, so pictures that are not loaded yet may be fetched.
  async buildPatch(slot, node, stay = false) {
    if (!node.exact) return this.blurFill(slot, FOOT);
    const own = this.outline(node, slot.tex);
    if (!own) return; // nothing was painted out of this picture: nothing to mend
    let links = this.links(node).filter((l) => l.node.exact && l.d < (node.picture ? 16 : 9.5));
    if (node.epoch) {
      // photos of the same drive first: the light and the parked cars match
      const same = links.filter((l) => l.node.epoch === node.epoch);
      if (same.length) links = same;
    }
    if (!links.length) return node.picture ? undefined : this.blurFill(slot, MASK);
    const first = links[0];
    const second = links.slice(1).sort((a, b) => angle(b.az, first.az) - angle(a.az, first.az))[0];
    let pick = second ? [first, second] : [first];
    if (node.picture) {
      // A smeared-out car leaves a long tail behind it, longer than the step to the next photo:
      // the photo ahead looks at it through its own tail. The photo two steps back sees it clearly.
      const back = THREE.MathUtils.degToRad(node.heading + 180);
      const behind = pick.find((l) => angle(l.az, back) < 0.7);
      const far = behind && this.links(behind.node)
        .filter((l) => l.node !== node && l.node.exact && l.node.epoch === node.epoch && l.d < 16 && angle(l.az, behind.az) < 0.7)[0];
      if (far) pick.push({ node: far.node });
    }
    if (node.picture && !stay) {
      // A picture put together from pieces costs many requests: use the neighbours that are
      // loaded anyway now, and ask for the others only once the player has stopped here.
      const have = pick.filter((l) => this.images.has(l.node.id));
      if (have.length < pick.length) {
        setTimeout(() => {
          if (slot.node === node) this.buildPatch(slot, node, true);
        }, 1500);
      }
      if (!have.length) return;
      pick = have;
    }
    try {
      const tex = await Promise.all(pick.map((l) => Promise.all([this.imageOf(l.node), this.groundOf(l.node), this.missionHeight(l.node)]).then((r) => r[0])));
      if (slot.node !== node) return;
      if (!slot.patch) {
        slot.patch = new THREE.WebGLRenderTarget(4096, 800, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, generateMipmaps: false });
      }
      const u = this.patchMaterial.uniforms;
      const mine = this.center(node);
      // Where a source gives its cameras' altitudes, those say how the street rises between two
      // photos; the block terrain underneath only knows whole metres.
      const offset = (n, out) => {
        out.copy(this.center(n)).sub(mine);
        if (node.alt != null && n.alt != null) out.y = n.alt - node.alt;
        return out;
      };
      const o1 = offset(pick[0].node, u.uO1.value);
      const o2 = pick[1] ? offset(pick[1].node, u.uO2.value) : null;
      if (pick[2]) offset(pick[2].node, u.uO3.value);
      const l1 = Math.hypot(o1.x, o1.z) || 1;
      u.uAxis.value.set(o1.x / l1, o1.z / l1);
      let rise = 0, back = 0;
      if (node.alt != null) {
        const steep = (v) => THREE.MathUtils.clamp(v, -0.12, 0.12);
        rise = steep(o1.y / l1);
        back = -rise; // one slope right through, unless a neighbour on the other side says otherwise
        const t2 = o2 ? o2.x * u.uAxis.value.x + o2.z * u.uAxis.value.y : 0;
        if (t2 < -3) back = steep(o2.y / -t2);
      }
      u.uSlope.value.set(rise, back);
      // a fixed angle is only roughly where a survey vehicle ends: keep well clear of it. An
      // outline read off the picture is already drawn generously.
      const margin = (n, out) => (n.picture ? out.set(0, 0.035) : out.set(0.01, 0.09));
      u.uE0.value = own;
      [[u.uN1, u.uE1, u.uR1, u.uM1], [u.uN2, u.uE2, u.uR2, u.uM2], [u.uN3, u.uE3, u.uR3, u.uM3]].forEach(([image, outline, rot, clear], k) => {
        const n = (pick[k] || pick[0]).node, t = tex[k] || tex[0]; // an unused place repeats the first: it must still hold a texture
        image.value = t;
        outline.value = this.outline(n, t) || this.outlines.none;
        this.rotOf(n, rot.value);
        margin(n, clear.value);
      });
      this.rotOf(node, u.uR0.value);
      u.uUse.value.set(1, pick[1] ? 1 : 0, pick[2] ? 1 : 0);
      u.uH.value = this.seqCalib(node).height;
      const old = this.renderer.getRenderTarget();
      this.renderer.setRenderTarget(slot.patch);
      this.renderer.render(this.patchScene, this.patchCamera);
      this.renderer.setRenderTarget(old);
      slot.patchU.value = slot.patch.texture;
      slot.patched = true; // fades in (see update)
    } catch (e) {
      if (slot.node === node && !node.picture) this.blurFill(slot, MASK);
    }
  }

  // Where a photo's own vehicle begins, per direction, as a texture for the patch shader
  // (degrees below the horizon / 90). Survey vehicles: the same angle all round. Sources that
  // smear their car out: read off the picture once (see smearOutline). Null: nothing to hide.
  outline(node, tex) {
    if (!node.picture) return this.outlines.survey;
    if (node.outline !== undefined) return node.outline;
    const img = tex && tex.image;
    if (!img || !img.width || (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap)) return this.outlines.survey; // not readable now: assume the usual
    const TOP = 10, cw = 1024, ch = Math.round((cw / 2) * ((90 - TOP) / 180));
    if (!this.strip) {
      this.strip = document.createElement('canvas');
      this.strip.width = cw;
      this.strip.height = ch;
    }
    const ctx = this.strip.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    const y0 = img.height * (0.5 + TOP / 180);
    ctx.drawImage(img, 0, y0, img.width, img.height - y0, 0, 0, cw, ch);
    let edge = null;
    try {
      edge = smearOutline(ctx.getImageData(0, 0, cw, ch).data, cw, ch, TOP);
    } catch (e) {
      return this.outlines.survey; // image served without CORS headers
    }
    node.outline = edge ? outlineTexture((u) => edge[Math.min(cw - 1, Math.floor(u * cw))]) : null;
    return node.outline;
  }

  // Soft fill for the bottom of a slot's panorama, from `from` degrees below the horizon down:
  // the colours of the ring of ground just above it, blurred around the circle.
  blurFill(slot, from) {
    const img = slot.tex && slot.tex.image;
    if (!img || !img.width || (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap)) return;
    const W = 256, H = 64, RING = 8;
    if (!this.ring) {
      this.ring = document.createElement('canvas');
      this.ring.width = W;
      this.ring.height = RING;
    }
    const ctx = this.ring.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    const row = (deg) => (0.5 + deg / 180) * img.height; // image row of an angle below the horizon
    ctx.drawImage(img, 0, row(from - 10), img.width, row(from - 1) - row(from - 10), 0, 0, W, RING);
    let px;
    try {
      px = ctx.getImageData(0, 0, W, RING).data;
    } catch (e) {
      return; // image served without CORS headers
    }
    let cols = new Float32Array(W * 3);
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < RING; y++) for (let k = 0; k < 3; k++) cols[x * 3 + k] += px[(y * W + x) * 4 + k] / RING;
    }
    for (let pass = 0; pass < 2; pass++) {
      const next = new Float32Array(W * 3);
      const R = 18; // two box blurs of +-25 degrees: a wide, smooth kernel
      for (let x = 0; x < W; x++) {
        for (let k = 0; k < 3; k++) {
          let sum = 0;
          for (let d = -R; d <= R; d++) sum += cols[((x + d + W) % W) * 3 + k];
          next[x * 3 + k] = sum / (2 * R + 1);
        }
      }
      cols = next;
    }
    const mean = [0, 0, 0];
    for (let x = 0; x < W; x++) for (let k = 0; k < 3; k++) mean[k] += cols[x * 3 + k] / W;
    if (!slot.fill) {
      slot.fill = new THREE.DataTexture(new Uint8Array(W * H * 4), W, H, THREE.RGBAFormat);
      slot.fill.minFilter = slot.fill.magFilter = THREE.LinearFilter;
      slot.fill.wrapS = THREE.RepeatWrapping;
    }
    const out = slot.fill.image.data;
    for (let y = 0; y < H; y++) {
      const below = 90 - ((y + 0.5) / H) * (90 + THREE.MathUtils.radToDeg(PATCH_TOP)); // row 0 is straight down, the last one at the top of the patch
      const alpha = THREE.MathUtils.smoothstep(below, from, from + 6) * 255;
      const spread = Math.min(1, (90 - below) / 35); // every direction meets at the nadir: one colour there
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        for (let k = 0; k < 3; k++) out[i + k] = mean[k] + (cols[x * 3 + k] - mean[k]) * spread;
        out[i + 3] = alpha;
      }
    }
    slot.fill.needsUpdate = true;
    slot.patchU.value = slot.fill;
    slot.patched = true;
    this.patchOn.setComponent(slot.i, 1);
  }

  settled() {
    return this.world.far.size > 0 && this.world.inflight.size === 0 && this.world.farInflight.size === 0;
  }

  // Enough of the city model is loaded around a panorama to match its skyline.
  canAlign(node) {
    return this.world.isLoaded(node.x0, node.z0) && this.world.far.size >= 150;
  }

  // Find where the photo was really taken and which way it faces (once per image, then
  // remembered). Resolves when the node's pose is final.
  solve(node, image) {
    if (node.aligned || node.rot) return Promise.resolve();
    if (node.solving) return node.solving;
    if (node.sky === undefined) {
      if (!image) return Promise.resolve();
      node.sky = photoProfile(image);
    }
    if (!node.sky) {
      node.aligned = true; // no visible sky (tunnel, canopy): nothing to match
      return Promise.resolve();
    }
    node.solving = this.groundOf(node).then(() => this.world.alignPano({ x: node.x0, z: node.z0, height: this.seqCalib(node).height, gps: node.gps, photo: node.sky })).then((res) => {
      node.solving = null;
      node.aligned = true;
      node.align = res;
      node.confident = res.confident;
      node.fix = [res.dx, res.dz];
      if (res.confident) node.heading = res.heading;
      this.calib.auto[node.id] = { h: node.heading, dx: res.dx, dz: res.dz, ok: res.confident };
      localStorage.setItem(CALIB_KEY, JSON.stringify(this.calib));
      this.markersAt = 0;
    });
    return node.solving;
  }

  // Quietly align the panoramas the player is likely to visit next.
  prefetch(player) {
    let best = null, bd = 90 * 90;
    for (const n of this.list) {
      if (n.aligned || n.rot || n.bad || n.solving || n.fetching || !this.canAlign(n)) continue;
      const d = (n.x0 - player.x) ** 2 + (n.z0 - player.z) ** 2;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (!best) return;
    best.fetching = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => this.solve(best, img);
    img.onerror = () => {
      best.bad = true;
      this.linkKey++;
    };
    this.urlOf(best, 'sd').then((url) => (img.src = url), img.onerror);
  }
  // Swap in the full-resolution image once the viewer has stayed on a panorama for a moment.
  // It is decoded (and capped in size) off the main thread, then uploaded as a bitmap.
  upgrade(slot, node) {
    setTimeout(async () => {
      if (slot.node !== node) return;
      try {
        const blob = await (await fetch(await this.urlOf(node, 'hd'), { mode: 'cors' })).blob();
        if (slot.node !== node) return;
        const max = Math.min(HD_MAX, this.renderer.capabilities.maxTextureSize);
        const known = node.width > 0 && node.width <= max;
        const opts = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
        if (!known) Object.assign(opts, { resizeWidth: node.width ? max : 4096, resizeHeight: (node.width ? max : 4096) / 2, resizeQuality: 'high' });
        const bmp = await createImageBitmap(blob, opts);
        if (slot.node !== node) return bmp.close();
        const tex = new THREE.Texture(bmp);
        tex.flipY = false; // already flipped while decoding
        tex.colorSpace = THREE.NoColorSpace;
        tex.minFilter = tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        if (!slot.tex.cached) drop(slot.tex);
        slot.tex = tex;
        slot.texU.value = tex;
      } catch (e) {
        // the standard-definition image stays
      }
    }, node.picture ? 1500 : 600); // a picture put together from pieces costs many requests: only for a real stop
  }

  release(idx) {
    const slot = this.slots[idx];
    if (slot.tex && !slot.tex.cached) drop(slot.tex);
    slot.tex = null;
    slot.node = null;
    slot.texU.value = this.materials.blank;
  }

  finishFade() {
    if (!this.fade) return;
    const from = this.active;
    this.active = this.fade.to;
    this.fade = null;
    if (from >= 0 && from !== this.active) this.release(from);
  }

  // Make `node` the visible panorama (cross-fading from the current one). With snap, the camera
  // also travels to its centre and locks there - the exact view the photo was taken from.
  async goTo(node, snap = false) {
    if (!node || node === this.pending) return;
    if (node === this.current && !this.fade) {
      if (snap) this.startHop(node);
      return;
    }
    const token = ++this.token;
    this.pending = node;
    // While this picture loads and the camera travels, fetch the ones beyond it as well: with a
    // direction key held down the next step should not have to wait for its picture.
    if (snap && node.picture && this.current && this.current !== node) {
      // the brisker the pace, the farther ahead: a picture takes about a second to put together
      let from = this.current, at = node;
      for (let ahead = this.pace >= 2.5 ? 3 : this.pace >= 1.25 ? 2 : 1; ahead > 0; ahead--) {
        const on = this.linkToward(at, Math.atan2(at.x0 - from.x0, from.z0 - at.z0), 0.7);
        if (!on) break;
        if (!this.images.has(on.node.id)) this.imageOf(on.node).then((t) => this.renderer.initTexture(t)).catch(() => {});
        from = at;
        at = on.node;
      }
    }
    let tex;
    try {
      tex = await this.imageOf(node);
    } catch (e) {
      node.bad = true;
      this.linkKey++;
      if (token === this.token) this.pending = null;
      return;
    }
    if (token !== this.token) return;
    await Promise.all([this.groundOf(node), this.missionHeight(node)]);
    if (token !== this.token) return;
    if (this.canAlign(node)) {
      await this.solve(node, tex.image);
      if (token !== this.token) return;
    }
    this.pending = null;
    this.finishFade();
    const idx = this.active < 0 ? 0 : 1 - this.active;
    this.assign(idx, node, tex);
    if (this.active < 0) this.active = idx;
    else this.fade = { to: idx, t: 0, dur: Math.max(0.15, 0.45 / this.pace) };
    this.current = node;
    this.markersAt = 0;
    if (snap) this.startHop(node);
    if (this.onChange) this.onChange(node);
  }

  startHop(node) {
    this.snapped = null;
    const slot = this.slotOf(node);
    const far = slot ? this.camPos.distanceTo(slot.pos) : 0;
    this.hop = { node, from: this.camPos.clone(), t: 0, dur: far > 60 ? 0.05 : THREE.MathUtils.clamp(0.3 + far * 0.03, 0.4, 0.9) / this.pace };
  }

  // Let go of the camera (free walking).
  unlock() {
    this.snapped = null;
    this.hop = null;
  }

  locked() {
    return !!(this.snapped || this.hop);
  }

  slotOf(node) {
    return this.slots.find((s) => s.node === node);
  }

  // Camera position while locked or travelling, else null.
  viewPos(out) {
    if (this.hop) {
      const slot = this.slotOf(this.hop.node);
      if (!slot) return null;
      return out.copy(this.hop.from).lerp(slot.pos, ease(Math.min(1, this.hop.t)));
    }
    if (this.snapped) {
      const slot = this.slotOf(this.snapped);
      return slot ? out.copy(slot.pos) : null;
    }
    return null;
  }

  // ---- depth

  renderDepth(slot) {
    const { renderer, scene, materials, world } = this;
    const c = slot.pos;
    materials.depthUniforms.uCenter.value.copy(c);
    // voxel chunks are complete within `clip` of the player; keep the two detail levels apart
    const near = Math.max(0, this.clip - Math.hypot(c.x - this.player[0], c.z - this.player[1]));
    materials.depthUniforms.uClip.value.set(c.x, c.z, near);
    const undo = world.beginDepthPass();
    const vis = this.hidden.map((o) => o.visible);
    this.hidden.forEach((o) => (o.visible = false));
    this.markers.visible = false;
    this.arrows.visible = false;
    const oldColor = renderer.getClearColor(new THREE.Color());
    const oldAlpha = renderer.getClearAlpha();
    renderer.setClearColor(new THREE.Color(1e6, 0, 0), 1); // "nothing here": infinitely far
    slot.cam.position.copy(c);
    slot.cam.update(renderer, scene);
    renderer.setClearColor(oldColor, oldAlpha);
    this.hidden.forEach((o, i) => (o.visible = vis[i]));
    this.markers.visible = true;
    this.arrows.visible = true;
    undo();
    slot.depthVersion = world.version;
    slot.depthAt = performance.now();
    slot.depthKey = `${Math.round(near / 8)}`;
  }

  // ---- calibration (per sequence: heading + camera height; per panorama: position)

  adjust(node, { heading = 0, height = 0, dx = 0, dz = 0, reset = false }) {
    if (reset) {
      delete this.calib.seq[node.seq];
      delete this.calib.pano[node.id];
      delete this.calib.auto[node.id];
      node.fix = null;
      node.heading = node.gps;
      node.aligned = false;
      node.fetching = false;
    } else {
      const s = (this.calib.seq[node.seq] = { ...this.seqCalib(node) });
      s.heading = Math.round((s.heading + heading) * 100) / 100;
      s.height = Math.max(0.5, Math.round((s.height + height) * 100) / 100);
      if (dx || dz) {
        const o = this.calib.pano[node.id] || node.fix || [0, 0];
        this.calib.pano[node.id] = [o[0] + dx, o[1] + dz];
      }
    }
    localStorage.setItem(CALIB_KEY, JSON.stringify(this.calib));
    for (const slot of this.slots) if (slot.node) this.place(slot);
    this.markersAt = 0;
    return { ...this.seqCalib(node), offset: this.calib.pano[node.id] || node.fix || [0, 0] };
  }

  // ---- per frame

  update(dt, camPos, player, clip, free) {
    this.camPos = camPos;
    this.clip = clip;
    this.player = [player.x, player.z];
    const now = performance.now();

    if (now - this.searchAt > 1000) {
      this.searchAt = now;
      const [lon, lat] = this.proj.blockToLonLat(player.x, player.z);
      this.search(lon, lat);
    }

    if (this.fade) {
      this.fade.t += dt / this.fade.dur;
      if (this.fade.t >= 1) this.finishFade();
    }
    if (this.hop) {
      this.hop.t += dt / this.hop.dur;
      if (this.hop.t >= 1) {
        this.snapped = this.hop.node;
        this.hop = null;
      }
    }
    // standing in a panorama: have its neighbours ready, so the next step starts at once
    if (this.snapped && this.snapped !== this.warmed && !this.pending) {
      const from = this.warmed, here = this.snapped;
      this.warmed = here;
      let ready = this.links(here).slice(0, 3);
      for (const l of ready) this.groundOf(l.node);
      if (here.picture) {
        // a picture put together from pieces costs many requests: only the one straight on is
        // fetched now, the others when the player turns to them (see updateArrows)
        const on = from && from !== here ? this.linkToward(here, Math.atan2(here.x0 - from.x0, from.z0 - here.z0), 0.7) : null;
        ready = on ? [on] : [];
      }
      for (const l of ready) {
        if (!this.images.has(l.node.id)) this.imageOf(l.node).then((t) => this.renderer.initTexture(t)).catch(() => {});
      }
    }

    // walking around: the nearest panorama takes over (with a little hysteresis)
    if (free && !this.pending && !this.fade && now - this.switchAt > 250) {
      this.switchAt = now;
      const n = this.nearest(player.x, player.z, 150, this.current && era(this.current));
      if (n && n !== this.current) {
        const cur = this.current ? Math.hypot(this.current.x0 - player.x, this.current.z0 - player.z) : Infinity;
        if (Math.hypot(n.x0 - player.x, n.z0 - player.z) + 2 < cur) this.goTo(n, false);
      }
    }

    for (const slot of this.slots) {
      const k = this.patchOn.getComponent(slot.i);
      if (slot.patched && k < 1) this.patchOn.setComponent(slot.i, Math.min(1, k + dt * 5));
    }
    const u = this.materials.uniforms.uPano.value;
    const mixTo = this.fade ? (this.fade.to === 1 ? ease(this.fade.t) : 1 - ease(this.fade.t)) : this.active === 1 ? 1 : 0;
    u.set(this.slots[0].node ? 1 : 0, this.slots[1].node ? 1 : 0, mixTo);

    // depth maps follow the world as it streams in or gets edited (one refresh per frame at most)
    for (const slot of this.slots) {
      if (!slot.node) continue;
      const near = Math.max(0, clip - Math.hypot(slot.pos.x - player.x, slot.pos.z - player.z));
      const stale = slot.depthVersion !== this.world.version || slot.depthKey !== `${Math.round(near / 8)}`;
      if (stale && now - slot.depthAt > 350) {
        this.place(slot); // ground / unbury may resolve once the chunk under it has loaded
        this.renderDepth(slot);
        break;
      }
      // shown before the model had loaded: align now and re-place it
      const node = slot.node;
      if (!node.aligned && !node.rot && !node.solving && slot.tex && this.canAlign(node)) {
        this.solve(node, null).then(() => {
          if (slot.node === node) this.place(slot);
        });
      }
    }

    if (now - this.prefetchAt > 1200 && !this.pending) {
      this.prefetchAt = now;
      this.prefetch(player);
    }
    if (free && now - this.groundAt > 300) {
      this.groundAt = now;
      this.lookAhead(player);
    }

    if (now - this.markersAt > 600) {
      this.markersAt = now;
      this.updateMarkers();
    }
  }

  // Rings mark the panoramas reachable from the current one (their ground height is looked
  // up lazily); chevrons around the viewer point at them.
  updateMarkers() {
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    const links = this.current ? this.links(this.current) : [];
    let count = 0;
    const need = [];
    for (const l of links) {
      const n = l.node;
      if (n.sy === undefined) {
        if (!n.grounding) need.push(n);
        continue;
      }
      this.center(n, v);
      m.makeTranslation(v.x, v.y - this.seqCalib(n).height + 0.06, v.z);
      this.markers.setMatrixAt(count++, m);
    }
    this.markers.count = count;
    this.markers.instanceMatrix.needsUpdate = true;
    if (need.length) {
      const pts = new Float64Array(need.length * 2);
      need.forEach((n, i) => {
        pts[i * 2] = n.x0;
        pts[i * 2 + 1] = n.z0;
      });
      const job = this.world.groundY(pts).then((ys) => {
        need.forEach((n, i) => {
          n.sy = ys[i];
          n.grounding = null;
        });
        this.markersAt = 0;
      });
      need.forEach((n) => (n.grounding = job));
    }
  }

  // Chevrons on the ground around the viewer; the one the player faces (or points at) is
  // highlighted. `az`: compass direction the player looks in. Returns the link ahead.
  updateArrows(az, show) {
    const node = this.snapped;
    const slot = node && this.slotOf(node);
    const links = show && slot ? this.links(node) : [];
    const ahead = links.length ? this.linkToward(node, az, 1.15) : null;
    const lit = ahead;
    // a stitched panorama is fetched ahead once the player has looked its way for a moment
    if (lit && lit.node.picture && !this.pending) {
      const now = performance.now();
      if (this.eyed !== lit.node) {
        this.eyed = lit.node;
        this.eyedAt = now;
      } else if (now - this.eyedAt > 350) {
        this.eyedAt = Infinity; // once per look
        if (!this.images.has(lit.node.id)) this.imageOf(lit.node).then((t) => this.renderer.initTexture(t)).catch(() => {});
      }
    }
    this.arrowMeshes.forEach((a, k) => {
      const l = links[k];
      a.group.visible = !!l;
      a.link = l || null;
      if (!l) return;
      const r = Math.min(3.8, l.d * 0.72);
      a.group.position.set(slot.pos.x + Math.sin(l.az) * r, slot.pos.y - this.seqCalib(node).height + 0.09, slot.pos.z - Math.cos(l.az) * r);
      a.group.rotation.y = -l.az;
      a.group.scale.setScalar(l === lit ? 0.95 : 0.8);
      a.face.material.opacity = l === lit ? 0.85 : 0.4; // the lit one is only more solid, not coloured
    });
    return ahead;
  }
}
