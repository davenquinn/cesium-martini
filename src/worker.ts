import {
  mapboxTerrainToGrid,
  createQuantizedMeshData,
  QuantizedMeshOptions,
} from "./worker-util";
import ndarray from "ndarray";
import Martini from "../martini/index.js";
import "regenerator-runtime";
// https://github.com/CesiumGS/cesium/blob/1.76/Source/WorkersES6/createVerticesFromQuantizedTerrainMesh.js

export interface TerrainWorkerInput extends QuantizedMeshOptions {
  imageData: Uint8ClampedArray;
  maxLength: number | null;
  x: number;
  y: number;
  z: number;
}

let martini = null;

function decodeTerrain(
  parameters: TerrainWorkerInput,
  transferableObjects: any[]
) {
  const { imageData, tileSize = 256, errorLevel } = parameters;

  const pixels = ndarray(
    new Uint8Array(imageData),
    [tileSize, tileSize, 4],
    [4, 4 * tileSize, 1],
    0
  );

  // Tile size must be maintained through the life of the worker
  martini ??= new Martini(tileSize + 1);

  const terrain = mapboxTerrainToGrid(pixels);

  const tile = martini.createTile(terrain);

  // get a mesh (vertices and triangles indices) for a 10m error
  const mesh = tile.getMesh(errorLevel, parameters.maxLength);
  return createQuantizedMeshData(tile, mesh, tileSize);
}

export { decodeTerrain };

self.onmessage = function (msg) {
  const { id, payload } = msg.data;
  if (id == null) return;
  let objects = [];
  try {
    const res = decodeTerrain(payload);
    objects.push(res.indices.buffer);
    objects.push(res.quantizedVertices.buffer);
    self.postMessage({ id, payload: res }, objects);
  } catch (err) {
    self.postMessage({ id, err: err.toString() });
  } finally {
    objects = null;
  }
};
