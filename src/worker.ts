import createTaskProcessorWorker from "cesium/Source/WorkersES6/createTaskProcessorWorker.js";
import {
  mapboxTerrainToGrid,
  createQuantizedMeshData,
  QuantizedMeshOptions,
} from "./worker-util";
import ndarray from "ndarray";
import Martini from "@mapbox/martini";
// https://github.com/CesiumGS/cesium/blob/1.76/Source/WorkersES6/createVerticesFromQuantizedTerrainMesh.js

export interface TerrainWorkerInput extends QuantizedMeshOptions {
  imageData: Uint8Array;
  x: number;
  y: number;
  z: number;
}

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

  try {
    const martini = new Martini(tileSize + 1);

    const terrain = mapboxTerrainToGrid(pixels);

    const tile = martini.createTile(terrain);

    // get a mesh (vertices and triangles indices) for a 10m error
    console.log(`Error level: ${errorLevel}`);
    const mesh = tile.getMesh(errorLevel);
    console.log(mesh);

    return createQuantizedMeshData(tile, mesh, tileSize);
  } catch {
    return null;
  }
}

export { decodeTerrain };

export default createTaskProcessorWorker(decodeTerrain);
