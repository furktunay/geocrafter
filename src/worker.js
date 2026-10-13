// Generation worker: owns all map data, builds chunk voxels and their meshes.
import { Projection, isJapan } from './geo.js';
import { Terrain, PlateauSource, OsmSource, stats } from './tiles.js';
import { Generator } from './generator.js';
import { meshChunk } from './mesher.js';
import { Aligner } from './align.js';
import { LidarTerrain, BagSource, inNetherlands } from './lidar.js';

let gen = null;
let plateau = null;
let osm = null;
let terrain = null;
let aligner = null;
let bag = null;

function meshTransfers(m) {
  return [m.pos.buffer, m.dat.buffer, m.idx.buffer];
}

async function init({ lon, lat, turn, photo }) {
  const proj = new Projection(lon, lat, turn || 0);
  const japan = isJapan(lon, lat);
  // the Netherlands has a laser-scanned surface; elsewhere elevation tiles and building outlines
  const lidar = inNetherlands(lon, lat);
  terrain = lidar ? new LidarTerrain(proj) : new Terrain(proj, japan);
  plateau = new PlateauSource(proj, terrain);
  plateau.enabled = japan;
  osm = new OsmSource(proj, terrain, (places) => postMessage({ type: 'places', places }));
  await Promise.all([osm.init(), terrain.ensureBox(-8, -8, 8, 8)]);
  // Mountain towns: shift the world down so the spawn sits at a sane height.
  const e0 = terrain.elevAt(0, 0);
  if (lidar) terrain.pickPhase();
  else terrain.offset = e0 > 150 ? Math.round(e0) - 60 : 0;
  bag = lidar ? new BagSource(terrain) : null;
  gen = new Generator(proj, terrain, plateau, osm, japan, { photo, bag });
  aligner = new Aligner(terrain);
  postMessage({ type: 'ready', japan, lidar, elevation: e0 });
}

// Cumulative timings for the debug overlay.
const perf = { chunks: 0, genMs: 0, meshMs: 0, far: 0, farMs: 0 };

async function generate({ cx, cz }) {
  await gen.ensure(cx, cz);
  const t0 = performance.now();
  const { data, H, map, tops, corners } = gen.generate(cx, cz);
  aligner.addChunk(cx, cz, tops);
  const t1 = performance.now();
  const [opaque, trans] = meshChunk(data, H, null, corners);
  perf.chunks++;
  perf.genMs += t1 - t0;
  perf.meshMs += performance.now() - t1;
  postMessage(
    { type: 'chunk', cx, cz, H, data, map, corners, opaque, trans, loading: stats.loading, perf: { ...perf, tileMs: stats.decodeMs } },
    [data.buffer, map.buffer, ...(corners ? [corners.buffer] : []), ...meshTransfers(opaque), ...meshTransfers(trans)],
  );
}

async function generateFar({ lx, lz }) {
  await gen.ensureFar(lx, lz);
  const t0 = performance.now();
  const { mesh, heights } = gen.generateFar(lx, lz);
  aligner.addFar(lx, lz, heights);
  perf.far++;
  perf.farMs += performance.now() - t0;
  postMessage({ type: 'far', lx, lz, mesh, loading: stats.loading }, meshTransfers(mesh));
}

// World height of the ground surface under a list of [x, z] points.
async function ground({ id, pts }) {
  const ys = new Float32Array(pts.length / 2);
  for (let i = 0; i < ys.length; i++) await terrain.ensureBox(pts[i * 2] - 2, pts[i * 2 + 1] - 2, pts[i * 2] + 2, pts[i * 2 + 1] + 2);
  for (let i = 0; i < ys.length; i++) ys[i] = terrain.trueY(terrain.elevAt(pts[i * 2], pts[i * 2 + 1]));
  postMessage({ type: 'ground', id, ys });
}

// Find where a panorama was really taken and which way it faces.
async function align(m) {
  await terrain.ensureBox(m.x - 20, m.z - 20, m.x + 20, m.z + 20);
  const t0 = performance.now();
  const result = aligner.solve(m);
  result.ms = performance.now() - t0;
  postMessage({ type: 'aligned', id: m.id, result });
}

function query({ id, x, z }) {
  const info = (bag && bag.query(x + 0.5, z + 0.5)) || plateau.query(x + 0.5, z + 0.5) || osm.query(x + 0.5, z + 0.5);
  postMessage({ type: 'info', id, info: info && { id: info.id, height: info.height, source: info.attrs.source, year: info.attrs.year } });
}

onmessage = (ev) => {
  const m = ev.data;
  const job = m.type === 'init' ? init(m) : m.type === 'gen' ? generate(m) : m.type === 'far' ? generateFar(m) : m.type === 'ground' ? ground(m) : m.type === 'align' ? align(m) : m.type === 'query' ? query(m) : null;
  if (job) job.catch((e) => postMessage({ type: 'error', message: String(e && e.stack ? e.stack : e), cx: m.cx, cz: m.cz, lx: m.lx, lz: m.lz }));
};
