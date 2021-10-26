// We should save these
//const canvas = new OffscreenCanvas(256, 256);
//const ctx = canvas.getContext("2d");

function mapboxTerrainToGrid(png: ndarray<number>, interval?: number, offset?: number) {
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
        (r * 256 * 256) * interval + (g * 256.0) * interval + b * interval + offset;
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

function testMeshData() {
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

export interface QuantizedMeshOptions {
  errorLevel: number;
  tileSize: number;
  ellipsoidRadius: number;
}

function createQuantizedMeshData(tile, mesh, tileSize) {
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
    return (d - minimumHeight) * (32767.0 / heightRange);
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
  };
}

export { mapboxTerrainToGrid, createQuantizedMeshData };
