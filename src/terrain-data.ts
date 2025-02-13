import {
  QuantizedMeshTerrainData,
  Rectangle,
  Ellipsoid,
  Cartographic,
  BoundingSphere,
  OrientedBoundingBox,
  Cartesian3,
  Credit,
  TilingScheme,
} from "cesium";
import {
  TerrainWorkerOutput,
  emptyMesh,
  subsetByWindow,
  TerrainUpscaleInput,
  QuantizedMeshResult,
} from "./worker/worker-util";

export interface TileCoordinates {
  x: number;
  y: number;
  z: number;
}

interface QuantizedMeshTerrainOptions {
  quantizedVertices: Uint16Array;
  indices: Uint16Array | Uint32Array;
  minimumHeight: number;
  maximumHeight: number;
  boundingSphere: BoundingSphere;
  orientedBoundingBox?: OrientedBoundingBox;
  horizonOcclusionPoint: Cartesian3;
  westIndices: number[];
  southIndices: number[];
  eastIndices: number[];
  northIndices: number[];
  westSkirtHeight: number;
  southSkirtHeight: number;
  eastSkirtHeight: number;
  northSkirtHeight: number;
  childTileMask?: number;
  createdByUpsampling?: boolean;
  encodedNormals?: Uint8Array;
  waterMask?: Uint8Array;
  credits?: Credit[];
}

export interface TerrainMeshMeta {
  errorLevel: number;
  tileSize: number;
  maxVertexDistance: number | null;
  tileRect: Rectangle;
  ellipsoid: Ellipsoid;
  overscaleFactor: number;
}

export function createTerrainMesh(
  data: TerrainWorkerOutput,
  meta: TerrainMeshMeta,
) {
  const {
    minimumHeight,
    maximumHeight,
    quantizedVertices,
    indices,
    westIndices,
    southIndices,
    eastIndices,
    northIndices,
    quantizedHeights,
  } = data;

  const {
    errorLevel,
    tileSize,
    maxVertexDistance,
    tileRect,
    ellipsoid,
    overscaleFactor,
  } = meta;

  const err = errorLevel;
  const skirtHeight = err * 20;

  // Check if tileRect is not NaNs
  if (isNaN(tileRect.east) || isNaN(tileRect.north)) {
    throw new Error("Invalid tile rect");
  }

  const center = Rectangle.center(tileRect);

  // Calculating occlusion height is kind of messy currently, but it definitely works
  const halfAngle = tileRect.width / 2;
  const dr = Math.cos(halfAngle); // half tile width since our ref point is at the center

  let occlusionHeight = dr * ellipsoid.maximumRadius + maximumHeight;
  if (halfAngle > Math.PI / 4) {
    occlusionHeight = (1 + halfAngle) * ellipsoid.maximumRadius;
  }

  const occlusionPoint = new Cartographic(
    center.longitude,
    center.latitude,
    occlusionHeight,
    // Scaling factor of two just to be sure.
  );

  const horizonOcclusionPoint = ellipsoid.transformPositionToScaledSpace(
    Cartographic.toCartesian(occlusionPoint),
  );

  let orientedBoundingBox = OrientedBoundingBox.fromRectangle(
    tileRect,
    minimumHeight,
    maximumHeight,
    ellipsoid,
  );
  let boundingSphere =
    BoundingSphere.fromOrientedBoundingBox(orientedBoundingBox);

  return new RasterTerrainData({
    minimumHeight,
    maximumHeight,
    quantizedVertices,
    indices,
    boundingSphere,
    orientedBoundingBox,
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
    createdByUpsampling: overscaleFactor > 0,
    errorLevel: err,
    maxVertexDistance,
    tileSize,
    quantizedHeights,
  });
}

interface EmptyMeshOptions {
  tileRect: Rectangle;
  tileCoord: TileCoordinates;
  ellipsoid: Ellipsoid;
  errorLevel: number;
  tileSize: number;
  maxVertexDistance?: number;
}

export function createEmptyMesh(
  opts: EmptyMeshOptions,
): QuantizedMeshTerrainData {
  const { tileRect, tileCoord, errorLevel, ellipsoid, maxVertexDistance } =
    opts;
  const center = Rectangle.center(tileRect);
  const { z } = tileCoord;

  const latScalar = Math.min(Math.abs(Math.sin(center.latitude)), 0.995);
  let v = Math.max(
    Math.ceil((200 / (z + 1)) * Math.pow(1 - latScalar, 0.25)),
    4,
  );
  const output = emptyMesh(v);
  // We use zero for some undefined values
  return createTerrainMesh(output, {
    tileRect,
    ellipsoid,
    errorLevel,
    overscaleFactor: 0,
    maxVertexDistance,
    tileSize: output.tileSize,
  });
}

interface RasterParams {
  quantizedHeights?: Float32Array;
  errorLevel: number;
  maxVertexDistance: number;
  tileSize: number;
}

type RasterTerrainOptions = QuantizedMeshTerrainOptions & RasterParams;

class UpsampleTracker {
  ne: boolean;
  nw: boolean;
  se: boolean;
  sw: boolean;

  constructor() {
    this.ne = false;
    this.nw = false;
    this.se = false;
    this.sw = false;
  }

  finished() {
    return this.ne && this.nw && this.se && this.sw;
  }
}

export class RasterTerrainData
  extends QuantizedMeshTerrainData
  implements RasterParams
{
  quantizedHeights: Float32Array;
  errorLevel: number;
  maxVertexDistance: number;
  tileSize: number;
  private upsampleTracker: UpsampleTracker;

  constructor(opts: RasterTerrainOptions) {
    super(opts);
    this.quantizedHeights = opts.quantizedHeights;
    this.errorLevel = opts.errorLevel;
    this.maxVertexDistance = opts.maxVertexDistance ?? opts.tileSize;
    this.tileSize = opts.tileSize;
    this.upsampleTracker = new UpsampleTracker();
  }

  upsample(
    tilingScheme: TilingScheme,
    thisX: number,
    thisY: number,
    thisLevel: number,
    descendantX: number,
    descendantY: number,
    descendantLevel: number,
  ) {
    if (this.quantizedHeights == null) {
      return super.upsample(
        tilingScheme,
        thisX,
        thisY,
        thisLevel,
        descendantX,
        descendantY,
        descendantLevel,
      );
    } // Something wonky about our tiling scheme, perhaps
    // 12/2215/2293 @2x
    //const url = `https://a.tiles.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}${hires}.${this.format}?access_token=${this.accessToken}`;

    const x = descendantX;
    const y = descendantY;
    const z = descendantLevel;

    const tile = `${z}/${x}/${y}`;

    //console.log(`Upsampling terrain data from zoom ${thisLevel} to ` + tile);

    const dz = z - thisLevel;

    const scalar = Math.pow(2, dz);

    const ellipsoid = tilingScheme.ellipsoid;

    const err = this.errorLevel / scalar;

    const maxVertexDistance = Math.min(
      this.maxVertexDistance * scalar,
      this.tileSize,
    );

    const upscaledX = thisX * scalar;
    const upscaledY = thisY * scalar;

    const dx: number = x - upscaledX;
    const dy: number = y - upscaledY;

    const x0 = (dx * this.tileSize) / scalar;
    const x1 = ((dx + 1) * this.tileSize) / scalar;
    const y0 = (dy * this.tileSize) / scalar;
    const y1 = ((dy + 1) * this.tileSize) / scalar;

    const window = { x0, x1, y0, y1 };

    const res = buildOverscaledTerrainTile({
      tilingScheme,
      heightData: subsetByWindow(this.quantizedHeights, window, true),
      maxVertexDistance,
      x,
      y,
      z,
      errorLevel: err,
      ellipsoidRadius: ellipsoid.maximumRadius,
      tileSize: x1 - x0,
      overscaleFactor: dz,
    });
    if (dz == 1) {
      // If we've got a single child tile, we can track that we've upsampled the parent.
      const quadrant = getQuadrant(dx as 0 | 1, dy as 0 | 1);
      this.upsampleTracker[quadrant] = true;
    }
    if (this.upsampleTracker.finished()) {
      // We've upsampled all child tiles and don't need to keep terrain data around anymore.
      this.quantizedHeights = undefined;
    }

    return res;
  }
}

function getQuadrant(dx: 0 | 1, dy: 0 | 1): "ne" | "nw" | "se" | "sw" {
  if (dx == 0 && dy == 0) return "sw";
  if (dx == 0 && dy == 1) return "nw";
  if (dx == 1 && dy == 0) return "se";
  if (dx == 1 && dy == 1) return "ne";
  throw new Error("Invalid quadrant");
}

type OverscaleTerrainOptions = TerrainUpscaleInput & {
  tilingScheme: TilingScheme;
};

async function buildOverscaledTerrainTile(opts: OverscaleTerrainOptions) {
  const { tilingScheme, overscaleFactor, ...workerOpts } = opts;

  const { x, y, z } = workerOpts;

  const tileRect = tilingScheme.tileXYToRectangle(x, y, z);
  const ellipsoid = tilingScheme.ellipsoid;

  const { errorLevel, maxVertexDistance, tileSize } = workerOpts;

  try {
    const res = (await upsamplerFarm.scheduleTask(workerOpts, [
      workerOpts.heightData.buffer,
    ])) as QuantizedMeshResult;

    return createTerrainMesh(res, {
      tileRect,
      ellipsoid,
      errorLevel,
      overscaleFactor,
      tileSize,
      // Maximum vertex distance
      maxVertexDistance,
    });
  } catch (err) {
    return createEmptyMesh({
      tileRect,
      errorLevel,
      ellipsoid,
      tileCoord: { x, y, z },
      tileSize: 0,
    });
  }
}

import UpsamplerWorker from "web-worker:./worker/upsampler-worker";
import WorkerFarm from "./worker/worker-farm";

const upsamplerFarm = new WorkerFarm({
  worker: new UpsamplerWorker(),
  maxWorkers: 5,
});
