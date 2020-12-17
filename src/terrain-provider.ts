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
import WorkerFarm from "./worker-farm";
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

  async getPixels(
    img: HTMLImageElement | HTMLCanvasElement
  ): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      //img.onload = ()=>{
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const context = canvas.getContext("2d");
      context.drawImage(img, 0, 0);
      const pixels = context.getImageData(0, 0, img.width, img.height);
      resolve(pixels);
      //}
    });
  }

  async requestMapboxTile(x, y, z, request) {
    const mx = this.tilingScheme.getNumberOfYTilesAtLevel(z);
    const err = this.getLevelMaximumGeometricError(z);

    const hires = this.highResolution ? "@2x" : "";
    if (x == 0 && y == 0 && z == 0) {
      return this.emptyHeightmap(64);
    }

    // Something wonky about our tiling scheme, perhaps
    // 12/2215/2293 @2x
    //const url = `https://a.tiles.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}${hires}.${this.format}?access_token=${this.accessToken}`;
    try {
      const img = await this.backend.requestImage(x, y, z, request);
      if (img == null) return undefined;

      const px = await this.getPixels(img);
      const pixelData = px.data;

      const params: TerrainWorkerInput = {
        imageData: pixelData,
        x,
        y,
        z,
        errorLevel: this.getLevelMaximumGeometricError(z),
        ellipsoidRadius: this.ellipsoid.maximumRadius,
        tileSize: this.tileSize,
      };

      const res = await this.workerFarm.scheduleTask(params, [
        pixelData.buffer,
      ]);
      //const res = await decodeTerrain(params, []);
      if (res == null) return undefined;
      return this.createQuantizedMeshData(x, y, z, res);
    } catch (err) {
      // console.log(err);
      // return undefined
      const v = Math.max(32 - 4 * z, 4);
      return this.emptyHeightmap(v);
    }
  }

  createQuantizedMeshData(x, y, z, workerOutput) {
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

    console.log(workerOutput);

    const err = this.getLevelMaximumGeometricError(z);
    const skirtHeight = err * 5;

    const tileRect = this.tilingScheme.tileXYToRectangle(x, y, z);
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

    const scaledCenter = Ellipsoid.WGS84.transformPositionToScaledSpace(
      tileCenter
    );
    const horizonOcclusionPoint = new Cartesian3(
      scaledCenter.x,
      scaledCenter.y,
      occlusionHeight
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
      boundingSphere = BoundingSphere.fromOrientedBoundingBox(
        orientedBoundingBox
      );
    } else {
      // If our bounding rectangle spans >= 90º, we should use the entire globe as a bounding sphere.
      boundingSphere = new BoundingSphere(
        Cartesian3.ZERO,
        // radius (seems to be max height of Earth terrain?)
        6379792.481506292
      );
    }

    // @ts-ignore

    // If our tile has greater than ~1º size
    if (tileRect.width > 0.04 && triangles.length < 500) {
      // We need to be able to specify a minimum number of triangles...
      return this.emptyHeightmap(64);
    }

    // SE NW NE
    // NE NW SE

    return new QuantizedMeshTerrainData({
      minimumHeight: minHeight,
      maximumHeight: maxHeight,
      quantizedVertices,
      indices: triangles,
      // @ts-ignore
      boundingSphere,
      // @ts-ignore
      orientedBoundingBox,
      // @ts-ignore
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

  async requestTileGeometry(x, y, z, request) {
    try {
      const mapboxTile = await this.requestMapboxTile(x, y, z, request);
      return mapboxTile;
    } catch (err) {
      console.log(err);
    }
  }

  emptyHeightmap(samples) {
    return new HeightmapTerrainData({
      buffer: new Uint8Array(Array(samples * samples).fill(0)),
      width: samples,
      height: samples,
    });
  }

  getLevelMaximumGeometricError(level) {
    const levelZeroMaximumGeometricError = TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
      this.tilingScheme.ellipsoid,
      65,
      this.tilingScheme.getNumberOfXTilesAtLevel(0)
    );

    // Scalar to control overzooming
    // also seems to control zooming for imagery layers
    const scalar = this.highResolution ? 2 : 4;

    return levelZeroMaximumGeometricError / scalar / (1 << level);
  }

  getTileDataAvailable(x, y, z) {
    return z <= 15;
  }
}

export default MapboxTerrainProvider;
