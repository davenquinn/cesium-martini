import {
  Rectangle,
  Ellipsoid,
  WebMercatorTilingScheme,
  Math as CMath,
  Event as CEvent,
  TerrainProvider,
  Credit,
  TilingScheme,
} from "cesium";
import WorkerFarm from "./worker-farm";
import { HeightmapResource } from "./heightmap-resource";
import MapboxTerrainResource, {
  MapboxTerrainResourceOpts,
} from "./mapbox-resource";
import { createEmptyMesh, buildTerrainTile } from "./terrain-data";

// https://github.com/CesiumGS/cesium/blob/1.68/Source/Scene/MapboxImageryProvider.js#L42

interface MartiniTerrainOpts {
  resource: HeightmapResource;
  tilingScheme?: TilingScheme;
  // workerURL: string;
  detailScalar?: number;
  minimumErrorLevel?: number;
  maxWorkers?: number;
  interval?: number;
  offset?: number;
  minZoomLevel?: number;
  fillPoles?: boolean;
}

export class StretchedTilingScheme extends WebMercatorTilingScheme {
  tileXYToRectangle(
    x: number,
    y: number,
    level: number,
    res: Rectangle
  ): Rectangle {
    let result = super.tileXYToRectangle(x, y, level);
    if (y == 0) {
      result.north = Math.PI / 2;
    }
    if (y + 1 == Math.pow(2, level)) {
      result.south = -Math.PI / 2;
    }
    return result;
  }
}

export class MartiniTerrainProvider<TerrainProvider> {
  hasWaterMask = false;
  hasVertexNormals = false;
  credit = new Credit("Mapbox");
  ready: boolean;
  readyPromise: Promise<boolean>;
  availability = null;
  errorEvent = new CEvent();
  tilingScheme: TilingScheme;
  workerFarm: WorkerFarm | null = null;
  inProgressWorkers: number = 0;
  levelOfDetailScalar: number | null = null;
  maxWorkers: number = 5;
  minError: number = 0.1;
  minZoomLevel: number;
  fillPoles: boolean = true;
  _errorAtMinZoom: number = 1000;

  resource: HeightmapResource = null;
  interval: number;
  offset: number;

  RADIUS_SCALAR = 1.0;

  // @ts-ignore
  constructor(opts: MartiniTerrainOpts = {}) {
    //this.martini = new Martini(257);
    this.resource = opts.resource;

    this.interval = opts.interval ?? 0.1;
    this.offset = opts.offset ?? -10000;
    this.maxWorkers = opts.maxWorkers ?? 5;
    this.minZoomLevel = opts.minZoomLevel ?? 3;
    this.fillPoles = opts.fillPoles ?? true;
    if (opts.tilingScheme == null) {
      let scheme = WebMercatorTilingScheme;
      if (this.fillPoles) {
        scheme = StretchedTilingScheme;
      }
      this.tilingScheme = new scheme({
        numberOfLevelZeroTilesX: 1,
        numberOfLevelZeroTilesY: 1,
        ellipsoid: this.ellipsoid,
      });
    } else {
      this.tilingScheme = opts.tilingScheme;
    }

    this.levelOfDetailScalar = (opts.detailScalar ?? 4.0) + CMath.EPSILON5;

    this.ready = true;
    this.readyPromise = Promise.resolve(true);
    this.minError = opts.minimumErrorLevel ?? 0.1;

    //this.errorEvent.addEventListener(console.log, this);
    this.ellipsoid =
      opts.tilingScheme?.ellipsoid ?? opts.ellipsoid ?? Ellipsoid.WGS84;
    if (this.maxWorkers > 0) {
      this.workerFarm = new WorkerFarm();
    }

    this._errorAtMinZoom = this.errorAtZoom(this.minZoomLevel);
  }

  requestTileGeometry(x, y, z, request) {
    // Look for tiles both below the zoom level and below the error threshold for the zoom level at the equator...

    if (
      this.minZoomLevel != 0 &&
      (z < this.minZoomLevel ||
        this.scaledErrorForTile(x, y, z) > this._errorAtMinZoom)
    ) {
      // If we are below the minimum zoom level, we return empty heightmaps
      // to avoid unnecessary requests for low-resolution data.
      return Promise.resolve(this.emptyMesh(x, y, z));
    }

    // Note: we still load a TON of tiles near the poles. We might need to do some overzooming here...

    request = this.resource.getTilePixels({ x, y, z });
    if (request == null) return undefined;
    return request.then((imageData: ImageData) => {
      return this.processTile(imageData, x, y, z);
    });
  }

  async processTile(imageData: ImageData, x: number, y: number, z: number) {
    // Something wonky about our tiling scheme, perhaps
    // 12/2215/2293 @2x
    //const url = `https://a.tiles.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}${hires}.${this.format}?access_token=${this.accessToken}`;
    const { tileSize } = this.resource;
    let pixelData = imageData.data;

    const tileRect = this.tilingScheme.tileXYToRectangle(x, y, z);
    ///const center = Rectangle.center(tileRect);

    const err = this.errorAtZoom(z);

    let maxVertexDistance = this.maxVertexDistance(tileRect);

    return buildTerrainTile({
      tilingScheme: this.tilingScheme,
      heightData: {
        type: "image",
        array: pixelData,
        interval: this.interval,
        offset: this.offset,
      },
      maxVertexDistance,
      tileCoord: { x, y, z },
      errorLevel: err,
      ellipsoidRadius: this.ellipsoid.maximumRadius,
      tileSize,
      overscaleFactor: 0,
    });
  }

  errorAtZoom(zoom: number) {
    return Math.max(
      this.getLevelMaximumGeometricError(zoom) / this.levelOfDetailScalar,
      this.minError
    );
  }

  scaledErrorForTile(x: number, y: number, z: number) {
    const tileRect = this.tilingScheme.tileXYToRectangle(x, y, z);
    const center = Rectangle.center(tileRect);
    return this.errorAtZoom(z) / Math.pow(1 - Math.sin(center.latitude), 2);
  }

  maxVertexDistance(tileRect: Rectangle) {
    return Math.ceil(2 / tileRect.height);
  }

  emptyMesh(x: number, y: number, z: number) {
    const tileRect = this.tilingScheme.tileXYToRectangle(x, y, z);
    const tileCoord = { x, y, z };

    const ellipsoid = this.tilingScheme.ellipsoid;
    const errorLevel = this.errorAtZoom(z);
    return createEmptyMesh({
      tileRect,
      ellipsoid,
      errorLevel,
      tileCoord,
      tileSize: 0,
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

type MapboxTerrainOpts = Omit<MartiniTerrainOpts, "resource"> &
  MapboxTerrainResourceOpts;

export default class MapboxTerrainProvider extends MartiniTerrainProvider<TerrainProvider> {
  constructor(opts: MapboxTerrainOpts = {}) {
    const resource = new MapboxTerrainResource(opts);
    super({
      ...opts,
      resource,
    });
  }
}
