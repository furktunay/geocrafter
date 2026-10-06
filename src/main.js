import * as THREE from 'three';
import { SEA_Y, FAR_TILE, FAR_RADIUS } from './config.js';
import { Projection } from './geo.js';
import { B, SOLID } from './blocks.js';
import { createMaterials } from './materials.js';
import { World } from './world.js';
import { Player, EYE } from './player.js';
import { Sky } from './sky.js';
import { UI } from './ui.js';
import { Hand } from './hand.js';
import { Effects } from './fx.js';
import { Mobs } from './mobs.js';
import { sfx } from './sound.js';
import { I, FOOD, isBlock, itemName, DEFAULT_SLOTS } from './items.js';
import { loadTexturePack } from './pack.js';
import { PanoManager, AmsterdamProvider, PanoramaxProvider, MapillaryProvider, TOKEN_KEY } from './pano.js';

const REACH_WALK = 9;
const REACH_LOCKED = 80; // standing in a photo, you build at a distance
const MELEE = 6;
const SLOTS_KEY = 'streetcraft:slots:v1';
const XP_KEY = 'streetcraft:xp:v1';
const $ = (id) => document.getElementById(id);

// A short list on purpose. Amsterdam: the municipality's survey panoramas (8000 px, every 5 m,
// measured poses) over the national laser scan, so photo and geometry agree without guessing.
// Istanbul: panoramas a volunteer shot on foot (no vehicle in them); their poses are GPS-grade.
const LOCATIONS = [
  { name: 'Dam Meydanı', sub: 'Amsterdam · kraliyet sarayı', lat: 52.37309, lon: 4.89318 },
  { name: 'Prinsengracht', sub: 'Amsterdam · Westerkerk, kanal', lat: 52.37449, lon: 4.88377 },
  { name: 'Brouwersgracht', sub: 'Amsterdam · Jordaan kanalları', lat: 52.38072, lon: 4.88688 },
  { name: 'Museumplein', sub: 'Amsterdam · Rijksmuseum', lat: 52.35953, lon: 4.88484 },
  { name: 'Eminönü', sub: 'İstanbul · Yeni Cami meydanı', lat: 41.01684, lon: 28.97314 },
  { name: 'Kadıköy İskelesi', sub: 'İstanbul · meydan ve iskele', lat: 40.99156, lon: 29.0225 },
  { name: 'Moda', sub: 'İstanbul · Kadıköy sokakları', lat: 40.98057, lon: 29.02377 },
];

const params = new URLSearchParams(location.search);
const loc = params.has('lat') && params.has('lon')
  ? { name: params.get('name') || 'Özel konum', lat: +params.get('lat'), lon: +params.get('lon') }
  : LOCATIONS[0];

function goTo(l) {
  const q = new URLSearchParams({ lat: l.lat.toFixed(5), lon: l.lon.toFixed(5), name: l.name });
  location.search = q.toString();
}

// ---------------------------------------------------------------- scene

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, 1, 0.1, 6000);
camera.rotation.order = 'YXZ';

// a texture pack, if one is installed, replaces the built-in drawings before anything uses them
const packGui = await loadTexturePack();
const materials = createMaterials();
const proj = new Projection(loc.lon, loc.lat);
const world = new World(scene, materials, `plateaucraft:v1:${loc.lat.toFixed(5)},${loc.lon.toFixed(5)}`);
const player = new Player(world);
const sky = new Sky(scene, materials);
const hand = new Hand();

// Saved inventories from before the items changed keep their storage and get the new hotbar
// (the bow and the skeleton egg did not exist then).
const SLOTS_VERSION = 2;
function loadSlots() {
  try {
    const a = JSON.parse(localStorage.getItem(SLOTS_KEY));
    if (Array.isArray(a) && a.length === 36 && a.every((v) => v === 0 || itemName(v))) {
      if (+localStorage.getItem(`${SLOTS_KEY}:version`) < SLOTS_VERSION) a.splice(0, 9, ...DEFAULT_SLOTS.slice(0, 9));
      return a;
    }
  } catch (e) {
    console.warn('saved inventory unreadable', e);
  }
  return DEFAULT_SLOTS.slice();
}
const slots = loadSlots();
const ui = new UI(slots, packGui);

const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
);
outline.visible = false;
scene.add(outline);

const token = localStorage.getItem(TOKEN_KEY) || '';
// Where the city's own survey panoramas exist they are the only source: mixing in GPS-posed
// images would bring back the misalignment they avoid.
const survey = AmsterdamProvider.covers(loc.lon, loc.lat);
const providers = survey ? [new AmsterdamProvider()] : [new PanoramaxProvider()];
if (token && !survey) providers.push(new MapillaryProvider(token));

// ---------------------------------------------------------------- player state

const stats = { health: 20, food: 20, xp: +localStorage.getItem(XP_KEY) || 0, hurtAt: -10, healAt: 0 };
let clock = 0; // seconds of game time
let dead = false;
let shake = 0;
const visited = new Set();
const tmp = new THREE.Vector3();

// Level and progress to the next one (each level costs a little more than the last).
function levelOf(total) {
  let l = 0;
  while (total >= 2 * l + 7) {
    total -= 2 * l + 7;
    l++;
  }
  return [l, total / (2 * l + 7)];
}

function addXp(n) {
  const before = levelOf(stats.xp)[0];
  stats.xp += n;
  localStorage.setItem(XP_KEY, stats.xp.toFixed(2));
  if (levelOf(stats.xp)[0] > before) sfx.level();
}

const tire = (n) => (stats.food = Math.max(0, stats.food - n));

function damage(n) {
  if (dead || n <= 0) return;
  stats.health = Math.max(0, stats.health - n);
  stats.hurtAt = clock;
  ui.hurt();
  sfx.hurt();
  if (stats.health > 0) return;
  dead = true;
  keys.clear();
  clearInterval(repeat);
  ui.showDeath(`Skor: ${Math.floor(stats.xp)}`);
  if (locked()) document.exitPointerLock();
}

const fx = new Effects(scene, world, {
  onFuse: (seconds) => sfx.fuse(seconds),
  onExplode: ({ x, y, z, blocks, power }) => {
    const d = camera.position.distanceTo(tmp.set(x, y, z));
    sfx.boom(d);
    shake = Math.max(shake, Math.min(1.6, 9 / (d + 2)));
    const reach = power * 2;
    if (d < reach) {
      damage(Math.round(24 * (1 - d / reach) ** 1.4));
      if (roam) {
        const k = (1 - d / reach) * 14;
        player.vx += ((camera.position.x - x) / (d || 1)) * k;
        player.vz += ((camera.position.z - z) / (d || 1)) * k;
        player.vy += k * 0.6;
      }
    }
    addXp(blocks * 0.02);
  },
});

const mobs = new Mobs(scene, world, {
  onShoot: () => sfx.bow(),
  onThud: () => sfx.thud(),
  onStruck: (n, dx, dz) => {
    damage(n);
    shake = Math.max(shake, 0.5);
    if (roam) {
      player.vx += dx * 5;
      player.vz += dz * 5;
    }
  },
  onDeath: (x, y, z) => {
    fx.burst(x, y, z, [0.86, 0.86, 0.82], 26, 4.2, 0.13, 1);
    sfx.rattle();
    addXp(5);
  },
});

const panos = new PanoManager({ renderer, scene, world, materials, proj, providers, hidden: [sky.mesh, outline, fx.group, mobs.group] });
panos.onChange = (node) => {
  if (visited.has(node.id)) return;
  visited.add(node.id);
  if (visited.size > 1) addXp(1); // every new place seen
};

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  hand.resize(camera.aspect);
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- state

let spawned = false;
let arrived = false; // first panorama chosen (or none exists here)
let faced = false; // turned to look down the street once
let roam = false; // off the photos: walking or flying freely (the photo skin warps out there)
let debug = false;
let photoOn = true;
let calibrating = false;
let clip = 0; // metres of fully loaded voxel terrain around the player
let elevOffset = 0;
let radius = +localStorage.getItem('plateaucraft:radius') || (survey ? 9 : 12); // laser-scan tiles are heavy
world.setRadius(radius);
const keys = new Set();
const view = new THREE.Vector3();
const locked = () => document.pointerLockElement === canvas;
// playing: the game has the input. Normally that means the pointer is locked; where the browser
// refuses the lock (embedded views), `dragLook` takes over: drag to look, click to act, Esc for menu.
let playing = false;
let dragLook = false;
// Standing in a photo, these keys step to the neighbouring photo in that direction (an angle
// to the right of where the player looks).
const HOPS = { KeyW: 0, ArrowUp: 0, KeyD: Math.PI / 2, ArrowRight: Math.PI / 2, KeyS: Math.PI, ArrowDown: Math.PI, KeyA: -Math.PI / 2, ArrowLeft: -Math.PI / 2 };

world.on('ready', (m) => {
  elevOffset = m.elevation > 150 ? Math.round(m.elevation) - 60 : 0;
});
world.on('places', (list) => ui.addPlaces(list));
world.on('error', (msg) => ui.toast(`Hata: ${String(msg).split('\n')[0]}`, 6000));
world.init(loc.lon, loc.lat);

ui.onChange = () => {
  localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  localStorage.setItem(`${SLOTS_KEY}:version`, SLOTS_VERSION);
};
ui.onCraft = (id) => {
  sfx.pick();
  addXp(1);
  ui.toast(`${itemName(id)} üretildi`);
};

// Lowest solid column near the origin: streets beat rooftops.
function findSpawn() {
  let best = null, cost = Infinity;
  for (let z = -14; z <= 14; z++) {
    for (let x = -14; x <= 14; x++) {
      const y = world.topY(x, z);
      if (y <= 0) continue;
      const c = y * 6 + Math.hypot(x, z);
      if (c < cost) {
        cost = c;
        best = [x, z];
      }
    }
  }
  return best || [0, 0];
}

// The photo skin belongs to the spot it was taken from: flying away from it, it thins out and
// the block world shows; coming back down returns the street photo.
function setPhoto() {
  let k = calibrating ? 0.55 : photoOn ? 1 : 0;
  const slot = panos.current && panos.slotOf(panos.current);
  if (slot && roam) k *= 1 - THREE.MathUtils.smoothstep(camera.position.distanceTo(slot.pos), 70, 130);
  materials.uniforms.uPhoto.value = k;
}

// ---------------------------------------------------------------- menu

function buildMenu() {
  const box = $('locations');
  for (const l of LOCATIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `${l.name}<small>${l.sub}</small>`;
    if (Math.abs(l.lat - loc.lat) < 1e-4 && Math.abs(l.lon - loc.lon) < 1e-4) b.className = 'current';
    b.addEventListener('click', () => goTo(l));
    box.append(b);
  }
  $('custom').addEventListener('submit', (e) => {
    e.preventDefault();
    const m = $('coords').value.match(/(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);
    if (!m || Math.abs(+m[1]) > 85 || Math.abs(+m[2]) > 180) {
      $('coords').value = '';
      $('coords').placeholder = 'Biçim: 52.3731, 4.8932';
      return;
    }
    goTo({ name: 'Özel konum', lat: +m[1], lon: +m[2] });
  });
  $('token-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('token').value.trim();
    if (v) localStorage.setItem(TOKEN_KEY, v);
    else localStorage.removeItem(TOKEN_KEY);
    location.reload();
  });
  $('token-state').textContent = survey
    ? 'Amsterdam\'da belediyenin ölçüm panoramaları kullanılıyor; token gerekmez.'
    : token ? 'Mapillary bağlı — boş bırakıp kaydedersen kaldırılır.' : 'Token yok: yalnızca Panoramax görüntüleri kullanılıyor.';
  $('play').addEventListener('click', startPlay);
  $('respawn').addEventListener('click', respawn);
  $('reset-edits').addEventListener('click', () => {
    world.resetEdits();
    refreshEdits();
  });
  // every place at once is a bigger thing to lose: the button asks for a second click
  const all = $('reset-all');
  all.addEventListener('click', () => {
    if (all.dataset.armed) {
      for (const m of savedMaps()) localStorage.removeItem(m.key);
      world.resetEdits();
      refreshEdits();
      return;
    }
    all.dataset.armed = '1';
    all.textContent = 'Emin misin? Tekrar tıkla';
    setTimeout(refreshEdits, 3000);
  });
  refreshEdits();
}

// Saved block changes of every place in this browser: [{ key, count }].
function savedMaps() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith('plateaucraft:v1:')) continue;
    let count = 0;
    try {
      for (const [, list] of JSON.parse(localStorage.getItem(key))) count += list.length;
    } catch (e) {
      // unreadable: still listed, so it can be cleared
    }
    out.push({ key, count });
  }
  return out;
}

function refreshEdits() {
  const here = world.editCount();
  const others = savedMaps().filter((m) => m.key !== world.storageKey);
  const elsewhere = others.reduce((sum, m) => sum + m.count, 0);
  let text = here ? `Bu haritada ${here} blok değişikliği var` : 'Bu haritada değişiklik yok';
  if (others.length) text += ` · başka ${others.length} haritada ${elsewhere}`;
  $('edits-count').textContent = `${text}. Oyunda R: bu haritayı sıfırla.`;
  $('reset-edits').classList.toggle('hidden', !here);
  const all = $('reset-all');
  delete all.dataset.armed;
  all.textContent = 'Tüm haritaları sıfırla';
  all.classList.toggle('hidden', !here && !others.length);
}

// In the game: R twice within three seconds puts this place back as it was.
let resetArmed = -10;
function resetKey() {
  if (clock - resetArmed > 3) {
    resetArmed = clock;
    ui.toast(world.editCount() ? 'Bu haritayı sıfırlamak için tekrar R\'ye bas' : 'Bu haritada sıfırlanacak değişiklik yok', 3000);
    return;
  }
  resetArmed = -10;
  const n = world.editCount();
  world.resetEdits();
  ui.toast(`Harita sıfırlandı (${n} blok geri geldi)`);
}

function showOverlay(show) {
  $('overlay').classList.toggle('hidden', !show);
  if (show) refreshEdits();
}

function enterPlay(viaDrag) {
  const first = !playing;
  playing = true;
  dragLook = viaDrag;
  keys.clear();
  showOverlay(false);
  $('hud').classList.remove('hidden');
  $('crosshair').classList.toggle('hidden', viaDrag);
  canvas.style.cursor = viaDrag ? 'crosshair' : '';
  if (viaDrag && first) ui.toast('İmleç kilitlenemedi: sürükleyerek bak, tıkla: kır/koy, Esc: menü', 6000);
}

function leavePlay() {
  playing = false;
  dragLook = false;
  keys.clear();
  clearInterval(repeat);
  canvas.style.cursor = '';
  showOverlay(true);
}

function startPlay() {
  sfx.unlock();
  const p = canvas.requestPointerLock();
  if (p && p.catch) p.catch(() => {});
  setTimeout(() => {
    if (!locked() && !dragLook) enterPlay(true);
  }, 350);
}

function openInventory() {
  keys.clear();
  clearInterval(repeat);
  ui.openInventory();
  if (locked()) document.exitPointerLock();
}

function closeInventory() {
  ui.closeInventory();
  if (!dragLook) startPlay();
}

function respawn() {
  dead = false;
  stats.health = 20;
  stats.food = 20;
  stats.hurtAt = clock;
  ui.hideDeath();
  const home = panos.nearest(0, 0, 600);
  if (home) travel(home);
  if (!dragLook) startPlay();
}

document.addEventListener('pointerlockchange', () => {
  if (locked()) enterPlay(false);
  else if (!dragLook && !ui.inventoryOpen && !dead) leavePlay();
});

// ---------------------------------------------------------------- input

let dragged = 0;
const mouse = new THREE.Vector2(); // cursor in normalised device coordinates (drag-look mode aims with it)
const cursorRay = new THREE.Vector3();
const trackCursor = (e) => mouse.set((e.clientX / window.innerWidth) * 2 - 1, 1 - (e.clientY / window.innerHeight) * 2);
document.addEventListener('mousemove', (e) => {
  trackCursor(e);
  if (dead || ui.inventoryOpen) return;
  if (locked()) player.look(e.movementX, e.movementY);
  else if (playing && dragLook && e.buttons) {
    dragged += Math.abs(e.movementX) + Math.abs(e.movementY);
    player.look(-e.movementX * 1.4, -e.movementY * 1.4); // grab the scene and pull it
  }
});

// Step into a panorama: the picture cross-fades while the camera glides to where it was taken.
function travel(node) {
  if (!node) return;
  roam = false;
  player.flying = false;
  panos.goTo(node, true);
}

// Step to the neighbouring panorama `offset` radians to the right of the view direction.
function hop(offset, quiet) {
  const node = panos.snapped;
  if (!node || panos.hop || panos.pending) return;
  const l = panos.linkToward(node, -player.yaw + offset, offset ? 0.85 : 1.15);
  if (l) {
    travel(l.node);
    tire(0.06);
  } else if (!quiet) ui.toast('Bu yönde geçiş yok — yerdeki oklara bak', 1400);
}

// Fine-tune how the current photo sits on the geometry (saved per image sequence).
function calibrate(code, big) {
  const node = panos.current;
  if (!node) return false;
  const step = big ? 4 : 1;
  const d = {
    ArrowLeft: { heading: -0.5 * step }, ArrowRight: { heading: 0.5 * step },
    ArrowUp: { height: 0.1 * step }, ArrowDown: { height: -0.1 * step },
    KeyI: { dz: -0.5 * step }, KeyK: { dz: 0.5 * step }, KeyJ: { dx: -0.5 * step }, KeyL: { dx: 0.5 * step },
    Backspace: { reset: true },
  }[code];
  if (!d) return false;
  const c = panos.adjust(node, d);
  ui.toast(`Ayar · yön ${c.heading >= 0 ? '+' : ''}${c.heading}° · kamera ${c.height.toFixed(1)} m · kayma ${c.offset[0].toFixed(1)}, ${c.offset[1].toFixed(1)} m`, 4000);
  return true;
}

let lastSpace = 0, lastW = 0;
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || dead) return;
  if (ui.inventoryOpen) {
    if ((e.code === 'KeyE' || e.code === 'Escape') && !e.repeat) closeInventory();
    else ui.key(e.code);
    return;
  }
  if (!playing) return;
  if (e.code === 'KeyE' && !e.repeat) return openInventory();
  if (e.code === 'Escape' && dragLook) return leavePlay();
  if (['Space', 'Tab', 'F3', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(e.code)) e.preventDefault();
  if (calibrating && calibrate(e.code, e.shiftKey)) return;
  if (e.repeat) return;
  keys.add(e.code);
  const now = performance.now();
  if (!roam && e.code in HOPS) return hop(HOPS[e.code]);
  if (e.code === 'Space' && roam) {
    if (now - lastSpace < 280) {
      player.flying = !player.flying;
      player.vy = 0;
      ui.toast(player.flying ? 'Uçuş açık' : 'Uçuş kapalı');
      lastSpace = 0;
    } else lastSpace = now;
  } else if (e.code === 'KeyW') {
    if (now - lastW < 280) player.sprint = true;
    lastW = now;
  } else if (e.code === 'KeyF') {
    if (!roam) {
      // let go of the photo and take off from where it was taken
      roam = true;
      panos.unlock();
      player.flying = true;
      player.vy = 0;
      ui.toast('Serbest uçuş · fotoğraftan uzaklaştıkça görüntü bozulur · G: fotoğrafa dön', 5000);
    } else {
      player.flying = !player.flying;
      player.vy = 0;
      ui.toast(player.flying ? 'Uçuş açık' : 'Uçuş kapalı');
    }
  } else if (e.code === 'KeyG') {
    const n = panos.nearest(player.x, player.z, 400);
    if (n) travel(n);
    else ui.toast('Yakında 360° sokak fotoğrafı yok');
  } else if (e.code === 'KeyR') {
    resetKey();
  } else if (e.code === 'KeyP') {
    photoOn = !photoOn;
    setPhoto();
    ui.toast(photoOn ? 'Fotoğraf açık' : 'Fotoğraf kapalı: alttaki blok dünyası');
  } else if (e.code === 'KeyC') {
    calibrating = !calibrating;
    setPhoto();
    ui.toast(calibrating ? 'Hizalama: ← → yön · ↑ ↓ kamera yüksekliği · I J K L kaydır · Backspace sıfırla' : 'Hizalama kapalı', 6000);
  } else if (e.code.startsWith('Digit')) {
    const n = +e.code.slice(5);
    if (n >= 1 && n <= 9) ui.select(n - 1);
  } else if (e.code === 'KeyM') ui.toggleMap();
  else if (e.code === 'F3' || e.code === 'Backquote') debug = !debug;
  else if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    radius = Math.max(4, Math.min(28, radius + (e.code === 'BracketRight' ? 2 : -2)));
    world.setRadius(radius);
    localStorage.setItem('plateaucraft:radius', radius);
    ui.toast(`Blok detayı mesafesi: ${radius * 16} m`);
  }
});
document.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

canvas.addEventListener('wheel', (e) => {
  if (!playing || dead) return;
  e.preventDefault();
  ui.select(ui.selected + (e.deltaY > 0 ? 1 : -1));
}, { passive: false });

// ---------------------------------------------------------------- acting on the world

// Where the player is pointing: the crosshair, or the cursor when the pointer is not locked.
function aimDirection() {
  if (!dragLook) return player.direction();
  cursorRay.set(mouse.x, mouse.y, 0.5).unproject(camera).sub(camera.position).normalize();
  return [cursorRay.x, cursorRay.y, cursorRay.z];
}

function aim(maxDist) {
  const [dx, dy, dz] = aimDirection();
  return world.raycast(camera.position.x, camera.position.y, camera.position.z, dx, dy, dz, maxDist ?? (roam ? REACH_WALK : REACH_LOCKED));
}

// The neighbouring photo whose arrow (or ring) is being pointed at, unless a block is in the way.
function pointedLink(t) {
  if (roam || !panos.snapped) return null;
  const l = panos.linkAt(camera.position, aimDirection());
  return l && (!t || l.t <= t.t + 0.6) ? l.link : null;
}

// A block placed here would box in the player or the camera.
function inTheWay(x, y, z) {
  const c = camera.position;
  return player.overlapsBlock(x, y, z) || (Math.abs(x + 0.5 - c.x) < 0.85 && Math.abs(z + 0.5 - c.z) < 0.85 && c.y > y - 0.35 && c.y < y + 1.35);
}

// The bow is drawn while the button is held and loosed when it is let go: the longer the draw
// (up to a second), the faster and flatter the arrow flies and the harder it hits.
let drawing = -1; // game time the draw began, -1 = not drawing
function loose() {
  if (drawing < 0) return;
  const pull = Math.min(1, Math.max(0.25, (clock - drawing) / 0.9));
  drawing = -1;
  hand.pull = 0;
  if (dead || ui.held !== I.BOW) return;
  const d = aimDirection(), c = camera.position;
  const speed = 14 + pull * 36;
  mobs.shoot(c.x + d[0] * 0.6, c.y - 0.12 + d[1] * 0.6, c.z + d[2] * 0.6, d[0] * speed, d[1] * speed, d[2] * speed, Math.round(3 + pull * 7), true);
  hand.swing();
  sfx.bow();
}

// The sword cuts what gives way to a blade and clangs off the rest.
const SOFT = new Set([B.LEAVES, B.SAKURA, B.CANOPY, B.GLASS, B.GLASS_DARK, B.WINDOW, B.WINDOW_DARK]);

// What a block sounds like when it is dug, put down or walked on (anything else: stone).
const SOUNDS = {
  grass: [B.GRASS, B.TURF, B.LEAVES, B.SAKURA, B.CANOPY, B.TNT],
  gravel: [B.DIRT, B.FARMLAND, B.GRAVEL, B.RAIL],
  sand: [B.SAND],
  wood: [B.PLANKS, B.LOG],
  glass: [B.GLASS, B.GLASS_DARK, B.WINDOW, B.WINDOW_DARK, B.LAMP],
  snow: [B.SNOW],
};
const soundOf = (id) => Object.keys(SOUNDS).find((k) => SOUNDS[k].includes(id)) || 'stone';

function breakBlock(t) {
  if (t.id === B.BEDROCK) return;
  world.setBlock(t.x, t.y, t.z, B.AIR);
  fx.burst(t.x + 0.5, t.y + 0.5, t.z + 0.5, fx.colorOf(t.id), 9, 3.4, 0.12, 0.7);
  sfx.dig(soundOf(t.id));
  // what the street is made of goes into the inventory the first time it is dug up
  if (ui.give(t.id)) {
    sfx.pick();
    ui.toast(`Envantere eklendi: ${itemName(t.id)}`, 1600);
  }
  addXp(0.2);
  tire(0.02);
}

function primary(again) {
  const item = ui.held;
  const dir = aimDirection();
  const t = aim();
  hand.swing();
  const hit = mobs.pick(camera.position, dir, Math.min(MELEE, t ? t.t : Infinity));
  if (hit) {
    mobs.hurt(hit.mob, item === I.SWORD ? 7 : item === I.PICKAXE ? 4 : 2, dir[0], dir[2]);
    sfx.hit();
    sfx.bones();
    return;
  }
  const link = again ? null : pointedLink(t);
  if (link) return travel(link.node);
  if (!t) return sfx.swing();
  if (item === I.SWORD && !SOFT.has(t.id)) {
    sfx.swing();
    const c = camera.position;
    if (t.t < MELEE) fx.sparks(c.x + dir[0] * t.t, c.y + dir[1] * t.t, c.z + dir[2] * t.t);
    return;
  }
  breakBlock(t);
}

function secondary() {
  const item = ui.held;
  if (item === I.BOW) return; // see loose()
  if (FOOD[item]) {
    if (stats.food >= 20) return ui.toast('Karnın tok');
    stats.food = Math.min(20, stats.food + FOOD[item]);
    hand.swing();
    sfx.eat();
    return;
  }
  const dir = aimDirection();
  const t = aim();
  if (item === I.FLINT) {
    hand.swing();
    sfx.flint();
    if (!t) return;
    const c = camera.position;
    if (!fx.ignite(t.x, t.y, t.z)) fx.sparks(c.x + dir[0] * t.t, c.y + dir[1] * t.t, c.z + dir[2] * t.t);
    return;
  }
  if (!t) return;
  const x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
  if (item === I.EGG) {
    hand.swing();
    if (mobs.spawn(x, y, z)) sfx.pop();
    else ui.toast(mobs.list.length ? 'Buraya sığmıyor (ya da çok fazla iskelet var)' : 'Buraya sığmıyor');
    return;
  }
  if (!isBlock(item) || SOLID[world.getBlock(x, y, z)]) return;
  if (SOLID[item] && inTheWay(x, y, z)) return;
  if (!world.setBlock(x, y, z, item)) return;
  hand.swing();
  sfx.place(soundOf(item) === 'glass' ? 'stone' : soundOf(item)); // glass only tinkles when it breaks
}

// `again`: the button is being held down.
function act(button, again = false) {
  if (dead || !spawned) return;
  if (button === 0) primary(again);
  else if (button === 2) secondary();
  else if (button === 1) {
    const t = aim();
    if (t) ui.setSlot(t.id);
  }
}

let repeat = null;
function press(button) {
  if (button === 2 && ui.held === I.BOW && !dead) {
    drawing = clock;
    return;
  }
  act(button);
  clearInterval(repeat);
  const item = ui.held;
  const every = button === 0 ? (item === I.SWORD ? 0 : item === I.PICKAXE ? 110 : 200) : button === 2 && isBlock(item) ? 200 : 0;
  if (every) repeat = setInterval(() => act(button, true), every);
}

canvas.addEventListener('mousedown', (e) => {
  if (!playing || dead) return;
  e.preventDefault();
  sfx.unlock();
  if (dragLook) {
    dragged = 0; // decided on release: a drag looks around, a click acts
    if (e.button === 2 && ui.held === I.BOW) drawing = clock;
    return;
  }
  press(e.button);
});
window.addEventListener('mouseup', (e) => {
  clearInterval(repeat);
  if (playing && dragLook && e.target === canvas && dragged < 5) {
    trackCursor(e); // a click may arrive without any mouse movement before it
    if (drawing >= 0) {
      drawing = Math.min(drawing, clock - 0.6); // a plain click still sends a decent shot
      loose();
    } else act(e.button);
  } else if (e.button === 2) loose();
  drawing = -1;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- loop

let last = performance.now();
let fps = 60;
let slow = 0;
let lookKey = '';
let wasHop = false;
let arrivedAt = 0; // game time the last step between photos ended

function describeTarget() {
  const t = aim(260);
  if (!t) {
    lookKey = '';
    ui.setTarget('');
    return;
  }
  const key = `${t.x},${t.z}`;
  if (key === lookKey) return;
  lookKey = key;
  world.queryBuilding(t.x, t.z).then((info) => {
    if (lookKey !== key) return;
    if (!info) ui.setTarget('');
    else {
      const h = info.height ? ` · ${info.height.toFixed(1)} m` : '';
      const name = info.source === 'PLATEAU' ? `PLATEAU bina ${info.id}` : info.source === '3D BAG' ? `BAG ${info.id}${info.year ? ' · ' + info.year : ''}` : 'OSM binası';
      ui.setTarget(name + h);
    }
  });
}

function hud() {
  const place = ui.updatePlace(player.x, player.z);
  let html = `<b>${place ? place.name : loc.name}</b>\n`;
  const n = panos.current;
  if (n) {
    html += `Fotoğraf: ${n.author || 'anonim'} · ${n.date} · ${n.exact ? 'açık veri' : n.provider + ' (CC BY-SA 4.0)'}\n`;
    if (roam) html += `Serbest ${player.flying ? 'uçuş' : 'yürüyüş'} · G: fotoğrafa dön`;
    else html += panos.pending ? 'Sonraki fotoğraf yükleniyor…' : 'W A S D: oklara ışınlan · F: serbest uçuş';
  } else if (panos.searching() || panos.pending) html += '360° sokak fotoğrafı aranıyor…';
  else html += 'Bu çevrede 360° sokak fotoğrafı yok — blok dünyası';
  const pending = world.inflight.size + world.farInflight.size;
  if (pending) html += `\nHarita yükleniyor… (${pending})`;
  for (const [name, msg] of panos.errors) html += `\n<span class="dbg">${name}: ${msg}</span>`;
  if (debug) {
    const [lon, lat] = proj.blockToLonLat(player.x, player.z);
    const r = renderer.info.render;
    html += `\n<span class="dbg">${fps.toFixed(0)} fps · ${world.chunks.size} chunk + ${world.far.size} uzak karo · ${(r.triangles / 1000).toFixed(0)}k üçgen · ${r.calls} çizim`;
    html += `\n${lat.toFixed(5)}, ${lon.toFixed(5)} · rakım ${Math.floor(player.y) - SEA_Y + elevOffset} m · XYZ ${player.x.toFixed(1)} ${player.y.toFixed(1)} ${player.z.toFixed(1)}`;
    html += `\ndetay ${radius * 16} m · ${panos.list.length} panorama · ${n && n.exact ? 'ölçüm konumu' : n && (n.rot || n.confident) ? 'hizalı' : 'GPS'}`;
    const p = world.perf;
    if (p) html += `\nchunk ${(p.genMs / p.chunks).toFixed(1)}+${(p.meshMs / p.chunks).toFixed(1)} ms · uzak ${(p.farMs / (p.far || 1)).toFixed(1)} ms · karo çözme ${p.tileMs.toFixed(0)} ms`;
    html += '</span>';
  }
  ui.setInfo(html);
}

function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  clock += dt;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

  world.update(player.x, player.z);
  // voxel chunks render inside the ring, the coarse skyline outside; shrink at once, grow smoothly
  const loaded = world.loadedRadius();
  clip = loaded < clip ? loaded : Math.min(loaded, clip + dt * 160);
  panos.update(dt, camera.position, player, clip, spawned && arrived && roam);

  if (!spawned) {
    const p = world.progress(3);
    $('bar-fill').style.width = `${Math.round(p * 100)}%`;
    $('status-text').textContent = world.ready ? `${loc.name}: harita verisi indiriliyor…` : 'Yükseklik verisi alınıyor…';
    if (p >= 1) {
      const [sx, sz] = findSpawn();
      player.placeAt(sx, sz);
      player.yaw = Math.PI;
      spawned = true;
    }
  } else if (!arrived) {
    // stand in the street photo nearest to the chosen coordinates as soon as one is known
    const n = panos.nearest(0, 0, 600);
    if (n) {
      panos.goTo(n, true);
      arrived = true;
    } else if (!panos.searching() && panos.cells.size) {
      arrived = true;
      roam = true; // nothing to stand in here: plain block world
      ui.toast('Bu çevrede 360° sokak fotoğrafı yok', 6000);
    }
    $('status-text').textContent = '360° sokak fotoğrafı aranıyor…';
    if (arrived) {
      $('status-text').textContent = `${loc.name} hazır.`;
      $('play').disabled = false;
      $('play').textContent = 'OYNA';
      ui.updatePlace(player.x, player.z);
    }
  }

  // the first photo: look down the street, where the first arrow points
  if (!faced && panos.snapped) {
    const l = panos.links(panos.snapped)[0];
    if (l) player.yaw = -l.az;
    faced = true;
  }

  // a held direction key keeps stepping from photo to photo
  if (wasHop && !panos.hop) arrivedAt = clock;
  if (panos.hop && !wasHop) sfx.step(soundOf(world.getBlock(Math.floor(player.x), Math.floor(player.y - 0.5), Math.floor(player.z))));
  wasHop = !!panos.hop;
  if (playing && !dead && !roam && !calibrating && !ui.inventoryOpen && panos.snapped && !panos.pending && clock - arrivedAt > 0.1) {
    for (const code in HOPS) {
      if (!keys.has(code)) continue;
      hop(HOPS[code], true);
      break;
    }
  }

  // inside a street photo the eye sits at the height the photo was taken from, so the view is
  // the photo itself; without one it is the usual 1.62 m
  const eye = photoOn && panos.current ? panos.seqCalib(panos.current).height : EYE;
  player.eye += (eye - player.eye) * Math.min(1, dt * 6);
  const vp = roam ? null : panos.viewPos(view);
  if (vp) {
    // standing in (or gliding to) a panorama: the camera sits where the photo was taken
    player.x = vp.x;
    player.z = vp.z;
    player.y = vp.y - player.eye;
    player.vx = player.vy = player.vz = 0;
    player.headInWater = false;
    camera.position.copy(vp);
  } else {
    if (spawned && playing && roam && !dead && !ui.inventoryOpen) player.update(dt, keys);
    // the drawn ground follows the measured height, the blocks under it are whole metres
    camera.position.set(player.x, player.eyeY + world.groundDelta(player.x, player.y, player.z), player.z);
  }
  shake *= Math.exp(-dt * 5);
  const jolt = () => (Math.random() - 0.5) * shake * 0.09;
  camera.rotation.set(player.pitch + jolt(), player.yaw + jolt(), jolt() * 0.7);
  camera.updateMatrixWorld();
  setPhoto();
  sky.mesh.position.copy(camera.position);
  sky.update(0, FAR_RADIUS * FAR_TILE * 0.95);
  materials.uniforms.uClip.value.set(player.x, player.z, clip);
  world.cull(player.x, player.z, clip);
  $('underwater').style.opacity = player.headInWater ? 1 : 0;

  // health comes back on a full stomach
  if (!dead && stats.health < 20 && stats.food >= 18 && clock - stats.hurtAt > 4 && clock - stats.healAt > 1.2) {
    stats.healAt = clock;
    stats.health = Math.min(20, stats.health + 1);
    tire(0.35);
  }
  const [level, progress] = levelOf(stats.xp);
  ui.setStats(stats.health, stats.food, progress, level);

  const active = spawned && playing && !dead && !ui.inventoryOpen;
  fx.update(dt);
  mobs.update(dt, player, camera.position, active);
  hand.pull = drawing >= 0 && ui.held === I.BOW ? Math.min(1, (clock - drawing) / 0.9) : 0;

  const t = active ? aim() : null;
  const link = active ? pointedLink(t) : null;
  outline.visible = !!t && !link;
  if (t) outline.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
  panos.updateArrows(-player.yaw, active && !roam && !panos.hop, link);
  if (dragLook) canvas.style.cursor = link ? 'pointer' : 'crosshair';
  const node = active && !roam ? panos.snapped : null;
  ui.setNav(node && [0, -Math.PI / 2, Math.PI, Math.PI / 2].map((off) => panos.linkToward(node, -player.yaw + off, off ? 0.85 : 1.15)));

  renderer.render(scene, camera);
  if (spawned && playing && !dead) {
    hand.hold(ui.held);
    hand.update(dt, !!panos.hop || (roam && Math.hypot(player.vx, player.vz) > 0.6));
    hand.render(renderer);
  }

  slow += dt;
  if (slow > 0.2 && spawned) {
    slow = 0;
    hud();
    ui.drawMap(world, player, panos);
    if (active) describeTarget();
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  frame(now);
}

buildMenu();
setPhoto();
requestAnimationFrame(loop);

// Debug handle for the console; step(n) advances n frames of 50 ms by hand.
window.game = {
  world, player, sky, ui, camera, renderer, scene, proj, materials, panos, fx, mobs, hand, stats, keys, aim, act, hop, travel,
  step: (n = 1) => {
    for (let i = 0; i < n; i++) frame(last + 50);
  },
  state: () => ({ playing, dragLook, spawned, arrived, roam, dead }),
};
