// DOM heads-up display: block-game status bars and hotbar, inventory window, minimap, info text.
import { tx } from './i18n.js';
import { CHUNK } from './config.js';
import { TABS, craft, itemIcon, itemName } from './items.js';

const $ = (id) => document.getElementById(id);

// 9x9 status icons, one character per pixel (k = outline).
const HEART = ['..kk.kk..', '.krrkrrk.', 'krhrrrrrk', 'krrrrrrrk', 'krrrrrrdk', '.krrrrdk.', '..krrdk..', '...kdk...', '....k....'];
const HEART_PAL = { r: '#ff1a1a', h: '#ffc4c4', d: '#b30d0d' };
const FOOD = ['.....kkk.', '...kkbbbk', '..kbbbobk', '.kbbbbbbk', '.kbbbbbk.', '.kdbbbk..', 'kwkddk...', 'kwwk.....', '.kk......'];
const FOOD_PAL = { b: '#b3601b', o: '#e39b4b', d: '#7d3f10', w: '#f1e9d8' };

// Ten icons, each worth two points; a half icon keeps the side it is counted from.
function drawIcons(canvas, rows, pal, empty, value, fromRight) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 10; i++) {
    const x0 = fromRight ? 72 - i * 8 : i * 8;
    const v = value - i * 2;
    rows.forEach((row, y) => {
      for (let x = 0; x < 9; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        const lit = v >= 2 || (v >= 1 && (fromRight ? x >= 4 : x <= 4));
        ctx.fillStyle = ch === 'k' ? '#000' : lit ? pal[ch] : empty;
        ctx.fillRect(x0 + x, y, 1, 1);
      }
    });
  }
}

// The same bar from a texture pack's sprites: an empty icon under a full or half one.
function drawSprites(canvas, [empty, full, half], value, fromRight) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 10; i++) {
    const x = fromRight ? 72 - i * 8 : i * 8;
    const v = value - i * 2;
    ctx.drawImage(empty, x, 0, 9, 9);
    if (v >= 1) ctx.drawImage(v >= 2 ? full : half, x, 0, 9, 9);
  }
}

function makeSlot(parent) {
  const el = document.createElement('div');
  el.className = 'mc-slot';
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 48;
  el.append(canvas);
  parent.append(el);
  return { el, ctx: canvas.getContext('2d'), shown: -1 };
}

function paint(slot, id) {
  if (slot.shown === id) return;
  slot.shown = id;
  slot.ctx.clearRect(0, 0, 48, 48);
  if (id) slot.ctx.drawImage(itemIcon(id), 0, 0);
}

const CAT_ROWS = 5; // rows of the catalogue on show

export class UI {
  // slots: item ids, 0-8 the hotbar, 9-35 storage (0 = empty). Edited in place.
  // gui: HUD images of a texture pack, { name: { url, img } } (see pack.js); {} for none.
  constructor(slots, gui = {}) {
    this.slots = slots;
    this.applyPack(gui);
    this.selected = 0;
    this.grid = [0, 0, 0, 0]; // crafting squares
    this.carry = 0; // item on the cursor while the inventory is open
    this.stash = null; // the 27 slots of the chest that is open, if one is
    this.onStash = null; // called with them when it closes
    this.hover = null;
    this.mx = this.my = 0;
    this.onChange = null; // slots changed
    this.onCraft = null; // (item) something was crafted
    this.bigMap = false;
    this.mapCtx = $('minimap').getContext('2d');
    this.places = [];
    this.place = null;
    this.statKey = '';
    this.navKey = '';

    this.bar = [];
    for (let i = 0; i < 9; i++) this.bar.push(makeSlot($('mc-hotbar')));
    this.buildInventory();
    this.drawDoll();
    this.refresh();
    this.setStats(20, 20, 0, 0);
  }

  // Where a texture pack brings its own bar, hearts or windows, they replace the drawn ones.
  applyPack(gui) {
    const set = (...names) => (names.every((n) => gui[n]) ? names.map((n) => gui[n].img) : null);
    this.heartSprites = set('heart_container', 'heart_full', 'heart_half');
    this.foodSprites = set('food_empty', 'food_full', 'food_half');
    for (const [name, v] of Object.entries(gui)) document.documentElement.style.setProperty(`--pack-${name.replace(/_/g, '-')}`, `url("${v.url}")`);
    const on = (cls, ...names) => document.body.classList.toggle(cls, names.every((n) => gui[n]));
    on('pack-hotbar', 'hotbar', 'hotbar_selection');
    on('pack-xp', 'xp_background', 'xp_progress');
    on('pack-inventory', 'inventory');
    on('pack-chest', 'chest');
    on('pack-creative', 'creative', 'scroller', 'tab_on_1', 'tab_on_2', 'tab_on_7', 'tab_off_1', 'tab_off_2', 'tab_off_7', 'tab_low_on_1', 'tab_low_on_2', 'tab_low_off_1', 'tab_low_off_2');
  }

  // ---- hotbar

  select(i) {
    this.selected = ((i % 9) + 9) % 9;
    this.refresh();
    this.flash($('mc-name'), itemName(this.slots[this.selected]), 1500);
    if (this.onChange) this.onChange();
  }

  get held() {
    return this.slots[this.selected];
  }

  // Put an item in the selected hotbar slot (pick block).
  setSlot(id) {
    this.slots[this.selected] = id;
    this.changed();
    this.flash($('mc-name'), itemName(id), 1500);
  }

  // Add an item the player does not have yet to the first free slot. True if it went in.
  give(id) {
    if (!id || this.slots.includes(id)) return false;
    const i = this.slots.indexOf(0);
    if (i < 0) return false;
    this.slots[i] = id;
    this.changed();
    return true;
  }

  // ---- status bars

  setStats(health, food, xp, level) {
    const h = Math.max(0, Math.ceil(health)), f = Math.max(0, Math.ceil(food));
    const key = `${h},${f},${Math.round(xp * 182)},${level}`;
    if (key === this.statKey) return;
    this.statKey = key;
    if (this.heartSprites) drawSprites($('mc-hearts'), this.heartSprites, h, false);
    else drawIcons($('mc-hearts'), HEART, HEART_PAL, '#3d1616', h, false);
    if (this.foodSprites) drawSprites($('mc-food'), this.foodSprites, f, true);
    else drawIcons($('mc-food'), FOOD, FOOD_PAL, '#3a2a1c', f, true);
    $('mc-xp-fill').style.width = `${(xp * 100).toFixed(1)}%`;
    $('mc-level').textContent = level > 0 ? level : '';
  }

  hurt() {
    const el = $('hurt');
    el.style.transition = 'none';
    el.style.opacity = 1;
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.style.transition = '';
      el.style.opacity = 0;
    }, 90);
  }

  showDeath(text) {
    $('death-score').textContent = text;
    $('death').classList.remove('hidden');
  }

  hideDeath() {
    $('death').classList.add('hidden');
  }

  // Which of forward, left, back, right lead somewhere (null hides the keys).
  setNav(list) {
    const key = list ? list.map((v) => (v ? 1 : 0)).join('') : 'x';
    if (key === this.navKey) return;
    this.navKey = key;
    const el = $('nav');
    el.classList.toggle('hidden', !list);
    if (list) [...el.children].forEach((c, i) => c.classList.toggle('on', !!list[i]));
  }

  // ---- inventory window

  buildInventory() {
    this.cells = [];
    const add = (parent, kind, index) => {
      const s = makeSlot(parent);
      s.kind = kind;
      s.index = index;
      s.el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.button === 0) this.click(s, e.shiftKey);
      });
      s.el.addEventListener('mouseenter', () => {
        this.hover = s;
        this.follow();
      });
      s.el.addEventListener('mouseleave', () => {
        if (this.hover === s) this.hover = null;
        this.follow();
      });
      this.cells.push(s);
      return s;
    };
    for (let i = 0; i < CAT_ROWS * 9; i++) add($('cat-grid'), 'cat', i);
    for (let i = 0; i < 9; i++) add($('cat-bar'), 'inv', i); // the hotbar again, under the catalogue as in the creative window
    this.buildTabs();
    for (let i = 0; i < 27; i++) add($('stash-grid'), 'stash', i);
    for (let i = 0; i < 4; i++) add($('craft-grid'), 'craft', i);
    add($('craft-out'), 'out', 0);
    for (let i = 9; i < 36; i++) add($('store-grid'), 'inv', i);
    for (let i = 0; i < 9; i++) add($('bar-grid'), 'inv', i);

    const inv = $('inventory');
    inv.addEventListener('mousemove', (e) => {
      this.mx = e.clientX;
      this.my = e.clientY;
      this.follow();
    });
    // a click beside the windows throws away what the cursor carries
    inv.addEventListener('mousedown', (e) => {
      if (e.target === inv && this.carry) {
        this.carry = 0;
        this.changed();
      }
    });
    inv.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---- the catalogue: tabs along the top, five rows showing, the rest a scroll away

  catItem(i) {
    return TABS[this.tab].items[this.catRow * 9 + i] || 0;
  }

  buildTabs() {
    this.tab = 0;
    this.catRow = 0;
    const rows = [TABS.filter((t) => !t.below), TABS.filter((t) => t.below)];
    this.tabButtons = [];
    TABS.forEach((t, n) => {
      const row = rows[t.below ? 1 : 0], at = row.indexOf(t);
      const box = $(t.below ? 'cat-tabs-low' : 'cat-tabs');
      const b = document.createElement('button');
      b.type = 'button';
      // the row above fills the window's width, its last tab against the right edge
      b.className = at === 0 ? 'first' : !t.below && at === row.length - 1 && row.length > 6 ? 'last' : '';
      this.tabButtons.push(b);
      b.title = tx(t.name);
      const c = document.createElement('canvas');
      c.width = c.height = 48;
      c.getContext('2d').drawImage(itemIcon(t.icon), 0, 0);
      b.append(c);
      b.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setTab(n);
      });
      box.append(b);
    });
    const win = document.querySelector('.mc-window.catalog');
    win.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.scrollCat(this.catRow + Math.sign(e.deltaY));
    }, { passive: false });
    // the bar is a ruler of the rows: a press or a drag on it goes to the row under the pointer
    const track = $('cat-scroll');
    const seek = (e) => {
      const r = track.getBoundingClientRect();
      this.scrollCat(Math.round(((e.clientY - r.top) / r.height) * this.catMax()));
    };
    track.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      seek(e);
      const up = () => {
        window.removeEventListener('mousemove', seek);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', seek);
      window.addEventListener('mouseup', up);
    });
    this.setTab(0);
  }

  catMax() {
    return Math.max(0, Math.ceil(TABS[this.tab].items.length / 9) - CAT_ROWS);
  }

  setTab(n) {
    this.tab = n;
    this.tabButtons.forEach((b, i) => b.classList.toggle('on', i === n));
    $('cat-title').textContent = tx(TABS[n].name);
    this.scrollCat(0);
  }

  scrollCat(row) {
    const max = this.catMax();
    this.catRow = Math.max(0, Math.min(max, row));
    $('cat-scroll').classList.toggle('idle', !max);
    $('cat-knob').style.top = `${max ? (this.catRow / max) * 100 : 0}%`;
    if (this.cells) for (const s of this.cells) if (s.kind === 'cat') paint(s, this.itemOf(s));
  }

  itemOf(s) {
    if (s.kind === 'cat') return this.catItem(s.index);
    if (s.kind === 'stash') return this.stash ? this.stash[s.index] : 0;
    if (s.kind === 'craft') return this.grid[s.index];
    if (s.kind === 'out') return craft(this.grid);
    return this.slots[s.index];
  }

  click(s, shift) {
    const sl = this.slots;
    if (s.kind === 'cat') {
      const id = this.catItem(s.index);
      if (!id) this.carry = 0; // an empty catalogue slot takes whatever is carried
      else if (shift) {
        // straight into the hotbar if there is room, else into storage
        const i = sl.indexOf(0);
        if (i >= 0) sl[i] = id;
      } else this.carry = this.carry ? 0 : id; // an endless supply; also where unwanted items go
    } else if (s.kind === 'inv') {
      const i = s.index;
      if (shift && this.stash) {
        // with a chest open: straight into it
        const j = this.stash.indexOf(0);
        if (j >= 0) [this.stash[j], sl[i]] = [sl[i], 0];
      } else if (shift) {
        // hop between hotbar and storage
        const [from, to] = i < 9 ? [9, 36] : [0, 9];
        let j = -1;
        for (let k = from; k < to && j < 0; k++) if (!sl[k]) j = k;
        if (j >= 0) [sl[j], sl[i]] = [sl[i], 0];
      } else [sl[i], this.carry] = [this.carry, sl[i]];
    } else if (s.kind === 'stash' && this.stash) {
      const i = s.index;
      if (shift) {
        // out of the chest into the first free slot
        const j = sl.indexOf(0);
        if (j >= 0) [sl[j], this.stash[i]] = [this.stash[i], 0];
      } else [this.stash[i], this.carry] = [this.carry, this.stash[i]];
    } else if (s.kind === 'craft') {
      [this.grid[s.index], this.carry] = [this.carry, this.grid[s.index]];
    } else if (s.kind === 'out') {
      const made = craft(this.grid);
      if (made && !this.carry) {
        this.carry = made;
        this.grid.fill(0);
        if (this.onCraft) this.onCraft(made);
      }
    }
    this.changed();
  }

  // A digit pressed over a slot swaps it with that hotbar slot.
  key(code) {
    if (!code.startsWith('Digit') || !this.hover) return;
    const n = +code.slice(5) - 1;
    if (n < 0 || n > 8) return;
    const s = this.hover;
    if (s.kind === 'cat') this.slots[n] = this.catItem(s.index) || this.slots[n];
    else if (s.kind === 'inv') [this.slots[n], this.slots[s.index]] = [this.slots[s.index], this.slots[n]];
    else return;
    this.changed();
  }

  get inventoryOpen() {
    return !$('inventory').classList.contains('hidden');
  }

  openInventory() {
    $('inventory').classList.remove('hidden');
    this.hover = null;
    this.refresh();
  }

  // The inventory with a chest's 27 slots above it in place of the catalogue. `items` is edited
  // in place; `done(items)` is called when the window closes.
  openChest(items, done) {
    this.stash = items;
    this.onStash = done;
    $('stash').classList.remove('hidden');
    document.querySelector('.mc-window.catalog').classList.add('hidden');
    this.openInventory();
  }

  closeInventory() {
    // whatever is on the cursor or the crafting squares goes back into a free slot
    for (const id of [this.carry, ...this.grid]) {
      const i = this.slots.indexOf(0);
      if (id && i >= 0 && !this.slots.includes(id)) this.slots[i] = id;
    }
    this.carry = 0;
    this.grid.fill(0);
    this.hover = null;
    $('inventory').classList.add('hidden');
    if (this.stash) {
      const items = this.stash, done = this.onStash;
      this.stash = this.onStash = null;
      $('stash').classList.add('hidden');
      document.querySelector('.mc-window.catalog').classList.remove('hidden');
      if (done) done(items);
    }
    this.changed();
  }

  // Carried item and tooltip follow the mouse.
  follow() {
    const cur = $('mc-cursor'), tip = $('mc-tip');
    cur.style.display = this.carry ? 'block' : 'none';
    cur.style.left = `${this.mx}px`;
    cur.style.top = `${this.my}px`;
    const name = !this.carry && this.hover ? itemName(this.itemOf(this.hover)) : '';
    tip.style.display = name ? 'block' : 'none';
    if (name) {
      tip.textContent = name;
      tip.style.left = `${this.mx + 14}px`;
      tip.style.top = `${this.my - 30}px`;
    }
  }

  changed() {
    this.refresh();
    if (this.onChange) this.onChange();
  }

  refresh() {
    this.bar.forEach((s, i) => {
      paint(s, this.slots[i]);
      s.el.classList.toggle('sel', i === this.selected);
    });
    for (const s of this.cells) paint(s, this.itemOf(s));
    const ctx = $('mc-cursor').getContext('2d');
    ctx.clearRect(0, 0, 48, 48);
    if (this.carry) ctx.drawImage(itemIcon(this.carry), 0, 0);
    this.follow();
  }

  // The game's own character in the inventory window: a road worker in a hard hat and an
  // orange vest (2 canvas pixels per pixel of the figure).
  drawDoll() {
    const ctx = $('mc-doll').getContext('2d');
    const x = 9, y = 4;
    const box = (c, bx, by, w, h) => {
      ctx.fillStyle = c;
      ctx.fillRect(x + bx, y + by, w, h);
    };
    box('#f2c21a', 8, 0, 16, 5); // hard hat and its brim
    box('#fbe27a', 14, 0, 4, 5);
    box('#c99a0c', 6, 5, 20, 2);
    box('#c68e68', 8, 7, 16, 9); // face
    box('#2a1d14', 11, 10, 2, 2);
    box('#2a1d14', 19, 10, 2, 2);
    box('#8a5a44', 14, 13, 4, 1);
    box('#f07c1a', 8, 16, 16, 24); // vest with reflective stripes
    box('#d9dde0', 8, 24, 16, 2);
    box('#d9dde0', 8, 32, 16, 2);
    for (const ax of [0, 24]) {
      box('#f07c1a', ax, 16, 8, 10); // sleeve, band, forearm, glove
      box('#d9dde0', ax, 26, 8, 2);
      box('#c68e68', ax, 28, 8, 6);
      box('#3d4148', ax, 34, 8, 6);
    }
    box('#3a3d44', 8, 40, 16, 20); // trousers
    box('#2c2f35', 15, 40, 2, 20);
    box('#d9dde0', 8, 54, 16, 2);
    box('#2a211c', 8, 60, 16, 4); // boots
  }

  // ---- messages

  flash(el, html, ms) {
    el.innerHTML = html;
    el.style.opacity = html ? 1 : 0;
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.style.opacity = 0), ms);
  }

  toast(text, ms = 2200) {
    this.flash($('toast'), tx(text), ms);
  }

  setTarget(text) {
    const el = $('target');
    if (text) el.textContent = text;
    el.style.opacity = text ? 1 : 0;
  }

  addPlaces(list) {
    for (const p of list) if (p.name) this.places.push(p);
  }

  // Nearest named neighbourhood; announces it when it changes.
  updatePlace(x, z) {
    let best = null, bd = 700 * 700;
    for (const p of this.places) {
      if (p.cls === 'city' || p.cls === 'country' || p.cls === 'state') continue;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best && best !== this.place) {
      this.place = best;
      const sub = best.local && best.local !== best.name ? `<small>${best.local}</small>` : '';
      this.flash($('place-title'), `${best.name}${sub}`, 3200);
    }
    return this.place;
  }

  setInfo(html) {
    $('info').innerHTML = html;
  }

  // ---- minimap

  // The map is drawn along the block grid; when that is turned to the streets, north is no
  // longer straight up, and the K slides along the top edge to where it is.
  setNorth(turn) {
    $('north').style.left = `${50 - Math.tan((turn * Math.PI) / 180) * 50}%`;
  }

  toggleMap() {
    this.bigMap = !this.bigMap;
    $('map-wrap').classList.toggle('big', this.bigMap);
  }

  drawMap(world, player, panos) {
    const canvas = $('minimap');
    const size = this.bigMap ? 512 : 160;
    if (canvas.width !== size) canvas.width = canvas.height = size;
    const ctx = this.mapCtx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#10131a';
    ctx.fillRect(0, 0, size, size);
    const scale = this.bigMap ? size / ((world.radius * 2 + 1) * CHUNK) : 1;
    const half = size / 2;
    const cs = CHUNK * scale;
    for (const ch of world.chunks.values()) {
      const sx = Math.floor((ch.cx * CHUNK - player.x) * scale + half);
      const sz = Math.floor((ch.cz * CHUNK - player.z) * scale + half);
      if (sx > size || sz > size || sx + cs < 0 || sz + cs < 0) continue;
      ctx.drawImage(ch.map, sx, sz, Math.ceil(cs), Math.ceil(cs));
    }
    if (panos) {
      const next = panos.snapped ? panos.links(panos.snapped).map((l) => l.node) : [];
      for (const n of panos.list) {
        const sx = (n.x0 - player.x) * scale + half, sz = (n.z0 - player.z) * scale + half;
        if (sx < 0 || sz < 0 || sx > size || sz > size) continue;
        const here = n === panos.current, link = next.includes(n);
        ctx.fillStyle = here ? '#ffd23f' : link ? '#ffffff' : 'rgba(51,224,255,0.55)';
        const r = here || link ? 2 : 1;
        ctx.fillRect(Math.round(sx) - r, Math.round(sz) - r, r * 2, r * 2);
      }
    }
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(-player.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fillStyle = '#ff3b30';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
