/** Worker to upsample terrain meshes */
import { createQuantizedMeshData, TerrainUpscaleInput } from "./worker-util";
import Martini from "@mapbox/martini";
// https://github.com/CesiumGS/cesium/blob/1.76/Source/WorkersES6/createVerticesFromQuantizedTerrainMesh.js

let martiniCache: Record<number, Martini> = {};

function decodeTerrain(
  parameters: TerrainUpscaleInput,
  transferableObjects?: Transferable[],
) {
  const {
    heightData,
    tileSize = 256,
    errorLevel,
    maxVertexDistance,
  } = parameters;

  // Height data can be either an array of numbers (for pre-existing terrain data)
  // or an image data array (for decoding from an image)

  let terrain: Float32Array = heightData;

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
    canUpscaleTile ? terrain : null,
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
