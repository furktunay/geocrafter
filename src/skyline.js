// Automatic alignment of a panorama with the city model.
// GPS headings are often tens of degrees off and GPS positions several metres. The outline of
// the buildings against the sky is known twice: from the photo (where the sky ends) and from the
// model as seen from a given spot. The pose whose model outline best fits the photo's is the
// real one. This file holds the parts shared by the page (photo outline) and the worker (search).

export const SKY_W = 720; // azimuth bins, 0.5° each
export const SKY_STEP = 360 / SKY_W;

// Elevation (degrees) where the sky ends for each photo column, in the panorama's own frame
// (bin 0 = 180° left of the image centre). Null if the top of the photo is not sky.
let canvas = null, ctx = null;
export function photoProfile(image) {
  const W = SKY_W, h = W / 2;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = h;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  }
  ctx.drawImage(image, 0, 0, W, h);
  const px = ctx.getImageData(0, 0, W, h).data;
  const rows = Math.round(h * 0.56); // down to ~10° below the horizon
  const lum = new Float32Array(W * rows);
  for (let i = 0; i < W * rows; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  // reference brightness: the band around the zenith
  const zen = [];
  for (let y = 4; y < 30; y++) for (let x = 0; x < W; x += 4) zen.push(lum[y * W + x]);
  zen.sort((a, b) => a - b);
  const ref = zen[zen.length >> 1];
  if (ref < 60) return null;
  // sky = bright and smooth, connected to the top of the image
  const cand = new Uint8Array(W * rows);
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const gx = lum[y * W + ((x + 1) % W)] - lum[y * W + ((x + W - 1) % W)];
      const gy = lum[i + W] - lum[i - W];
      cand[i] = lum[i] > ref * 0.55 && Math.abs(gx) + Math.abs(gy) < 26 ? 1 : 0;
    }
  }
  const sky = new Uint8Array(W * rows);
  const stack = [];
  for (let x = 0; x < W; x++) {
    sky[W + x] = 1;
    stack.push(W + x);
  }
  while (stack.length) {
    const i = stack.pop();
    const y = (i / W) | 0, x = i - y * W;
    const nb = [y * W + ((x + 1) % W), y * W + ((x + W - 1) % W), i + W, i - W];
    for (const j of nb) {
      if (j < W || j >= W * rows || sky[j] || !cand[j]) continue;
      sky[j] = 1;
      stack.push(j);
    }
  }
  const out = new Float32Array(W);
  let covered = 0;
  for (let x = 0; x < W; x++) {
    let y = 1;
    while (y < rows && sky[y * W + x]) y++;
    out[x] = 90 - (y / h) * 180;
    if (y > 20) covered++;
  }
  return covered > W * 0.5 ? out : null;
}

// Mismatch between a model outline (per world azimuth) and a photo outline, for every heading.
export function headingCosts(model, photo, cost) {
  const W = SKY_W;
  for (let hi = 0; hi < W; hi++) {
    let c = 0;
    // world azimuth i sits at photo azimuth (i - hi) from the image centre
    let j = (W / 2 - hi + W * 2) % W;
    for (let i = 0; i < W; i++) {
      const d = model[i] - photo[j];
      if (d > 1.5) c += (d < 30 ? d : 30) * 2; // model sticks into the photo's sky: wrong
      else if (d < -1.5) c += (d > -12 ? -d : 12) * 0.6; // photo has trees / new towers: tolerated
      if (++j === W) j = 0;
    }
    cost[hi] = c / W;
  }
  return cost;
}

// Lowest cost overall and within `range` degrees of a preferred heading.
export function pickHeadings(cost, prefer, range) {
  let g = 0, l = -1, sum = 0;
  for (let hi = 0; hi < SKY_W; hi++) {
    sum += cost[hi];
    if (cost[hi] < cost[g]) g = hi;
    const diff = Math.abs(((hi * SKY_STEP - prefer + 540) % 360) - 180);
    if (diff <= range && (l < 0 || cost[hi] < cost[l])) l = hi;
  }
  return { global: g * SKY_STEP, globalCost: cost[g], local: l * SKY_STEP, localCost: cost[l], mean: sum / SKY_W };
}

// Camera height of two level, north-centred panoramas taken a few metres apart (b is at
// (dx, dz) blocks from a). For each trial height both images are sampled where a patch of
// ground beside the track would appear; the height at which the two samples agree best is the
// real one. `la`, `lb`: luminance, 2000 x 1000, row 0 = zenith. Null if the ground has no
// usable texture.
export function groundMatch(la, lb, dx, dz, w = 2000, h = 1000) {
  const L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L, px = -uz, pz = ux;
  // patch points: beside the track (the vehicle itself covers the strip along it)
  const pts = [];
  for (let t = -1.5; t <= L + 1.5; t += 0.2) {
    for (let side = -1; side <= 1; side += 2) {
      for (let q = 2.4; q <= 7; q += 0.2) {
        const x = t * ux + side * q * px, z = t * uz + side * q * pz;
        pts.push(Math.hypot(x, z), Math.atan2(x, -z), Math.hypot(x - dx, z - dz), Math.atan2(x - dx, -(z - dz)));
      }
    }
  }
  const n = pts.length / 4;
  const sample = (img, d, az, ch) => {
    const col = Math.floor(((az / (2 * Math.PI) + 0.5) % 1 + 1) % 1 * w);
    const row = Math.min(h - 1, Math.floor((0.5 + Math.atan2(ch, d) / Math.PI) * h));
    return img[row * w + col];
  };
  let best = null;
  const scores = [];
  for (let ch = 1.4; ch <= 3.61; ch += 0.02) {
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let k = 0; k < n; k++) {
      const a = sample(la, pts[k * 4], pts[k * 4 + 1], ch), b = sample(lb, pts[k * 4 + 2], pts[k * 4 + 3], ch);
      sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
    }
    const va = saa - (sa * sa) / n, vb = sbb - (sb * sb) / n;
    const r = va > 1 && vb > 1 ? (sab - (sa * sb) / n) / Math.sqrt(va * vb) : 0;
    scores.push(r);
    if (!best || r > best.score) best = { height: ch, score: r };
  }
  scores.sort((p, q) => p - q);
  // a real match stands clearly above the typical trial
  return best.score > 0.3 && best.score - scores[scores.length >> 1] > 0.08 ? best : null;
}

// Where does a photo's own smeared-out vehicle begin? Some sources paint the car out with a
// blur that is wider than the car and different from one model year to the next, so it is read
// off the picture. `px`: RGBA of the strip from `top` degrees below the horizon down to the
// nadir, `cw` x `ch`, about a quarter of the picture's size, in the camera's own frame (centre
// column = straight ahead). Everything without detail that connects to the smear under the
// camera counts as smear; watermarks inside it are islands the fill flows around.
// -> Float32Array(cw): degrees below the horizon per column, or null if nothing is smeared.
export function smearOutline(px, cw, ch, top = 10) {
  const luma = new Float32Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) luma[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  const detail = new Float32Array(cw * ch);
  for (let y = 0; y < ch - 1; y++) {
    for (let x = 0; x < cw; x++) {
      const k = y * cw + x;
      detail[k] = Math.abs(luma[k + cw] - luma[k]) + Math.abs(luma[y * cw + ((x + 1) % cw)] - luma[k]);
    }
  }
  const local = new Float32Array(cw * ch); // detail averaged over a small window
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let s = 0, n = 0;
      for (let j = -2; j <= 2; j++) {
        const yy = y + j;
        if (yy < 0 || yy >= ch) continue;
        for (let i = -6; i <= 6; i += 2) {
          s += detail[yy * cw + ((x + i + cw) % cw)];
          n++;
        }
      }
      local[y * cw + x] = s / n;
    }
  }
  const span = 90 - top;
  const row = (deg) => Math.round(((deg - top) / span) * ch);
  const below = (r) => top + ((r + 0.5) / ch) * span;
  // How much detail is "none" depends on the picture: the rim of a smear keeps a trace of what
  // was under it, more of it over sunlit cobbles than over dull asphalt. So the bar is set from
  // the picture's own sharp ground, the ring just below the horizon strip's top.
  const ring = Array.from(local.subarray(0, row(top + 3) * cw)).sort((p, q) => p - q);
  const bar = Math.min(4, Math.max(1, ring[ring.length >> 1] * 0.2));
  const flat = new Uint8Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) flat[i] = local[i] < bar ? 1 : 0;
  // the fill starts from the ring 70 to 80 degrees down; the very bottom rows are left out (the
  // pole of the projection is noise, not detail)
  const y0 = row(70), y1 = row(80), bottom = row(86);
  const seen = new Uint8Array(cw * ch), stack = [];
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < cw; x++) {
      if (!flat[y * cw + x]) continue;
      seen[y * cw + x] = 1;
      stack.push(y * cw + x);
    }
  }
  if (stack.length < (y1 - y0) * cw * 0.5) return null; // sharp right under the camera: nothing was painted out
  while (stack.length) {
    const k = stack.pop(), y = (k / cw) | 0, x = k - y * cw;
    const around = [y * cw + ((x + 1) % cw), y * cw + ((x + cw - 1) % cw), k - cw, k + cw];
    for (let i = 0; i < 4; i++) {
      const n = around[i];
      if (n < 0 || n >= (bottom + 1) * cw || seen[n] || !flat[n]) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  const edge = new Float32Array(cw);
  for (let x = 0; x < cw; x++) {
    let y = 0;
    while (y < ch && !seen[y * cw + x]) y++;
    edge[x] = below(y);
  }
  // A car is the same on both sides, and something sharp lying on the smear (a shadow's edge,
  // a watermark at its rim) only ever makes it look smaller: take the wider of the two sides and
  // of the directions close by, then round the outline off.
  const wide = new Float32Array(cw), out = new Float32Array(cw);
  const reach = Math.round(cw / 24); // 15 degrees
  for (let x = 0; x < cw; x++) {
    let m = 90;
    for (let i = -reach; i <= reach; i++) m = Math.min(m, edge[(x + i + cw) % cw], edge[(cw - x + i + cw) % cw]);
    wide[x] = m;
  }
  for (let x = 0; x < cw; x++) {
    let sum = 0;
    for (let i = -reach; i <= reach; i++) sum += wide[(x + i + cw) % cw];
    out[x] = sum / (2 * reach + 1);
  }
  return out;
}
