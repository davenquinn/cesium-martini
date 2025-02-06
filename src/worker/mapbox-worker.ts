import {
  rgbTerrainToGrid,
  createQuantizedMeshData,
  TerrainWorkerInput,
} from "./worker-util";
import ndarray from "ndarray";
import Martini from "@mapbox/martini";
// https://github.com/CesiumGS/cesium/blob/1.76/Source/WorkersES6/createVerticesFromQuantizedTerrainMesh.js

let martiniCache = {};

function decodeTerrain(
  parameters: TerrainWorkerInput,
  transferableObjects?: Transferable[]
) {
  const {
    imageData,
    tileSize = 256,
    errorLevel,
    maxVertexDistance,
  } = parameters;

  // Height data can be either an array of numbers (for pre-existing terrain data)
  // or an image data array (for decoding from an image)

  const heightData = {
    type: "image",
    array: imageData,
  }

  let terrain: Float32Array;
  if (heightData.type === "image") {
    const { array, interval, offset } = heightData;
    const pixels = ndarray(
      new Uint8Array(array),
      [tileSize, tileSize, 4],
      [4, 4 * tileSize, 1],
      0
    );
    terrain = rgbTerrainToGrid(pixels, interval, offset);
  } else {
    terrain = heightData.array;
  }

  // Tile size must be maintained through the life of the worker
  martiniCache[tileSize] ??= new Martini(tileSize + 1);

  const tile = martiniCache[tileSize].createTile(terrain);

  const canUpscaleTile = true; //heightData.type === "image";

  // get a mesh (vertices and triangles indices) for a 10m error
  const mesh = tile.getMesh(errorLevel, Math.min(maxVertexDistance, tileSize));
  const res = createQuantizedMeshData(
    tile,
    mesh,
    tileSize,
    // Only include vertex data if anticipate upscaling tile
    canUpscaleTile ? terrain : null
  );
  transferableObjects.push(res.indices.buffer);
  transferableObjects.push(res.quantizedVertices.buffer);
  if (res.quantizedHeights) {
    transferableObjects.push(res.quantizedHeights.buffer);
  }
  return res;
}

self.onmessage = function (msg) {
  const { id, payload } = msg.data;
  if (id == null) return;
  let objects: Transferable[] = [];
  let res = null;
  try {
    res = decodeTerrain(payload, objects);
    self.postMessage({ id, payload: res }, objects);
  } catch (err) {
    const msg = err.message ?? err;
    self.postMessage({ id, err: msg.toString() });
  } finally {
    res = null;
    objects = null;
  }
};
