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
  constructor(lon, lat) {
    this.lon0 = lon;
    this.lat0 = lat;
    [this.mx0, this.my0] = lonLatToMerc(lon, lat);
    // normalised mercator units per block
    this.k = 1 / (EARTH_C * Math.cos((lat * Math.PI) / 180));
  }

  blockToLonLat(x, z) {
    return mercToLonLat(this.mx0 + x * this.k, this.my0 + z * this.k);
  }

  lonLatToBlock(lon, lat) {
    const [mx, my] = lonLatToMerc(lon, lat);
    return [(mx - this.mx0) / this.k, (my - this.my0) / this.k];
  }

  // Tile indices covering a block-space box at zoom z.
  tileRange(z, minx, minz, maxx, maxz) {
    const n = 2 ** z;
    return {
      tx0: Math.floor((this.mx0 + minx * this.k) * n),
      ty0: Math.floor((this.my0 + minz * this.k) * n),
      tx1: Math.floor((this.mx0 + maxx * this.k) * n),
      ty1: Math.floor((this.my0 + maxz * this.k) * n),
    };
  }

  // Block-space origin and size of a tile.
  tileFrame(z, tx, ty) {
    const n = 2 ** z;
    return {
      x0: (tx / n - this.mx0) / this.k,
      z0: (ty / n - this.my0) / this.k,
      size: 1 / n / this.k,
    };
  }
}

export function isJapan(lon, lat) {
  return lon > 122 && lon < 154 && lat > 20 && lat < 46;
}
