// Optional texture pack: images in public/textures/, laid out like a resource pack's textures
// folder (block/stone.png, item/iron_sword.png, gui/sprites/hud/hotbar.png, ...). pack.json in
// that folder says which file dresses which of the game's own textures, item sprites and HUD
// pieces, and which sheet skins which creature. Whatever is missing keeps the built-in drawing.
// The arrows and the player's arm are not part of this: they are the game's own.
import { TEX_SIZE, setLayer } from './textures.js';
import { I, packSprites } from './items.js';
import { B } from './blocks.js';

const S = TEX_SIZE;
const BASE = `${import.meta.env.BASE_URL}textures/`;
const ITEMS = {
  sword: I.SWORD, pickaxe: I.PICKAXE, flint: I.FLINT, bow: I.BOW, egg: I.EGG, bread: I.BREAD, diamond: I.DIAMOND, egg_creeper: I.EGG_CREEPER, egg_zombie: I.EGG_ZOMBIE, egg_piglin: I.EGG_PIGLIN,
  door_oak: B.OAK_DOOR, door_iron: B.IRON_DOOR,
};
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
// optional tint: grass and leaves come grey and take their green from a colour. `rects` instead
// cuts pieces [x, y, w, h] out of a sheet and stacks them top to bottom. `place` copies pieces
// [x, y, w, h, to x, to y] of a 64-unit sheet to where they belong on the 16-unit texture, later
// ones over earlier ones: the side of a chest is its base with the lid's rim over it, and both
// lie apart on the sheet the chest's model uses. `turn` (quarter turns clockwise) and `flip`
// ('x' or 'y') put a picture the way this game looks at it: textures here have north at the
// bottom of a top face, and one picture serves both sides of a block.
function frame(img, { tint, rects, place, turn, flip } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  if (Array.isArray(place) && place.length) {
    const k = img.naturalWidth / 64, u = S / 16;
    for (const [x, y, w, h, tx, ty] of place) ctx.drawImage(img, x * k, y * k, w * k, h * k, tx * u, ty * u, w * u, h * u);
  } else if (Array.isArray(rects) && rects.length) {
    const total = rects.reduce((sum, r) => sum + r[3], 0);
    let done = 0;
    for (const [x, y, w, h] of rects) {
      const y0 = Math.round((done / total) * S), y1 = Math.round(((done + h) / total) * S);
      ctx.drawImage(img, x, y, w, h, 0, y0, S, y1 - y0);
      done += h;
    }
  } else {
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.translate(S / 2, S / 2);
    if (turn) ctx.rotate((turn * Math.PI) / 2);
    if (flip) ctx.scale(flip === 'x' ? -1 : 1, flip === 'y' ? -1 : 1);
    ctx.drawImage(img, 0, 0, side, side, -S / 2, -S / 2, S, S);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  if (tint) {
    const m = /^#?([0-9a-f]{6})$/i.exec(tint);
    const k = m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) : [1, 1, 1];
    const px = ctx.getImageData(0, 0, S, S);
    for (let i = 0; i < px.data.length; i += 4) for (let j = 0; j < 3; j++) px.data[i + j] *= k[j];
    ctx.putImageData(px, 0, 0);
  }
  return c;
}

// "file.png" or { file, tint, rects, place, turn, flip } -> [{ name, file, ... }]
const entries = (group) => Object.entries(group || {})
  .map(([name, v]) => (typeof v === 'string' ? { name, file: v } : { ...v, name }))
  .filter((e) => typeof e.file === 'string' && e.file);

// Creature skins a pack supplies (name -> image), e.g. "creeper". Empty without a pack.
export const skins = new Map();
// Block textures a pack supplies that move: name -> image, its square frames stacked top to
// bottom. The blocks themselves show the first frame; the portal's veil plays them all.
export const strips = new Map();

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
      part(json.blocks, (e, img) => {
        setLayer(e.name, frame(img, e).getContext('2d').getImageData(0, 0, S, S).data);
        if (!e.rects && !e.place && img.naturalHeight >= img.naturalWidth * 2) strips.set(e.name, img);
      }),
      // creature skins are kept as they come: their models read the sheet themselves (mobs.js)
      part(json.entities, (e, img) => skins.set(e.name, img)),
      part(json.items, (e, img) => ITEMS[e.name] && packSprites.set(ITEMS[e.name], frame(img, e))),
      part(json.gui, (e, img) => (gui[e.name] = { url: url(e.file), img })),
    ]);
    if (missing) console.warn(`texture pack: ${missing} listed file(s) not found; their built-in drawings stay`);
  } catch (e) {
    console.warn('texture pack unreadable', e);
  }
  return gui;
}
