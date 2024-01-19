import ndarray from "ndarray";

// We should save these
//const canvas = new OffscreenCanvas(256, 256);
//const ctx = canvas.getContext("2d");

function mapboxTerrainToGrid(
  png: ndarray.NdArray<Uint8Array>,
  interval?: number,
  offset?: number
) {
  // maybe we should do this on the GPU using REGL?
  // but that would require GPU -> CPU -> GPU
  const gridSize = png.shape[0] + 1;
  const terrain = new Float32Array(gridSize * gridSize);
  const tileSize = png.shape[0];

  interval = interval ?? 0.1;
  offset = offset ?? -10000;

  // decode terrain values
  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      const yc = y;
      const r = png.get(x, yc, 0);
      const g = png.get(x, yc, 1);
      const b = png.get(x, yc, 2);
      terrain[y * gridSize + x] =
        r * 256 * 256 * interval + g * 256.0 * interval + b * interval + offset;
    }
  }
  // backfill right and bottom borders
  for (let x = 0; x < gridSize - 1; x++) {
    terrain[gridSize * (gridSize - 1) + x] =
      terrain[gridSize * (gridSize - 2) + x];
  }
  for (let y = 0; y < gridSize; y++) {
    terrain[gridSize * y + gridSize - 1] = terrain[gridSize * y + gridSize - 2];
  }
  return terrain;
}

export interface TileCoordinates {
  x: number;
  y: number;
  z: number;
}

export type Window = { x0: number; x1: number; y0: number; y1: number };

export function subsetByWindow(
  array: Float32Array,
  window: Window,
  augmented: boolean
) {
  const sz = Math.sqrt(array.length);
  const x0 = window.x0;
  const x1 = window.x1;
  const y0 = window.y0;
  const y1 = window.y1;
  const aug = augmented ? 1 : 0;
  const n = Math.floor(x1 - x0) + aug;
  const m = Math.floor(y1 - y0) + aug;
  const result = new Float32Array(n * m);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      result[i * n + j] = array[(i + y0) * sz + j + x0];
    }
  }
  return result;
}

type RGBAImage = {
  type: "image";
  /**
   * Terrain-RGB interval (default 0.1)
   */
  interval?: number;
  /**
   * Terrain-RGB offset (default -10000)
   */
  offset?: number;
  array: Uint8ClampedArray;
};

type Heightfield = {
  type: "heightfield";
  array: Float32Array;
  window?: Window;
};

type HeightData = RGBAImage | Heightfield;

export interface TerrainWorkerInput {
  heightData: HeightData;
  errorLevel: number;
  tileSize: number;
  ellipsoidRadius: number;
  maxVertexDistance: number | null;
  tileCoord: TileCoordinates;
}

export interface TerrainWorkerOutput {
  minimumHeight: number;
  maximumHeight: number;
  quantizedVertices: Uint16Array;
  indices: Uint16Array;
  westIndices: number[];
  southIndices: number[];
  eastIndices: number[];
  northIndices: number[];
  quantizedHeights?: Float32Array;
}

export function testMeshData(): TerrainWorkerOutput {
  return {
    minimumHeight: -100,
    maximumHeight: 2101,
    quantizedVertices: new Uint16Array([
      // order is SW NW SE NE
      // longitude
      0, 0, 32767, 32767,
      // latitude
      0, 32767, 0, 32767,
      // heights
      16384, 0, 32767, 16384,
    ]),
    indices: new Uint16Array([0, 3, 1, 0, 2, 3]),
    westIndices: [0, 1],
    southIndices: [0, 1],
    eastIndices: [2, 3],
    northIndices: [1, 3],
  };
}

function _emptyMesh(n: number): TerrainWorkerOutput {
  n = Math.max(n, 2);
  const nTriangles = Math.pow(n - 1, 2) * 2;
  const nVertices = Math.pow(n, 2);
  const quantizedVertices = new Uint16Array(nVertices * 3);
  const indices = new Uint16Array(nTriangles * 3);
  const westIndices = [];
  const southIndices = [];
  const eastIndices = [];
  const northIndices = [];

  let tix = 0;

  for (let i = 0; i < nVertices; i++) {
    let rx = i % n; //* 32767) / (n - 1);
    let ry = Math.floor(i / n); //* 32767) / (n - 1);
    const ix = n * rx + ry;
    quantizedVertices[ix] = (rx * 32768) / (n - 1);
    quantizedVertices[nVertices + ix] = (ry * 32768) / (n - 1);
    quantizedVertices[2 * nVertices + ix] = 0;
    if (ry == 0) westIndices.push(ix);
    if (rx == 0) southIndices.push(ix);
    if (rx == n - 1) eastIndices.push(ix);
    if (ry == n - 1) northIndices.push(ix);

    // Add triangles
    const rix = i - ry * n;
    if (rix != n - 1) {
      indices[tix * 3] = i;
      indices[tix * 3 + 1] = i + n + 1;
      indices[tix * 3 + 2] = i + 1;
      tix++;
    }
    if (rix != 0) {
      indices[tix * 3] = i - 1;
      indices[tix * 3 + 1] = i + n - 1;
      indices[tix * 3 + 2] = i + n;
      tix++;
    }
  }

  return {
    minimumHeight: 0,
    maximumHeight: 0,
    quantizedVertices,
    indices,
    westIndices,
    southIndices,
    eastIndices,
    northIndices,
  };
}

let _meshCache = [];
export function emptyMesh(n: number) {
  // A memoized function to return empty meshes
  if (n in _meshCache) {
    return _meshCache[n];
  } else {
    const result = _emptyMesh(n);
    _meshCache[n] = result;
    return result;
  }
}

function createQuantizedMeshData(
  tile: any,
  mesh: any,
  tileSize: number,
  terrain: Float32Array | null
): TerrainWorkerOutput {
  const xvals = [];
  const yvals = [];
  const heightMeters = [];
  const northIndices = [];
  const southIndices = [];
  const eastIndices = [];
  const westIndices = [];

  let minimumHeight = Infinity;
  let maximumHeight = -Infinity;
  const scalar = 32768.0 / tileSize;

  for (let ix = 0; ix < mesh.vertices.length / 2; ix++) {
    const vertexIx = ix;
    const px = mesh.vertices[ix * 2];
    const py = mesh.vertices[ix * 2 + 1];
    const height = tile.terrain[py * (tileSize + 1) + px];
    if (height > maximumHeight) maximumHeight = height;
    if (height < minimumHeight) minimumHeight = height;

    heightMeters.push(height);

    if (py == 0) northIndices.push(vertexIx);
    if (py == tileSize) southIndices.push(vertexIx);
    if (px == 0) westIndices.push(vertexIx);
    if (px == tileSize) eastIndices.push(vertexIx);

    let xv = px * scalar;
    let yv = (tileSize - py) * scalar;

    xvals.push(xv);
    yvals.push(yv);
  }

  const heightRange = maximumHeight - minimumHeight;

  const heights = heightMeters.map((d) => {
    if (heightRange < 1) return 0;
    return (d - minimumHeight) * (32768.0 / heightRange);
  });

  const triangles = new Uint16Array(mesh.triangles);
  const quantizedVertices = new Uint16Array(
    //verts
    [...xvals, ...yvals, ...heights]
  );

  // SE NW NE
  // NE NW SE

  return {
    minimumHeight,
    maximumHeight,
    quantizedVertices,
    indices: triangles,
    westIndices,
    southIndices,
    eastIndices,
    northIndices,
    quantizedHeights: terrain,
  };
}

export { mapboxTerrainToGrid, createQuantizedMeshData };
