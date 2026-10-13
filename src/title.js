// The title screen: the stone logo (drawn here, like every other picture in the game), the
// splash line beside it, and switching between the menu's screens.

// 5 x 7 letters, one string per row.
import { tx } from './i18n.js';

const GLYPHS = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
};
const CELL = 4; // texels per letter cell
const DEPTH = 5; // texels of dark stone under each letter, the logo's thickness
const EDGE = 1; // black outline

const SPLASHES = ['On real streets!', 'Break the asphalt too!', 'From photo to photo!', 'Mind the TNT!', 'There is stone under it!'];

const noise = (x, y) => ((Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b) ^ (x * y)) >>> 0) % 997 / 997;

// Letters cut from cobbled stone, lit from above, standing on a darker side face. Every stroke
// is two cells thick (the thin letters above, smeared one cell right and one down): a heavy,
// blocky word, written as one.
export function drawLogo(canvas, text = 'STREETCRAFT') {
  const GW = 6, GH = 8, STEP = GW + 1; // a bold letter's cells, and the pitch from one to the next
  const cols = text.length * STEP - 1;
  const cells = new Uint8Array(cols * GH);
  [...text].forEach((ch, n) => {
    const g = GLYPHS[ch];
    if (!g) return;
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (g[r][c] !== '#') continue;
        for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]]) cells[(r + dr) * cols + n * STEP + c + dc] = 1;
      }
    }
  });
  const w = cols * CELL + 2 * EDGE, h = GH * CELL + DEPTH + 2 * EDGE;
  canvas.width = w;
  canvas.height = h;
  // 0 nothing, 1 face, 2 side
  const kind = new Uint8Array(w * h);
  for (let r = 0; r < GH; r++) {
    for (let c = 0; c < cols; c++) {
      if (!cells[r * cols + c]) continue;
      for (let y = 0; y < CELL + DEPTH; y++) {
        for (let x = 0; x < CELL; x++) {
          const i = (EDGE + r * CELL + y) * w + EDGE + c * CELL + x;
          if (y < CELL) kind[i] = 1;
          else if (!kind[i]) kind[i] = 2;
        }
      }
    }
  }
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : kind[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = kind[y * w + x], o = (y * w + x) * 4;
      if (!k) {
        // outline wherever stone is one texel away
        if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) img.data[o + 3] = 255;
        continue;
      }
      let v;
      if (k === 1) {
        // coarse cobbles with a fine grain over them, a bright rim on top and a dim one below
        v = 150 + Math.floor(noise(x >> 1, y >> 1) * 4) * 12 + noise(x, y) * 10;
        if (at(x, y - 1) !== 1) v += 34;
        else if (at(x, y + 1) !== 1) v -= 30;
      } else {
        v = 62 + noise(x, y) * 16;
      }
      img.data[o] = v;
      img.data[o + 1] = v;
      img.data[o + 2] = v * 1.02;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Wire the menu: every [data-go] button opens the screen it names; Esc goes back to the first.
export function initTitle(overlay) {
  const screens = [...overlay.querySelectorAll('.screen')];
  const show = (name) => screens.forEach((s) => s.classList.toggle('hidden', s.dataset.screen !== name));
  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) show(b.dataset.go);
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && !overlay.classList.contains('hidden')) show('main');
  });
  drawLogo(overlay.querySelector('#logo-art'));
  overlay.querySelector('#splash').textContent = tx(SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
  return show;
}
