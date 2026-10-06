// Scan conversion of map geometry onto a square cell grid.
// Grid: { ox, oz, n, s } - n x n cells of size s; cell (i, j) is centred at (ox + (i + .5) s, oz + (j + .5) s).
// Rings are flat [x0, z0, x1, z1, ...] arrays, implicitly closed.

let xs = new Float64Array(1024);

// Even-odd fill over all rings (handles holes and multipolygons). cb(cellIndex)
export function fillPolygon(rings, bbox, g, cb) {
  const { ox, oz, n, s } = g;
  const j0 = Math.max(0, Math.ceil((bbox[1] - oz) / s - 0.5));
  const j1 = Math.min(n - 1, Math.floor((bbox[3] - oz) / s - 0.5));
  for (let j = j0; j <= j1; j++) {
    const zc = oz + (j + 0.5) * s;
    let cnt = 0;
    for (let ri = 0; ri < rings.length; ri++) {
      const ring = rings[ri];
      const len = ring.length;
      let px = ring[len - 2], pz = ring[len - 1];
      for (let k = 0; k < len; k += 2) {
        const qx = ring[k], qz = ring[k + 1];
        if (pz <= zc !== qz <= zc) {
          if (cnt === xs.length) {
            const grown = new Float64Array(cnt * 2);
            grown.set(xs);
            xs = grown;
          }
          xs[cnt++] = px + ((zc - pz) / (qz - pz)) * (qx - px);
        }
        px = qx;
        pz = qz;
      }
    }
    if (cnt < 2) continue;
    for (let a = 1; a < cnt; a++) {
      const v = xs[a];
      let b = a - 1;
      while (b >= 0 && xs[b] > v) {
        xs[b + 1] = xs[b];
        b--;
      }
      xs[b + 1] = v;
    }
    for (let a = 0; a + 1 < cnt; a += 2) {
      const i0 = Math.max(0, Math.ceil((xs[a] - ox) / s - 0.5));
      const i1 = Math.min(n - 1, Math.ceil((xs[a + 1] - ox) / s - 0.5) - 1);
      for (let i = i0; i <= i1; i++) cb(j * n + i);
    }
  }
}

// Thick line segment. cb(cellIndex, distanceToAxis, distanceAlongFromA)
export function strokeSegment(ax, az, bx, bz, r, g, cb) {
  const { ox, oz, n, s } = g;
  const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - ox) / s));
  const i1 = Math.min(n - 1, Math.floor((Math.max(ax, bx) + r - ox) / s));
  const j0 = Math.max(0, Math.floor((Math.min(az, bz) - r - oz) / s));
  const j1 = Math.min(n - 1, Math.floor((Math.max(az, bz) + r - oz) / s));
  if (i0 > i1 || j0 > j1) return;
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const len = Math.sqrt(l2);
  const r2 = r * r;
  for (let j = j0; j <= j1; j++) {
    const cz = oz + (j + 0.5) * s;
    for (let i = i0; i <= i1; i++) {
      const cx = ox + (i + 0.5) * s;
      let t = l2 > 0 ? ((cx - ax) * dx + (cz - az) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + t * dx - cx, ez = az + t * dz - cz;
      const d2 = ex * ex + ez * ez;
      if (d2 <= r2) cb(j * n + i, Math.sqrt(d2), t * len);
    }
  }
}

export function pointInRings(rings, x, z) {
  let inside = false;
  for (const ring of rings) {
    const len = ring.length;
    let px = ring[len - 2], pz = ring[len - 1];
    for (let k = 0; k < len; k += 2) {
      const qx = ring[k], qz = ring[k + 1];
      if (pz <= z !== qz <= z && x < px + ((z - pz) / (qz - pz)) * (qx - px)) inside = !inside;
      px = qx;
      pz = qz;
    }
  }
  return inside;
}

export function ringsBBox(rings) {
  let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
  for (const ring of rings) {
    for (let k = 0; k < ring.length; k += 2) {
      const x = ring[k], z = ring[k + 1];
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (z < minz) minz = z;
      if (z > maxz) maxz = z;
    }
  }
  return [minx, minz, maxx, maxz];
}

export function ringsArea(rings) {
  let a = 0;
  for (const ring of rings) {
    const len = ring.length;
    let px = ring[len - 2], pz = ring[len - 1];
    for (let k = 0; k < len; k += 2) {
      a += px * ring[k + 1] - ring[k] * pz;
      px = ring[k];
      pz = ring[k + 1];
    }
  }
  return Math.abs(a) / 2;
}
