import {
  Cartographic,
  Rectangle,
  Ellipsoid,
  WebMercatorTilingScheme,
  Math as CMath,
  Event as CEvent,
  Cartesian3,
  BoundingSphere,
  QuantizedMeshTerrainData,
  HeightmapTerrainData,
  OrientedBoundingBox,
  TerrainProvider,
  Credit,
  Matrix3,
} from "cesium";
const ndarray = require("ndarray");
import Martini from "../martini/index.js";
import WorkerFarm from "./worker-farm";
import { TerrainWorkerInput, decodeTerrain } from "./worker";
import TilingScheme from "cesium/Source/Core/TilingScheme";

// https://github.com/CesiumGS/cesium/blob/1.68/Source/Scene/MapboxImageryProvider.js#L42

enum ImageFormat {
  WEBP = "webp",
  PNG = "png",
  PNGRAW = "pngraw",
}

interface TileCoordinates {
  x: number;
  y: number;
  z: number;
}

interface MapboxTerrainOpts {
  format: ImageFormat;
  ellipsoid?: Ellipsoid;
  accessToken: string;
  highResolution?: boolean;
  workerURL: string;
  urlTemplate: string;
  detailScalar?: number;
  skipOddLevels?: boolean;
  minimumErrorLevel?: number;
  useWorkers?: boolean;
}

interface CanvasRef {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (err) => reject(err));
    img.crossOrigin = "anonymous";
    img.src = url;
  });

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
  accessToken: string;
  format: ImageFormat;
  highResolution: boolean;
  tileSize: number = 256;
  workerFarm: WorkerFarm | null = null;
  inProgressWorkers: number = 0;
  levelOfDetailScalar: number | null = null;
  useWorkers: boolean = true;
  skipOddLevels: boolean = false;
  contextQueue: CanvasRef[];
  minError: number = 0.1;

  RADIUS_SCALAR = 1.0;

  // @ts-ignore
  constructor(opts: MapboxTerrainOpts = {}) {
    //this.martini = new Martini(257);
    this.highResolution = opts.highResolution ?? false;
    this.skipOddLevels = opts.skipOddLevels ?? true;
    this.tileSize = this.highResolution ? 512 : 256;
    this.useWorkers = opts.useWorkers ?? true;
    this.contextQueue = [];

    this.levelOfDetailScalar = (opts.detailScalar ?? 4.0) + CMath.EPSILON5;

    this.ready = true;
    this.readyPromise = Promise.resolve(true);
    this.accessToken = opts.accessToken;
    this.minError = opts.minimumErrorLevel ?? 0.1;

    this.errorEvent.addEventListener(console.log, this);
    this.ellipsoid = opts.ellipsoid ?? Ellipsoid.WGS84;
    this.format = opts.format ?? ImageFormat.WEBP;
    if (this.useWorkers) {
      this.workerFarm = new WorkerFarm();
    }

    this.tilingScheme = new WebMercatorTilingScheme({
      numberOfLevelZeroTilesX: 1,
      numberOfLevelZeroTilesY: 1,
      ellipsoid: this.ellipsoid,
    });
  }

  getCanvas(): CanvasRef {
    let ctx = this.contextQueue.pop();
    if (ctx == null) {
      const canvas = document.createElement("canvas");
      canvas.width = this.tileSize;
      canvas.height = this.tileSize;
      const context = canvas.getContext("2d");
      ctx = {
        canvas,
        context,
      };
    }
    return ctx;
  }

  getPixels(img: HTMLImageElement | HTMLCanvasElement): ImageData {
    const canvasRef = this.getCanvas();
    const { context } = canvasRef;
    //context.scale(1, -1);
    // Chrome appears to vertically flip the image for reasons that are unclear
    // We can make it work in Chrome by drawing the image upside-down at this step.
    context.drawImage(img, 0, 0, this.tileSize, this.tileSize);
    const pixels = context.getImageData(0, 0, this.tileSize, this.tileSize);
    context.clearRect(0, 0, this.tileSize, this.tileSize);
    this.contextQueue.push(canvasRef);
    return pixels;
  }

  buildTileURL(tileCoords: TileCoordinates) {
    const { z, x, y } = tileCoords;
    const hires = this.highResolution ? "@2x" : "";
    // SKU token generation code: https://github.com/mapbox/mapbox-gl-js/blob/79f594fab76d932ccea0f171709718568af660e3/src/util/sku_token.js#L23
    // https://api.mapbox.com/raster/v1/mapbox.mapbox-terrain-dem-v1/${z}/${x}/${y}${hires}.${this.format}?access_token=${this.accessToken}&sku=101EX9Btybqbj
    return `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}${hires}.${this.format}?access_token=${this.accessToken}`;
  }

  requestTileGeometry(x, y, z, request) {
    const maxWorkers = this.highResolution ? 2 : 5;
    if (this.inProgressWorkers > maxWorkers) return undefined;
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
      const url = this.buildTileURL({ x, y, z });
      let image = await loadImage(url);
      let px = this.getPixels(image);
      let pixelData = px.data;

      const tileRect = this.tilingScheme.tileXYToRectangle(x, y, z);
      let maxLength = Math.min(
        Math.round(this.tileSize / 32) * (z + 1),
        this.tileSize
      );

      const params: TerrainWorkerInput = {
        imageData: pixelData,
        maxLength,
        x,
        y,
        z,
        errorLevel: err,
        ellipsoidRadius: this.ellipsoid.maximumRadius,
        tileSize: this.tileSize,
      };

      let res;
      if (this.workerFarm != null) {
        res = await this.workerFarm.scheduleTask(params, [pixelData.buffer]);
      } else {
        res = decodeTerrain(params, []);
      }
      pixelData = undefined;
      image = undefined;
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
      maximumHeight / cosWidth
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
    const scalar = this.highResolution ? 2 : 1;

    return levelZeroMaximumGeometricError / scalar / (1 << level);
  }

  getTileDataAvailable(x, y, z) {
    const maxZoom = this.highResolution ? 14 : 15;
    if (z == maxZoom) return true;
    if (z % 2 == 1 && this.skipOddLevels) return false;
    if (z > maxZoom) return false;
    return true;
  }
}

export default MartiniTerrainProvider;
