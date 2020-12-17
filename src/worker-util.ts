// We should save these
//const canvas = new OffscreenCanvas(256, 256);
//const ctx = canvas.getContext("2d");

function mapboxTerrainToGrid(png: ndarray<number>) {
  // maybe we should do this on the GPU using REGL?
  // but that would require GPU -> CPU -> GPU
  const gridSize = png.shape[0] + 1;
  const terrain = new Float32Array(gridSize * gridSize);
  const tileSize = png.shape[0];

  // decode terrain values
  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      const yc = y;
      const r = png.get(x, yc, 0);
      const g = png.get(x, yc, 1);
      const b = png.get(x, yc, 2);
      terrain[y * gridSize + x] =
        (r * 256 * 256 + g * 256.0 + b) / 10.0 - 10000.0;
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

export interface QuantizedMeshOptions {
  errorLevel: number;
  tileSize: number;
  ellipsoidRadius: number;
}

async function createQuantizedMeshData(tile, mesh, tileSize = 256) {
  const xvals = [];
  const yvals = [];
  const heightMeters = [];
  const northIndices = [];
  const southIndices = [];
  const eastIndices = [];
  const westIndices = [];

  for (let ix = 0; ix < mesh.vertices.length / 2; ix++) {
    const vertexIx = ix;
    const px = mesh.vertices[ix * 2];
    const py = mesh.vertices[ix * 2 + 1];
    heightMeters.push(tile.terrain[py * (tileSize + 1) + px]);

    if (py == 0) northIndices.push(vertexIx);
    if (py == tileSize) southIndices.push(vertexIx);
    if (px == 0) westIndices.push(vertexIx);
    if (px == tileSize) eastIndices.push(vertexIx);

    const scalar = 32768 / tileSize;
    let xv = px * scalar;
    let yv = (tileSize - py) * scalar;

    xvals.push(xv);
    yvals.push(yv);
  }

  const maxHeight = Math.max.apply(this, heightMeters);
  const minHeight = Math.min.apply(this, heightMeters);

  const heights = heightMeters.map((d) => {
    if (maxHeight - minHeight < 1) return 0;
    return (d - minHeight) * (32767 / (maxHeight - minHeight));
  });

  const triangles = new Uint16Array(mesh.triangles);
  const quantizedVertices = new Uint16Array(
    //verts
    [...xvals, ...yvals, ...heights]
  );

  // SE NW NE
  // NE NW SE

  return {
    minimumHeight: minHeight,
    maximumHeight: maxHeight,
    quantizedVertices,
    indices: triangles,
    westIndices,
    southIndices,
    eastIndices,
    northIndices,
  };
}

export { mapboxTerrainToGrid, createQuantizedMeshData };
