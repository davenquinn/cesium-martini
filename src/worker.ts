import createTaskProcessorWorker from "cesium/Source/WorkersES6/createTaskProcessorWorker.js";
import {
  getPixels,
  mapboxTerrainToGrid,
  createQuantizedMeshData,
  QuantizedMeshOptions,
} from "./util";
import Martini from "@mapbox/martini";
// https://github.com/CesiumGS/cesium/blob/1.76/Source/WorkersES6/createVerticesFromQuantizedTerrainMesh.js

export interface TerrainWorkerInput extends QuantizedMeshOptions {
  imageData: ImageBitmap;
  x: number;
  y: number;
  z: number;
}

function decodeTerrain(
  parameters: TerrainWorkerInput,
  transferableObjects: any[]
) {
  const {
    imageData,
    tileSize = 256,
    errorLevel,
    x,
    y,
    z,
    ellipsoidRadius,
  } = parameters;
  const martini = new Martini(tileSize + 1);

  const pixels = getPixels(imageData);
  const terrain = mapboxTerrainToGrid(pixels);

  const tile = martini.createTile(terrain);

  // get a mesh (vertices and triangles indices) for a 10m error
  console.log(`Error level: ${errorLevel}`);
  const mesh = tile.getMesh(errorLevel);

  return { tile, mesh };
}

export default createTaskProcessorWorker(decodeTerrain);
