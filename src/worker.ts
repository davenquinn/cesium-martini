
// https://github.com/CesiumGS/cesium/blob/1.76/Source/WorkersES6/createVerticesFromQuantizedTerrainMesh.js

import { decodeTerrain } from "./worker-util";

let martini = null;

self.onmessage = function (msg) {
  const { id, payload } = msg.data;
  if (id == null) return;
  let objects = [];
  let res = null;
  try {
    res = decodeTerrain(payload, martini);
    objects.push(res.indices.buffer);
    objects.push(res.quantizedVertices.buffer);
    self.postMessage({ id, payload: res }, objects);
  } catch (err) {
    self.postMessage({ id, err: err.toString() });
  } finally {
    res = null;
    objects = null;
  }
};
