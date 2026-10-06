// Optional texture pack: images in public/textures/, laid out like a resource pack's textures
// folder (block/stone.png, item/iron_sword.png, gui/sprites/hud/hotbar.png, ...). pack.json in
// that folder says which file dresses which of the game's own textures, item sprites and HUD
// pieces. Whatever is missing keeps the built-in drawing. The skeleton, the arrows and the
// player's arm are not part of this: they are the game's own.
import { TEX_SIZE, setLayer } from './textures.js';
import { I, packSprites } from './items.js';

const S = TEX_SIZE;
const BASE = `${import.meta.env.BASE_URL}textures/`;
const ITEMS = { sword: I.SWORD, pickaxe: I.PICKAXE, flint: I.FLINT, bow: I.BOW, egg: I.EGG, bread: I.BREAD };
const url = (file) => BASE + file.split('/').map(encodeURIComponent).join('/');

function image(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url(file);
  });
}

// A dev server answers unknown paths with the page itself, so "200 OK" alone proves nothing.
async function exists(file) {
  const res = await fetch(url(file), { method: 'HEAD' });
  return res.ok && (res.headers.get('content-type') || '').startsWith('image/');
}

// The first square frame of an image at S x S (animated textures stack their frames), with an
// optional tint: grass and leaves come grey and take their green from a colour.
function frame(img, tint) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, 0, 0, side, side, 0, 0, S, S);
  if (tint) {
    const m = /^#?([0-9a-f]{6})$/i.exec(tint);
    const k = m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) : [1, 1, 1];
    const px = ctx.getImageData(0, 0, S, S);
    for (let i = 0; i < px.data.length; i += 4) for (let j = 0; j < 3; j++) px.data[i + j] *= k[j];
    ctx.putImageData(px, 0, 0);
  }
  return c;
}

// "file.png" or { file, tint } -> [{ name, file, tint }]
const entries = (group) => Object.entries(group || {})
  .map(([name, v]) => ({ name, file: typeof v === 'string' ? v : v && v.file, tint: v && v.tint }))
  .filter((e) => typeof e.file === 'string' && e.file);

// Applies block textures and item sprites in place; returns the HUD images that were found as
// { name: { url, img } } (empty without a pack). Call before any texture is used.
export async function loadTexturePack() {
  const gui = {};
  try {
    const res = await fetch(`${BASE}pack.json`);
    if (!res.ok) return gui;
    const json = await res.json();
    let missing = 0;
    // each part is skipped with one request if its first file is not there
    const part = async (group, use) => {
      const list = entries(group);
      if (!list.length || !(await exists(list[0].file))) return;
      await Promise.all(list.map(async (e) => {
        const img = await image(e.file);
        if (img) use(e, img);
        else missing++;
      }));
    };
    await Promise.all([
      part(json.blocks, (e, img) => setLayer(e.name, frame(img, e.tint).getContext('2d').getImageData(0, 0, S, S).data)),
      part(json.items, (e, img) => ITEMS[e.name] && packSprites.set(ITEMS[e.name], frame(img, e.tint))),
      part(json.gui, (e, img) => (gui[e.name] = { url: url(e.file), img })),
    ]);
    if (missing) console.warn(`texture pack: ${missing} listed file(s) not found; their built-in drawings stay`);
  } catch (e) {
    console.warn('texture pack unreadable', e);
  }
  return gui;
}
