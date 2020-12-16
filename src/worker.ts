import createTaskProcessorWorker from "./createTaskProcessorWorker.js";
import { getPixels, mapboxTerrainToGrid } from "./util";
import Martini from "@mapbox/martini";
// https://github.com/CesiumGS/cesium/blob/1.76/Source/WorkersES6/createVerticesFromQuantizedTerrainMesh.js

interface TerrainWorkerInput {
  imageData: ImageBitmap;
  tileSize: number;
  errorLevel: number;
}

function decodeTerrain(parameters: TerrainWorkerInput, transferableObjects) {
  const { imageData, tileSize = 256, errorLevel } = parameters;
  const martini = new Martini(tileSize + 1);

  const pixels = getPixels(imageData);
  const terrain = mapboxTerrainToGrid(pixels);

  const tile = martini.createTile(terrain);

  // get a mesh (vertices and triangles indices) for a 10m error
  console.log(`Error level: ${errorLevel}`);
  const mesh = tile.getMesh(errorLevel);
}

export default createTaskProcessorWorker(decodeTerrain);
