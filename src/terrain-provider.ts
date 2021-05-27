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
  minimumErrorLevel?: number;
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
  workerFarm: WorkerFarm;
  inProgressWorkers: number = 0;
  levelOfDetailScalar: number | null = null;
  useWorkers: boolean = true;
  contextQueue: CanvasRef[];
  minError: number = 0.1;

  RADIUS_SCALAR = 1.0;

  // @ts-ignore
  constructor(opts: MapboxTerrainOpts = {}) {
    //this.martini = new Martini(257);
    this.highResolution = opts.highResolution ?? false;
    this.tileSize = this.highResolution ? 512 : 256;
    this.contextQueue = [];

    this.levelOfDetailScalar = (opts.detailScalar ?? 4.0) + CMath.EPSILON5;

    this.ready = true;
    this.readyPromise = Promise.resolve(true);
    this.accessToken = opts.accessToken;
    this.minError = opts.minimumErrorLevel ?? 0.1;

    this.errorEvent.addEventListener(console.log, this);
    this.ellipsoid = opts.ellipsoid ?? Ellipsoid.WGS84;
    this.format = opts.format ?? ImageFormat.WEBP;
    this.workerFarm = new WorkerFarm();

    this.tilingScheme = new WebMercatorTilingScheme({
      numberOfLevelZeroTilesX: 1,
      numberOfLevelZeroTilesY: 1,
      ellipsoid: this.ellipsoid,
    });
  }

  getCanvas(): CanvasRef {
    let ctx = this.contextQueue.pop();
    if (ctx == null) {
      //console.log("Creating new canvas element");
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
    const hires = this.highResolution ? "@2x" : "";

    try {
      const url = this.buildTileURL({ x, y, z });
      let image = await loadImage(url);
      let px = this.getPixels(image);
      const pixelData = px.data;

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
      if (this.useWorkers) {
        res = await this.workerFarm.scheduleTask(params, [pixelData.buffer]);
      } else {
        res = decodeTerrain(params, []);
      }

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
      minimumHeight: minHeight,
      maximumHeight: maxHeight,
      quantizedVertices,
      indices: triangles,
      westIndices,
      southIndices,
      eastIndices,
      northIndices,
    } = workerOutput;

    const err = errorLevel;
    const skirtHeight = err * 5;

    const tileCenter = Cartographic.toCartesian(Rectangle.center(tileRect));
    // Need to get maximum distance at zoom level
    // tileRect.width is given in radians
    // cos of half-tile-width allows us to use right-triangle relationship
    const cosWidth = Math.cos(tileRect.width / 2); // half tile width since our ref point is at the center
    // scale max height to max ellipsoid radius
    // ... it might be better to use the radius of the entire
    const ellipsoidHeight = maxHeight / this.ellipsoid.maximumRadius;
    // cosine relationship to scale height in ellipsoid-relative coordinates
    const occlusionHeight = (1 + ellipsoidHeight) / cosWidth;

    const scaledCenter =
      this.ellipsoid.transformPositionToScaledSpace(tileCenter);
    const horizonOcclusionPoint = new Cartesian3(
      scaledCenter.x,
      scaledCenter.y,
      occlusionHeight * Math.sign(tileCenter.z)
    );

    let orientedBoundingBox = null;
    let boundingSphere: BoundingSphere;
    if (tileRect.width < CMath.PI_OVER_TWO + CMath.EPSILON5) {
      // @ts-ignore
      orientedBoundingBox = OrientedBoundingBox.fromRectangle(
        tileRect,
        minHeight,
        maxHeight
      );
      // @ts-ignore
      boundingSphere =
        BoundingSphere.fromOrientedBoundingBox(orientedBoundingBox);
    } else {
      // If our bounding rectangle spans >= 90º, we should use the entire globe as a bounding sphere.
      boundingSphere = new BoundingSphere(
        Cartesian3.ZERO,
        // radius (seems to be max height of Earth terrain?)
        6379792.481506292
      );
    }
    console.log(orientedBoundingBox, boundingSphere);

    // SE NW NE
    // NE NW SE

    return new QuantizedMeshTerrainData({
      minimumHeight: minHeight,
      maximumHeight: maxHeight,
      quantizedVertices,
      indices: triangles,
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
    return z <= 15;
  }
}

export default MartiniTerrainProvider;
