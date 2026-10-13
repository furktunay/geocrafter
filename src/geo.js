// Web Mercator <-> local block coordinates. One block is one metre at the origin latitude.
// Block axes follow Minecraft: +x east, +z south, +y up.
export const EARTH_C = 40075016.685578488;

export function lonLatToMerc(lon, lat) {
  const s = Math.sin((lat * Math.PI) / 180);
  return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
}

export function mercToLonLat(mx, my) {
  const n = Math.PI - 2 * Math.PI * my;
  return [mx * 360 - 180, (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))];
}

export class Projection {
  // `turn`: compass bearing (degrees) the block grid's -z axis points to. 0 is the usual north-up
  // world; anything else turns the grid so that blocks run along the streets (see grid.js).
  constructor(lon, lat, turn = 0) {
    this.lon0 = lon;
    this.lat0 = lat;
    [this.mx0, this.my0] = lonLatToMerc(lon, lat);
    // normalised mercator units per block
    this.k = 1 / (EARTH_C * Math.cos((lat * Math.PI) / 180));
    this.turn = turn;
    this.c = Math.cos((turn * Math.PI) / 180);
    this.s = Math.sin((turn * Math.PI) / 180);
  }

  // Block -> normalised mercator. (Blocks east and south of the origin are x c - z s and
  // x s + z c; hot loops write that out with `c`, `s`, `k` instead of calling this.)
  blockToMerc(x, z) {
    return [this.mx0 + (x * this.c - z * this.s) * this.k, this.my0 + (x * this.s + z * this.c) * this.k];
  }

  mercToBlock(mx, my) {
    const e = (mx - this.mx0) / this.k, s = (my - this.my0) / this.k;
    return [e * this.c + s * this.s, s * this.c - e * this.s];
  }

  blockToLonLat(x, z) {
    const [mx, my] = this.blockToMerc(x, z);
    return mercToLonLat(mx, my);
  }

  lonLatToBlock(lon, lat) {
    const [mx, my] = lonLatToMerc(lon, lat);
    return this.mercToBlock(mx, my);
  }

  // Tile indices covering a block-space box at zoom z (the box may lie askew to the tiles).
  tileRange(z, minx, minz, maxx, maxz) {
    const n = 2 ** z;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 4; i++) {
      const bx = i & 1 ? maxx : minx, bz = i & 2 ? maxz : minz;
      const mx = this.mx0 + (bx * this.c - bz * this.s) * this.k, my = this.my0 + (bx * this.s + bz * this.c) * this.k;
      if (mx < x0) x0 = mx;
      if (mx > x1) x1 = mx;
      if (my < y0) y0 = my;
      if (my > y1) y1 = my;
    }
    return { tx0: Math.floor(x0 * n), ty0: Math.floor(y0 * n), tx1: Math.floor(x1 * n), ty1: Math.floor(y1 * n) };
  }

  // A tile in block space: its top-left corner (x0, z0), the block step for one tile width
  // eastwards (ux, uz) and southwards (vx, vz), and the box around it (minx..maxz).
  tileFrame(z, tx, ty) {
    const n = 2 ** z;
    const [x0, z0] = this.mercToBlock(tx / n, ty / n);
    const size = 1 / n / this.k;
    const ux = size * this.c, uz = -size * this.s, vx = size * this.s, vz = size * this.c;
    return {
      x0, z0, size, ux, uz, vx, vz,
      minx: x0 + Math.min(0, ux) + Math.min(0, vx), maxx: x0 + Math.max(0, ux) + Math.max(0, vx),
      minz: z0 + Math.min(0, uz) + Math.min(0, vz), maxz: z0 + Math.max(0, uz) + Math.max(0, vz),
    };
  }
}

export function isJapan(lon, lat) {
  return lon > 122 && lon < 154 && lat > 20 && lat < 46;
}
