import {
  Cartographic,
  Rectangle,
  Ellipsoid,
  WebMercatorTilingScheme,
  TerrainProvider,
  Math as CMath,
  Event as CEvent,
  Cartesian3,
  BoundingSphere,
  QuantizedMeshTerrainData,
  HeightmapTerrainData,
  MapboxImageryProvider,
  // @ts-ignore
  OrientedBoundingBox,
  Credit,
  TaskProcessor,
} from "cesium";
const ndarray = require("ndarray");
import Martini from "@mapbox/martini";
import TerrainWorker from "web-worker:./worker";
import { TerrainWorkerInput } from "./worker";

// https://github.com/CesiumGS/cesium/blob/1.68/Source/Scene/MapboxImageryProvider.js#L42

enum ImageFormat {
  WEBP = "webp",
  PNG = "png",
  PNGRAW = "pngraw",
}

interface MapboxTerrainOpts {
  format: ImageFormat;
  ellipsoid?: Ellipsoid;
  accessToken: string;
  highResolution?: boolean;
  workerURL: string;
}

class WorkerFarm extends TaskProcessor {
  _worker: Worker;
  constructor(maximumActiveTasks: number = 5) {
    super("terrain-worker", maximumActiveTasks);
    this._worker = new TerrainWorker();
  }
}

class MapboxTerrainProvider {
  martini: any;
  hasWaterMask = false;
  hasVertexNormals = false;
  credit = new Credit("Mapbox");
  ready: boolean;
  readyPromise: Promise<boolean>;
  availability = null;
  errorEvent = new CEvent();
  tilingScheme: TerrainProvider["tilingScheme"];
  ellipsoid: Ellipsoid;
  accessToken: string;
  format: ImageFormat;
  highResolution: boolean;
  tileSize: number = 256;
  backend: MapboxImageryProvider;
  workerFarm: WorkerFarm;

  // @ts-ignore
  constructor(opts: MapboxTerrainOpts) {
    //this.martini = new Martini(257);
    this.highResolution = true; //opts.highResolution ?? false
    this.tileSize = this.highResolution ? 512 : 256;

    this.martini = new Martini(this.tileSize + 1);
    this.ready = true;
    this.readyPromise = Promise.resolve(true);
    this.accessToken = opts.accessToken;

    this.errorEvent.addEventListener(console.log, this);
    this.ellipsoid = opts.ellipsoid ?? Ellipsoid.WGS84;
    this.format = opts.format ?? ImageFormat.WEBP;
    this.workerFarm = new WorkerFarm();

    this.backend = new MapboxImageryProvider({
      mapId: "mapbox.terrain-rgb",
      maximumLevel: 15,
      accessToken: process.env.MAPBOX_API_TOKEN,
      hasAlphaChannel: false,
      format: "@2x.webp",
    });

    this.tilingScheme = new WebMercatorTilingScheme({
      numberOfLevelZeroTilesX: 1,
      numberOfLevelZeroTilesY: 1,
      ellipsoid: this.ellipsoid,
    });
  }

  async getPixels(img: HTMLImageElement | HTMLCanvasElement) {
    return new Promise((resolve, reject) => {
      //img.onload = ()=>{
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const context = canvas.getContext("2d");
      context.drawImage(img, 0, 0);
      const pixels = context.getImageData(0, 0, img.width, img.height);
      resolve(
        ndarray(
          new Uint8Array(pixels.data),
          [img.width, img.height, 4],
          [4, 4 * img.width, 1],
          0
        )
      );
      //}
    });
  }

  async requestMapboxTile(x, y, z, request) {
    const mx = this.tilingScheme.getNumberOfYTilesAtLevel(z);
    const err = this.getLevelMaximumGeometricError(z);

    const hires = this.highResolution ? "@2x" : "";

    // Something wonky about our tiling scheme, perhaps
    // 12/2215/2293 @2x
    //const url = `https://a.tiles.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}${hires}.${this.format}?access_token=${this.accessToken}`;

    const img = await this.backend.requestImage(x, y, z, request);
    const bmp = await createImageBitmap(img);

    const params: TerrainWorkerInput = {
      imageData: bmp,
      x,
      y,
      z,
      errorLevel: this.getLevelMaximumGeometricError(z),
      ellipsoidRadius: this.ellipsoid.maximumRadius,
      tileSize: this.tileSize,
    };

    const res = await this.workerFarm.scheduleTask(params);
    if (res == null) return;
    return new QuantizedMeshTerrainData(res);
  }

  async requestTileGeometry(x, y, z, request) {
    try {
      const mapboxTile = await this.requestMapboxTile(x, y, z, request);
      return mapboxTile;
    } catch (err) {
      console.log(err);
    }
  }

  getLevelMaximumGeometricError(level) {
    const levelZeroMaximumGeometricError = TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
      this.tilingScheme.ellipsoid,
      65,
      this.tilingScheme.getNumberOfXTilesAtLevel(0)
    );

    // Scalar to control overzooming
    // also seems to control zooming for imagery layers
    const scalar = this.highResolution ? 8 : 4;

    return levelZeroMaximumGeometricError / scalar / (1 << level);
  }

  getTileDataAvailable(x, y, z) {
    return z <= 15;
  }
}

export default MapboxTerrainProvider;
