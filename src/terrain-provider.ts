import {
  Cartographic,
  Rectangle,
  Ellipsoid,
  WebMercatorTilingScheme,
  Math as CMath,
  Event as CEvent,
  BoundingSphere,
  QuantizedMeshTerrainData,
  HeightmapTerrainData,
  OrientedBoundingBox,
  TerrainProvider,
  Credit,
} from "cesium";
const ndarray = require("ndarray");
import Martini from "../martini/index.js";
import WorkerFarm from "./worker-farm";
import { TerrainWorkerInput, decodeTerrain } from "./worker";
import TilingScheme from "cesium/Source/Core/TilingScheme";
import { HeightmapResource } from './heightmap-resource';

// https://github.com/CesiumGS/cesium/blob/1.68/Source/Scene/MapboxImageryProvider.js#L42

export interface TileCoordinates {
  x: number;
  y: number;
  z: number;
}

interface MartiniTerrainOpts {
  resource: HeightmapResource;
  ellipsoid?: Ellipsoid;
  workerURL: string;
  detailScalar?: number;
  minimumErrorLevel?: number;
  maxWorkers?: number;
}

class MartiniTerrainProvider<TerrainProvider> {
  hasWaterMask = false;
  hasVertexNormals = false;
  credit = new Credit("Mapbox");
  ready: boolean;
  readyPromise: Promise<boolean>;
  availability = null;
  errorEvent = new CEvent();
  tilingScheme: TilingScheme;
  ellipsoid: Ellipsoid;
  workerFarm: WorkerFarm | null = null;
  inProgressWorkers: number = 0;
  levelOfDetailScalar: number | null = null;
  maxWorkers: number = 5;
  minError: number = 0.1;
  
  resource: HeightmapResource = null;

  RADIUS_SCALAR = 1.0;

  // @ts-ignore
  constructor(opts: MartiniTerrainOpts = {}) {
    //this.martini = new Martini(257);
    this.resource = opts.resource;
    this.maxWorkers = opts.maxWorkers ?? 5;

    this.levelOfDetailScalar = (opts.detailScalar ?? 4.0) + CMath.EPSILON5;

    this.ready = true;
    this.readyPromise = Promise.resolve(true);
    this.minError = opts.minimumErrorLevel ?? 0.1;

    this.errorEvent.addEventListener(console.log, this);
    this.ellipsoid = opts.ellipsoid ?? Ellipsoid.WGS84;
    if (this.maxWorkers > 0) {
      this.workerFarm = new WorkerFarm();
    }

    this.tilingScheme = new WebMercatorTilingScheme({
      numberOfLevelZeroTilesX: 1,
      numberOfLevelZeroTilesY: 1,
      ellipsoid: this.ellipsoid,
    });
  }

  requestTileGeometry(x, y, z, request) {
    if (this.inProgressWorkers > this.maxWorkers) return undefined;
    this.inProgressWorkers += 1;
    return this.processTile(x, y, z).finally(() => {
      this.inProgressWorkers -= 1;
    });
  }

  async processTile(x: number, y: number, z: number) {
    // Something wonky about our tiling scheme, perhaps
    // 12/2215/2293 @2x
    //const url = `https://a.tiles.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}${hires}.${this.format}?access_token=${this.accessToken}`;
    const err = this.getErrorLevel(z);
    try {
      const { tileSize, getTilePixels, decodeRgb } = this.resource;
      let px = await getTilePixels({ x, y, z });
      let pixelData = px.data;

      const tileRect = this.tilingScheme.tileXYToRectangle(x, y, z);
      let maxLength = Math.min(
        Math.round(tileSize / 32) * (z + 1),
        tileSize
      );

      const params: TerrainWorkerInput = {
        imageData: pixelData,
        maxLength,
        x,
        y,
        z,
        errorLevel: err,
        ellipsoidRadius: this.ellipsoid.maximumRadius,
        tileSize,
        decodeRgb,
      };

      let res;
      if (this.workerFarm != null) {
        res = await this.workerFarm.scheduleTask({ ...params, decodeRgb: params.decodeRgb?.toString() }, [pixelData.buffer]);
      } else {
        res = decodeTerrain(params, []);
      }
      pixelData = undefined;
      px = undefined;
      return this.createQuantizedMeshData(tileRect, err, res);
    } catch (err) {
      console.log(err);
      // return undefined
      const v = Math.max(32 - 4 * z, 4);
      return this.emptyHeightmap(v);
    }
  }

  getErrorLevel(zoom: number) {
    return Math.max(
      this.getLevelMaximumGeometricError(zoom) / this.levelOfDetailScalar,
      this.minError
    );
  }

  createQuantizedMeshData(tileRect, errorLevel, workerOutput) {
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
    // Need to get maximum distance at zoom level
    // tileRect.width is given in radians
    // cos of half-tile-width allows us to use right-triangle relationship
    const cosWidth = Math.cos(tileRect.width / 2); // half tile width since our ref point is at the center
    // scale max height to max ellipsoid radius
    // ... it might be better to use the radius of the entire
    // cosine relationship to scale height in ellipsoid-relative coordinates
    const occlusionPoint = new Cartographic(
      center.longitude,
      center.latitude,
      (maximumHeight * 2) / cosWidth
      // Scaling factor of two just to be sure.
    );

    const horizonOcclusionPoint = this.ellipsoid.transformPositionToScaledSpace(
      Cartographic.toCartesian(occlusionPoint)
    );

    let orientedBoundingBox = OrientedBoundingBox.fromRectangle(
      tileRect,
      minimumHeight,
      maximumHeight,
      this.tilingScheme.ellipsoid
    );
    let boundingSphere =
      BoundingSphere.fromOrientedBoundingBox(orientedBoundingBox);

    // SE NW NE
    // NE NW SE

    let result = new QuantizedMeshTerrainData({
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
    });

    //debugger;

    //if (tileRect.width < 0.01) debugger;
    //return this.emptyHeightmap(2);
    return result;
  }

  emptyHeightmap(samples) {
    return new HeightmapTerrainData({
      buffer: new Uint8Array(Array(samples * samples).fill(0)),
      width: samples,
      height: samples,
    });
  }

  getLevelMaximumGeometricError(level) {
    const levelZeroMaximumGeometricError =
      TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
        this.tilingScheme.ellipsoid,
        65,
        this.tilingScheme.getNumberOfXTilesAtLevel(0)
      );

    // Scalar to control overzooming
    // also seems to control zooming for imagery layers
    const scalar = this.resource.tileSize / 256;

    return levelZeroMaximumGeometricError / scalar / (1 << level);
  }

  getTileDataAvailable(x, y, z) {
    return this.resource.getTileDataAvailable({ x, y, z });
  }
}

export default MartiniTerrainProvider;
