import {
  Cartographic,
  Rectangle,
  Ellipsoid,
  Math as CMath,
  Cartesian3,
  BoundingSphere,
  WebMercatorTilingScheme,
  // @ts-ignore
  OrientedBoundingBox,
} from "cesium";
const ndarray = require("ndarray");
// We should save these
const canvas = new OffscreenCanvas(256, 256);
const ctx = canvas.getContext("2d");

const tilingScheme = new WebMercatorTilingScheme();

function getPixels(img: ImageBitmap) {
  // Get image pixels
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0, img.width, img.height);
  const pixels = ctx.getImageData(0, 0, img.width, img.height);
  ctx.clearRect(0, 0, img.width, img.height);
  return ndarray(
    new Uint8Array(pixels.data),
    [img.width, img.height, 4],
    [4, 4 * img.width, 1],
    0
  );
}

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

interface QuantizedMeshOptions {
  errorLevel: number;
  tileSize: number;
  tileRect: any;
}

async function createQuantizedMeshData(
  x,
  y,
  z,
  tile,
  mesh,
  opts: QuantizedMeshOptions
) {
  const { errorLevel: err, tileSize } = opts;
  const skirtHeight = err * 5;

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
    heightMeters.push(tile.terrain[py * (this.tileSize + 1) + px]);

    if (py == 0) northIndices.push(vertexIx);
    if (py == this.tileSize) southIndices.push(vertexIx);
    if (px == 0) westIndices.push(vertexIx);
    if (px == this.tileSize) eastIndices.push(vertexIx);

    const scalar = 32768 / this.tileSize;
    let xv = px * scalar;
    let yv = (this.tileSize - py) * scalar;

    xvals.push(xv);
    yvals.push(yv);
  }

  const maxHeight = Math.max.apply(this, heightMeters);
  const minHeight = Math.min.apply(this, heightMeters);

  const heights = heightMeters.map((d) => {
    if (maxHeight - minHeight < 1) return 0;
    return (d - minHeight) * (32767 / (maxHeight - minHeight));
  });

  const tileRect = this.tilingScheme.tileXYToRectangle(x, y, z);
  const tileCenter = Cartographic.toCartesian(Rectangle.center(tileRect));
  // Need to get maximum distance at zoom level
  // tileRect.width is given in radians
  // cos of half-tile-width allows us to use right-triangle relationship
  const cosWidth = Math.cos(tileRect.width / 2); // half tile width since our ref point is at the center
  // scale max height to max ellipsoid radius
  // ... it might be better to use the radius of the entire
  const ellipsoidHeight = maxHeight / this.ellipsoid.maximumRadius;
  // cosine relationship to scale height in ellipsoid-relative coordinates
  const occlusionHeight = (1 + ellipsoidHeight) / cosWidth;

  const scaledCenter = Ellipsoid.WGS84.transformPositionToScaledSpace(
    tileCenter
  );
  const horizonOcclusionPoint = new Cartesian3(
    scaledCenter.x,
    scaledCenter.y,
    occlusionHeight
  );

  let orientedBoundingBox = null;
  let boundingSphere: BoundingSphere;
  if (tileRect.width < CMath.PI_OVER_TWO + CMath.EPSILON5) {
    // @ts-ignore
    orientedBoundingBox = OrientedBoundingBox.fromRectangle(
      tileRect,
      minHeight,
      maxHeight
    );
    // @ts-ignore
    boundingSphere = BoundingSphere.fromOrientedBoundingBox(
      orientedBoundingBox
    );
  } else {
    // If our bounding rectangle spans >= 90º, we should use the entire globe as a bounding sphere.
    boundingSphere = new BoundingSphere(
      Cartesian3.ZERO,
      // radius (seems to be max height of Earth terrain?)
      6379792.481506292
    );
  }

  const triangles = new Uint16Array(mesh.triangles);

  // @ts-ignore

  // If our tile has greater than ~1º size
  if (tileRect.width > 0.04 && triangles.length < 500) {
    // We need to be able to specify a minimum number of triangles...
    return this.emptyHeightmap(64);
  }

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
    // @ts-ignore
    boundingSphere,
    // @ts-ignore
    orientedBoundingBox,
    // @ts-ignore
    horizonOcclusionPoint,
    westIndices,
    southIndices,
    eastIndices,
    northIndices,
    westSkirtHeight: skirtHeight,
    southSkirtHeight: skirtHeight,
    eastSkirtHeight: skirtHeight,
    northSkirtHeight: skirtHeight,
    childTileMask: 15,
  };
}

export { getPixels, mapboxTerrainToGrid, createQuantizedMeshData };
