// Shared constants for the main thread and the generation worker.
export const CHUNK = 16;
export const PAD = 1; // voxel border copied from neighbours so a chunk meshes on its own
export const PS = CHUNK + 2 * PAD;
export const MARGIN = 4; // column-raster margin: trees, walls and building ids look this far past the border
export const MAX_Y = 768;
export const SEA_Y = 48; // world y of 0 m elevation: this much stone lies under a street at sea level
export const MIN_EDIT_Y = 2; // bedrock layers below this are never touched
export const BEDROCK_TOP = 4; // bedrock is solid below MIN_EDIT_Y and ragged up to here
// Skyline beyond the voxel chunks: tiles of FAR_TILE metres built from FAR_CELL-metre columns.
export const FAR_TILE = 128;
export const FAR_CELL = 4;
export const FAR_RADIUS = 9; // tiles

// Open data endpoints (all CORS-enabled, no API key).
export const URLS = {
  // PLATEAU Tokyo 23 wards, roof surfaces (LOD2 where surveyed) with height attribute `z`
  plateauRoofs: 'https://indigo-lab.github.io/plateau-lod2-mvt/{z}/{x}/{y}.pbf',
  // PLATEAU Tokyo 23 wards, building footprints with 建物ID / measuredHeight
  plateauFootprints: 'https://indigo-lab.github.io/plateau-tokyo23ku-building-mvt-2020/{z}/{x}/{y}.pbf',
  // OpenStreetMap vector tiles (OpenMapTiles schema)
  osmTileJson: 'https://tiles.openfreemap.org/planet',
  // Geospatial Information Authority of Japan elevation tiles
  gsiDem5a: 'https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png',
  gsiDem10: 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png',
  // Worldwide fallback elevation (Mapzen Terrarium on AWS Open Data)
  terrarium: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
};

export const chunkKey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
