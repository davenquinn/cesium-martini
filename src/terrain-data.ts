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
  workerInput: TerrainWorkerInput | undefined
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
    workerInput,
    overscaleFactor,
  });
}

interface EmptyMeshOptions {
  tileRect: Rectangle;
  tileCoord: TileCoordinates;
  ellipsoid: Ellipsoid;
  errorLevel: number;
}

export function createEmptyMesh(opts: EmptyMeshOptions): RasterTerrainData {
  const { tileRect, tileCoord, errorLevel, ellipsoid } = opts;
  const center = Rectangle.center(tileRect);
  const { z } = tileCoord;

  const latScalar = Math.min(Math.abs(Math.sin(center.latitude)), 0.995);
  let v = Math.max(
    Math.ceil((200 / (z + 1)) * Math.pow(1 - latScalar, 0.25)),
    4
  );
  const output = emptyMesh(v);
  return createTerrainData(
    tileRect,
    ellipsoid,
    errorLevel,
    0,
    output,
    undefined
  );
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

  const { errorLevel, tileCoord } = workerOpts;
  const workerFarm = getWorkerFarm();

  try {
    let res;
    if (workerFarm != null) {
      res = await workerFarm.scheduleTask(workerOpts, [
        workerOpts.pixelData.buffer,
      ]);
    } else {
      res = decodeTerrain(workerOpts, []);
    }
    return createTerrainData(
      tileRect,
      ellipsoid,
      errorLevel,
      overscaleFactor,
      res,
      workerOpts
    );
  } catch (err) {
    console.log(err);
    return createEmptyMesh({ tileRect, errorLevel, ellipsoid, tileCoord });
  }
}

interface RasterParams {
  workerInput: TerrainWorkerInput;
  overscaleFactor?: number;
}

type RasterTerrainOptions = QuantizedMeshTerrainOptions & RasterParams;

export class RasterTerrainData
  extends QuantizedMeshTerrainData
  implements RasterParams
{
  workerInput: TerrainWorkerInput | undefined;
  levelOverviews: RasterTerrainData[] = [];
  overscaleFactor: number = 0;
  constructor(opts: RasterTerrainOptions) {
    super(opts);
    this.workerInput = opts.workerInput;
    this.overscaleFactor = opts.overscaleFactor || 0;
  }

  async getDescendantTerrainTile(
    tilingScheme: TilingScheme,
    thisLevel: number,
    descendantLevel: number
  ): Promise<RasterTerrainData | QuantizedMeshTerrainData> {
    if (this.workerInput == null) {
      return this;
    }
    const dz = descendantLevel - thisLevel;
    if (this.overscaleFactor == dz) {
      return this;
    }
    if (this.overscaleFactor > 3) {
      // We are dealing with a tile that has already been overscaled a lot
      return this;
    }
    if (this.levelOverviews[dz] != null) {
      return this.levelOverviews[dz];
    }
    const scalar = Math.pow(2, dz);
    this.levelOverviews[dz] = await buildTerrainTile({
      tilingScheme,
      ...this.workerInput,
      overscaleFactor: dz,
      errorLevel: this.workerInput.errorLevel / scalar,
      maxVertexDistance: Math.max(
        Math.round(this.workerInput.maxVertexDistance / scalar),
        1
      ),
    });
    return this.levelOverviews[dz];
  }

  async upsample(
    tilingScheme,
    thisX,
    thisY,
    thisLevel,
    descendantX,
    descendantY,
    descendantLevel
  ) {
    const tile = await this.getDescendantTerrainTile(
      tilingScheme,
      thisLevel,
      descendantLevel
    );
    return tile.upsample(
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
