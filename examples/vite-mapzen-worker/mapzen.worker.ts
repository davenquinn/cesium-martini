import {
  rgbTerrainToGrid,
  createQuantizedMeshData,
} from "../../src/worker/worker-util";
import ndarray from "ndarray";
import Martini from "@mapbox/martini";

const ctx: Worker = self as any;

let martini = null;

const terrariumDecodeRgb = (r, g, b, a) => (r * 256) + g + (b / 256) - 32768;

function decodeTerrain(parameters) {
  const { imageData, tileSize = 256, errorLevel } = parameters;

  const pixels = ndarray(
    new Uint8Array(imageData),
    [tileSize, tileSize, 4],
    [4, 4 * tileSize, 1],
    0
  );

  // Tile size must be maintained through the life of the worker
  martini = martini ?? new Martini(tileSize + 1);

  const terrain = rgbTerrainToGrid(pixels, terrariumDecodeRgb);

  const tile = martini.createTile(terrain);

  // get a mesh (vertices and triangles indices) for a 10m error
  const mesh = tile.getMesh(errorLevel, parameters.maxLength);
  return createQuantizedMeshData(tile, mesh, tileSize, terrain);
}

ctx.addEventListener("message", (msg) => {
  const { id, payload } = msg.data;
  if (id == null) return;
  let objects = [];
  let res = null;
  try {
    res = decodeTerrain(payload);
    objects.push(res.indices.buffer);
    objects.push(res.quantizedVertices.buffer);
    ctx.postMessage({ id, payload: res }, objects);
  } catch (err) {
    ctx.postMessage({ id, err: err.toString() });
  } finally {
    res = null;
    objects = null;
  }
});

export default null as any;
