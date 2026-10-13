// Google Street View through the Map Tiles API (needs the player's own API key, with the
// "Map Tiles API" enabled for it). The key travels in a header, never in a URL.
//
// A panorama is not one file here: it is a grid of 512 px tiles per zoom level. They are
// stitched into one picture when a panorama is first shown (see stitch()). Every tile is a
// request Google counts, so the tiles are counted here as well and a monthly cap stops the
// game before the free allowance runs out - or, if the player has set aside a number of tiles
// to pay for, once those are gone too (see usage() and cap()).

const API = 'https://tile.googleapis.com/v1';
const SESSION_KEY = 'geocrafter:google-session';
const USAGE_KEY = 'geocrafter:google-usage';
export const GOOGLE_KEY = 'geocrafter:google-key';
export const PAID_KEY = 'geocrafter:google-paid';
// Google's terms for the Street View Tiles of this API, as published in October 2026.
export const FREE_TILES = 100000; // free per month; 2 USD per 1000 after that
export const DAILY_QUOTA = 15000; // what a project may ask for per day unless its quota was raised
const SAFE_CAP = 90000; // tiles per month while nothing may be paid for: short of the free ones, since the count here is not Google's
const HD_RESERVE = 0.15; // the last part of the cap is kept for travelling: no sharp pictures then

const TILE = 512;
const SD_ZOOM = 3; // 4096 px wide, 32 tiles: what the player travels on
const HD_ZOOM = 4; // 8192 px wide: loaded once the player stands still
const HD_BAND = 45; // degrees above and below the horizon fetched at HD_ZOOM (64 tiles instead of 128)
const GRID = 9; // GRID x GRID points are asked for their nearest panorama
const MAX_NEW = 70; // panoramas described per request for the surroundings
const FIRST = 40; // of those, at most this many are spent on finding the nearest one
const REACH = 25; // metres: a linked panorama is no farther than this from the one that links to it
const KEEP = { sd: 14, hd: 2 }; // stitched pictures kept per size
const CAMERA = 2.6; // metres above the road: measured once from a 2026 car's photos, assumed for the rest
const OWN = /^[\w-]{22}$/; // ids of Google's own panoramas; photo spheres uploaded by others are longer

const rad = (d) => (d * Math.PI) / 180;

// ---------------------------------------------------------------- tile count

// Google's day and month turn over at midnight Pacific time.
const pacificDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); // YYYY-MM-DD

// Tiles this browser has asked for: { day, today, month, paid }. paid: those past the free
// allowance in the months before this one. Other programs using the same key are not in it;
// the Cloud Console has the full count.
export function usage() {
  let u = null;
  try {
    u = JSON.parse(localStorage.getItem(USAGE_KEY));
  } catch (e) {
    // unreadable: counted from zero
  }
  const day = pacificDay();
  const saved = (u && typeof u.day === 'string' && u.day) || '';
  const same = saved.slice(0, 7) === day.slice(0, 7);
  const month = (u && +u.month) || 0;
  return {
    day,
    today: saved === day ? +u.today || 0 : 0,
    month: same ? month : 0,
    paid: ((u && +u.paid) || 0) + (same ? 0 : Math.max(0, month - FREE_TILES)),
  };
}

function spend(n) {
  const u = usage();
  u.today += n;
  u.month += n;
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(u));
  } catch (e) {
    // storage full or blocked: the cap cannot be kept, the game still runs
  }
}

// How many tiles the player has said they will pay for, all told (0: none).
export function paidBudget() {
  return Math.max(0, Math.floor(+localStorage.getItem(PAID_KEY)) || 0);
}

// Tiles this browser may ask for this month: the free ones and what is left of the tiles to be
// paid for. With nothing left to pay with it stops a little short of the free ones.
export function cap() {
  const left = paidBudget() - usage().paid;
  return left > 0 ? FREE_TILES + left : SAFE_CAP;
}

// ---------------------------------------------------------------- pose

// Row-major 3x3: block world (x east, y up, z south) -> panorama (x right, y up, centre at -z).
// `tilt` is 90 for a level camera, less with the nose down; `roll` is clockwise. The pictures are
// in the camera's own frame (on a steep street every house leans), so this is what levels them.
function rotation(heading, tilt, roll) {
  const h = rad(heading), p = rad((tilt ?? 90) - 90), r = rad(roll ?? 0);
  const ch = Math.cos(h), sh = Math.sin(h), cp = Math.cos(p), sp = Math.sin(p), cr = Math.cos(r), sr = Math.sin(r);
  const Y = [ch, 0, sh, 0, 1, 0, -sh, 0, ch];
  const X = [1, 0, 0, 0, cp, sp, 0, -sp, cp];
  const Z = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  const mul = (a, b) => {
    const o = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return o;
  };
  return mul(Z, mul(X, Y));
}

// ---------------------------------------------------------------- provider

export class GoogleProvider {
  constructor(key) {
    this.name = 'Google';
    this.key = key;
    this.error = '';
    this.onLimit = null; // called once when the monthly cap stops a download
    this.down = false; // Google has said no for now (its own daily quota, say)
    this.first = null; // Promise<boolean>: did the first search for panoramas go through?
    this.seen = new Set(); // panorama ids already described
    this.pictures = { sd: new Map(), hd: new Map() }; // node id -> Promise<object URL>
  }

  // `counted`: tiles and panorama searches are what Google counts (and bills); the rest is free.
  async call(path, init = {}, counted = false) {
    let res;
    for (let attempt = 0; ; attempt++) {
      res = await fetch(`${API}/${path}`, { ...init, headers: { 'X-Goog-Api-Key': this.key, ...(init.headers || {}) } });
      // busy or over the per-minute rate: wait a little and ask again
      if ((res.status !== 429 && res.status < 500) || attempt >= 3) break;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
    if (!res.ok) {
      let reason = `HTTP ${res.status}`;
      try {
        const e = (await res.json()).error;
        const why = e.details?.find((d) => d.reason)?.reason;
        if (why === 'API_KEY_SERVICE_BLOCKED' || why === 'SERVICE_DISABLED') reason = 'the key is not allowed to use the Map Tiles API';
        else if (why === 'API_KEY_INVALID') reason = 'the key is not valid';
        else if (res.status === 429) {
          // Google names the limit that was hit; the project's daily one stays shut until midnight
          const limit = e.details?.find((d) => d.metadata?.quota_limit)?.metadata.quota_limit || '';
          reason = /PerDay/i.test(limit) ? 'daily quota used up (resets at midnight Pacific time)' : 'request limit exceeded (per-minute or daily quota)';
          this.down = true; // asked four times: not a busy moment, so the other sources take over
          this.error = reason;
        }
        else if (e.message) reason = e.message;
        // a session Google no longer knows: the next visit asks for a new one
        if (/session/i.test(e.message || '') && path !== 'createSession') localStorage.removeItem(SESSION_KEY);
      } catch (e) {
        // no readable body: the status code is all there is
      }
      throw new Error(reason);
    }
    if (counted) spend(1);
    return res;
  }

  // Refuse a download that would take the month's count past the cap.
  budget(tiles, share = 1) {
    if (usage().month + tiles <= cap() * share) return;
    if (share === 1) {
      this.error = 'tile cap reached';
      if (this.onLimit) this.onLimit();
      this.onLimit = null;
    }
    throw new Error('tile cap reached');
  }

  // One session token serves every request for about two weeks; it is kept between visits.
  ready() {
    if (!this.session) {
      this.session = (async () => {
        try {
          const saved = JSON.parse(localStorage.getItem(SESSION_KEY));
          if (saved && saved.key === this.key.slice(-6) && saved.expiry * 1000 > Date.now() + 3600e3) return saved.session;
        } catch (e) {
          // nothing usable saved
        }
        const res = await this.call('createSession', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mapType: 'streetview', language: 'en', region: 'TR' }),
        });
        const j = await res.json();
        localStorage.setItem(SESSION_KEY, JSON.stringify({ session: j.session, expiry: +j.expiry, key: this.key.slice(-6) }));
        return j.session;
      })();
      this.session.catch((e) => (this.error = e.message));
    }
    return this.session;
  }

  // Can this key show panoramas right now? Other sources wait for the answer and step aside
  // if it can: two sources with different poses in one street would not line up with each other.
  // A key that opens a session may still be out of quota, so the first real search decides.
  works() {
    return this.ready().then(() => {
      if (this.down) return false;
      if (usage().month >= cap()) {
        this.error = 'tile cap reached';
        return false;
      }
      return this.first || true;
    }, () => false);
  }

  // Panoramas around a point: the nearest one to each point of a grid, described one by one
  // (position, direction, date), the closest first.
  around(lon, lat, radius, onBatch) {
    let settle = null;
    if (!this.first) this.first = new Promise((resolve) => (settle = resolve));
    const run = this.find(lon, lat, radius, onBatch, settle || (() => {}));
    run.catch(() => settle && settle(false));
    return run;
  }

  // `reached(true)` as soon as Google has answered the search itself.
  async find(lon, lat, radius, onBatch, reached) {
    const session = await this.ready();
    this.budget(1);
    const kx = 1 / (Math.cos(rad(lat)) * 111320), ky = 1 / 111320;
    const step = (2 * radius) / (GRID - 1);
    const locations = [];
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) locations.push({ lat: lat + (j * step - radius) * ky, lng: lon + (i * step - radius) * kx });
    }
    // closest first, so the place the player stands on is the first to arrive
    locations.sort((a, b) => Math.hypot((a.lng - lon) / kx, (a.lat - lat) / ky) - Math.hypot((b.lng - lon) / kx, (b.lat - lat) / ky));
    const res = await this.call(`streetview/panoIds?session=${session}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations, radius: Math.ceil(step) }),
    }, true);
    // The answer names whatever is nearest to each point, photo spheres included; Google's own
    // panoramas behind those are reached through the links of the ones found. Whatever is
    // thought to be closest to the middle is described next: the crawl spreads outwards.
    reached(true);
    const far = (p) => Math.hypot((p.lng - lon) / kx, (p.lat - lat) / ky);
    const queue = []; // [least it can be from the middle (metres), id]
    ((await res.json()).panoIds || []).forEach((id, i) => {
      if (!OWN.test(id) || this.seen.has(id)) return;
      this.seen.add(id);
      queue.push([Math.max(0, far(locations[i]) - step), id]); // found within a step of its grid point
    });
    const take = () => {
      let k = 0;
      for (let i = 1; i < queue.length; i++) if (queue[i][0] < queue[k][0]) k = i;
      return queue.splice(k, 1)[0];
    };
    let left = MAX_NEW;
    const visit = async ([, id]) => {
      left--;
      const node = await this.describe(session, id).catch(() => null);
      if (!node) return null;
      // the streets are followed outwards, but not out of the neighbourhood
      const d = far({ lng: node.lon, lat: node.lat });
      if (d <= radius * 1.6) {
        for (const nid of node.next) {
          if (!OWN.test(nid) || this.seen.has(nid)) continue;
          this.seen.add(nid);
          queue.push([Math.max(0, d - REACH), nid]);
        }
      }
      return node;
    };

    // First the place to stand: everything that could still be nearer than the nearest one found.
    // They go out together; handed over one at a time, each nearer arrival would be loaded as the
    // place to stand, a full picture each time.
    const first = [];
    let best = Infinity;
    while (left > 0 && first.length < FIRST) {
      const round = [];
      while (round.length < 6 && round.length < left && queue.some(([d]) => d < best)) round.push(take());
      if (!round.length) break;
      for (const node of await Promise.all(round.map(visit))) {
        if (!node) continue;
        first.push(node);
        best = Math.min(best, far({ lng: node.lon, lat: node.lat }));
      }
    }
    if (first.length) onBatch(first);

    // Then the rest of the neighbourhood.
    let busy = 0;
    const worker = async () => {
      // an empty queue is not the end while another worker may still add to it
      while (left > 0 && (queue.length || busy)) {
        if (!queue.length) {
          await new Promise((r) => setTimeout(r, 40));
          continue;
        }
        busy++;
        const node = await visit(take());
        busy--;
        if (node) onBatch([node]);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    for (const [, id] of queue) this.seen.delete(id); // not reached this time: free for the next search
  }

  async describe(session, panoId) {
    const m = await (await this.call(`streetview/metadata?session=${session}&panoId=${encodeURIComponent(panoId)}`)).json();
    if (!/Google$/.test(m.copyright || '')) return null; // somebody's own photo sphere
    const level = Math.abs((m.tilt ?? 90) - 90) < 0.05 && Math.abs(m.roll ?? 0) < 0.05;
    const maxZoom = Math.max(0, Math.ceil(Math.log2((m.imageWidth || 16384) / (m.tileWidth || TILE))));
    const node = {
      id: `g${m.panoId}`,
      provider: this.name,
      exact: true, // surveyed pose: nothing to solve
      lon: m.lng,
      lat: m.lat,
      heading: m.heading || 0,
      rot: level ? null : rotation(m.heading || 0, m.tilt, m.roll),
      seq: 'google', // one camera height for all of them
      epoch: m.date || '', // the month of the drive: stepping within it keeps the season and the light
      height: CAMERA, // not in the data, and the photos are too far apart to measure it from them
      alt: m.originalElevationAboveEgm96 ?? null, // camera altitude: how the street rises from photo to photo
      date: m.date || '',
      author: 'Google Street View',
      license: '© Google',
      report: m.reportProblemLink || '',
      width: Math.round((m.imageWidth || 16384) / 2 ** Math.max(0, maxZoom - HD_ZOOM)),
      sd: 'google', // stitched on demand, see picture()
      hd: 'google',
      next: (m.links || []).map((l) => l.panoId).filter(Boolean),
    };
    node.near = new Set(node.next.map((id) => `g${id}`)); // the car drove from here to these
    node.picture = (which) => this.picture(node, which, session, m, maxZoom);
    return node;
  }

  // Object URL of the stitched panorama, `which` = 'sd' or 'hd'.
  picture(node, which, session, m, maxZoom) {
    const sdZoom = Math.min(maxZoom, SD_ZOOM), hdZoom = Math.min(maxZoom, HD_ZOOM);
    // a small panorama has nothing sharper to offer
    if (which === 'hd' && hdZoom <= sdZoom) return this.picture(node, 'sd', session, m, maxZoom);
    const kept = this.pictures[which];
    let p = kept.get(node.id);
    if (p) {
      kept.delete(node.id); // most recently used last
      kept.set(node.id, p);
      return p;
    }
    p = which === 'hd'
      ? this.picture(node, 'sd', session, m, maxZoom).then((under) => this.stitch(node.id.slice(1), session, m, hdZoom, maxZoom, under))
      : this.stitch(node.id.slice(1), session, m, sdZoom, maxZoom);
    p.catch(() => kept.delete(node.id));
    kept.set(node.id, p);
    for (const [id, old] of kept) {
      if (kept.size <= KEEP[which]) break;
      if (id === node.id) continue;
      kept.delete(id);
      old.then((url) => URL.revokeObjectURL(url)).catch(() => {});
    }
    return p;
  }

  // `under`: a smaller picture of the same panorama. With one, only the band around the horizon
  // is fetched at this zoom; the sky above and the road at the wheels are that picture enlarged.
  async stitch(panoId, session, m, zoom, maxZoom, under = null) {
    const scale = 2 ** (maxZoom - zoom);
    const tw = m.tileWidth || TILE, th = m.tileHeight || TILE;
    const w = Math.round((m.imageWidth || 16384) / scale), h = Math.round((m.imageHeight || 8192) / scale);
    const rows = Math.ceil(h / th);
    const y0 = under ? Math.max(0, Math.floor((h * (0.5 - HD_BAND / 180)) / th)) : 0;
    const y1 = under ? Math.min(rows, Math.ceil((h * (0.5 + HD_BAND / 180)) / th)) : rows;
    const tiles = [];
    for (let y = y0; y < y1; y++) for (let x = 0; x < Math.ceil(w / tw); x++) tiles.push([x, y]);
    this.budget(tiles.length, under ? 1 - HD_RESERVE : 1);

    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (under) {
      const img = await createImageBitmap(await (await fetch(under)).blob());
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      img.close();
    }
    const worker = async () => {
      for (let t = tiles.pop(); t; t = tiles.pop()) {
        const [x, y] = t;
        const res = await this.call(`streetview/tiles/${zoom}/${x}/${y}?session=${session}&panoId=${encodeURIComponent(panoId)}`, {}, true);
        const bmp = await createImageBitmap(await res.blob());
        ctx.drawImage(bmp, x * tw, y * th);
        bmp.close();
      }
    };
    await Promise.all(Array.from({ length: 24 }, worker));
    const blob = await new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('stitch failed'))), 'image/jpeg', 0.92));
    cv.width = cv.height = 0;
    return URL.createObjectURL(blob);
  }
}

// A source that only answers while Google cannot (no key rights, no network, cap reached).
export function unlessGoogle(google, provider) {
  const standIn = { name: provider.name };
  if (provider.around) {
    standIn.around = async (lon, lat, radius, onBatch) => {
      if (!(await google.works())) return provider.around(lon, lat, radius, onBatch);
    };
  } else {
    standIn.search = async (...box) => ((await google.works()) ? [] : provider.search(...box));
  }
  return standIn;
}
