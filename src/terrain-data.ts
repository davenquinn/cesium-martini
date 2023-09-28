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
import { getWorkerFarm } from "./worker-farm";
import { decodeTerrain } from "./worker";
import {
  TerrainWorkerInput,
  TerrainWorkerOutput,
  emptyMesh,
  Window,
  TileCoordinates,
  subsetByWindow,
} from "./worker-util";

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

export function createTerrainData(
  tileRect: Rectangle,
  ellipsoid: Ellipsoid,
  errorLevel: number,
  overscaleFactor: number,
  workerOutput: TerrainWorkerOutput,
  tileSize: number,
  maxVertexDistance: number | null
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
  } = workerOutput;

  const err = errorLevel;
  const skirtHeight = err * 20;

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
    occlusionHeight
    // Scaling factor of two just to be sure.
  );

  const horizonOcclusionPoint = ellipsoid.transformPositionToScaledSpace(
    Cartographic.toCartesian(occlusionPoint)
  );

  let orientedBoundingBox = OrientedBoundingBox.fromRectangle(
    tileRect,
    minimumHeight,
    maximumHeight,
    ellipsoid
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
    createdByUpsampling: false, //overscaleFactor > 0,
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
}

export function createEmptyMesh(
  opts: EmptyMeshOptions
): QuantizedMeshTerrainData {
  const { tileRect, tileCoord, errorLevel, ellipsoid } = opts;
  const center = Rectangle.center(tileRect);
  const { z } = tileCoord;

  const latScalar = Math.min(Math.abs(Math.sin(center.latitude)), 0.995);
  let v = Math.max(
    Math.ceil((200 / (z + 1)) * Math.pow(1 - latScalar, 0.25)),
    4
  );
  const output = emptyMesh(v);
  // We use zero for some undefined values
  return createTerrainData(tileRect, ellipsoid, errorLevel, 0, output, 0, 0);
}

interface TerrainBuilderOpts extends TerrainWorkerInput {
  tilingScheme: TilingScheme;
  overscaleFactor: number;
}

export async function buildTerrainTile(opts: TerrainBuilderOpts) {
  const { tilingScheme, overscaleFactor, ...workerOpts } = opts;

  const { x, y, z } = workerOpts.tileCoord;
  const tileRect = tilingScheme.tileXYToRectangle(x, y, z);
  const ellipsoid = tilingScheme.ellipsoid;

  const { errorLevel, tileCoord, maxVertexDistance, tileSize } = workerOpts;
  const workerFarm = getWorkerFarm();

  try {
    let res;
    if (workerFarm != null) {
      res = await workerFarm.scheduleTask(workerOpts, [
        workerOpts.heightData.array.buffer,
      ]);
    } else {
      res = decodeTerrain(workerOpts, []);
    }

    // if (true) {
    //   res.quantizedHeights = undefined;
    // }

    const res1 = createTerrainData(
      tileRect,
      ellipsoid,
      errorLevel,
      overscaleFactor,
      res,
      tileSize,
      maxVertexDistance
    );
    return res1;
  } catch (err) {
    console.log(err);
    return createEmptyMesh({
      tileRect,
      errorLevel,
      ellipsoid,
      tileCoord,
      tileSize: 0,
    });
  }
}

interface RasterParams {
  quantizedHeights?: Float32Array;
  errorLevel: number;
  maxVertexDistance: number;
  tileSize: number;
}

type RasterTerrainOptions = QuantizedMeshTerrainOptions & RasterParams;

export class RasterTerrainData
  extends QuantizedMeshTerrainData
  implements RasterParams
{
  workerInput: TerrainWorkerInput | undefined;
  levelOverviews: RasterTerrainData[] = [];
  quantizedHeights: Float32Array;
  errorLevel: number;
  maxVertexDistance: number;
  tileSize: number;
  private upsampleCount: number = 0;
  constructor(opts: RasterTerrainOptions) {
    super(opts);
    this.quantizedHeights = opts.quantizedHeights;
    this.errorLevel = opts.errorLevel;
    this.maxVertexDistance = opts.maxVertexDistance ?? opts.tileSize;
    this.tileSize = opts.tileSize;
  }

  _upsample(tilingScheme, thisX, thisY, thisLevel, x, y, z) {
    // Something wonky about our tiling scheme, perhaps
    // 12/2215/2293 @2x
    //const url = `https://a.tiles.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}${hires}.${this.format}?access_token=${this.accessToken}`;

    console.log("Upsampling", thisX, thisY, thisLevel, x, y, z);

    const dz = z - thisLevel;
    const scalar = Math.pow(2, dz);

    const ellipsoid = tilingScheme.ellipsoid;

    const err = this.errorLevel / scalar;

    const maxVertexDistance = Math.min(
      this.maxVertexDistance * scalar,
      this.tileSize
    );

    const upscaledX = thisX * scalar;
    const x0 = ((x - upscaledX) * this.tileSize) / scalar;
    const x1 = ((x + 1 - upscaledX) * this.tileSize) / scalar;
    const upscaledY = thisY * scalar;
    const y0 = ((y - upscaledY) * this.tileSize) / scalar;
    const y1 = ((y + 1 - upscaledY) * this.tileSize) / scalar;

    const window = { x0, x1, y0, y1 };

    const res = buildTerrainTile({
      tilingScheme,
      heightData: {
        type: "heightfield",
        array: subsetByWindow(this.quantizedHeights, window, true),
        window,
      },
      maxVertexDistance,
      tileCoord: { x, y, z },
      errorLevel: err,
      ellipsoidRadius: ellipsoid.maximumRadius,
      tileSize: x1 - x0,
      overscaleFactor: dz,
    });
    this.upsampleCount++;
    if (this.upsampleCount == 4) {
      // We've upsampled all tiles and don't need to keep terrain data around anymore.
      this.quantizedHeights = undefined;
    }

    return res;
  }

  upsample(
    tilingScheme,
    thisX,
    thisY,
    thisLevel,
    descendantX,
    descendantY,
    descendantLevel
  ) {
    if (this.quantizedHeights == null) {
      return super.upsample(
        tilingScheme,
        thisX,
        thisY,
        thisLevel,
        descendantX,
        descendantY,
        descendantLevel
      );
    }
    return this._upsample(
      tilingScheme,
      thisX,
      thisY,
      thisLevel,
      descendantX,
      descendantY,
      descendantLevel
    );
  }
}
