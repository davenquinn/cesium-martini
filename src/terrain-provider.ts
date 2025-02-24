import {
  Cartographic,
  OrientedBoundingBox,
  BoundingSphere,
  Rectangle,
  Ellipsoid,
  WebMercatorTilingScheme,
  Math as CMath,
  Event as CEvent,
  TerrainProvider,
  Credit,
  TilingScheme,
  QuantizedMeshTerrainData,
} from "cesium";

import {
  TerrainWorkerInput,
  emptyMesh as _emptyMesh,
} from "./worker/worker-util";
import { HeightmapResource } from "./resources/heightmap-resource";
import WorkerFarmTerrainDecoder, {
  TerrainDecoder,
  DefaultTerrainDecoder,
} from "./worker/decoder";
import {
  createEmptyMesh,
  createTerrainMesh,
  TerrainMeshMeta,
} from "./terrain-data";
import { TileCoordinates } from "./terrain-data";

// https://github.com/CesiumGS/cesium/blob/1.68/Source/Scene/MapboxImageryProvider.js#L42

export interface MartiniTerrainOpts {
  resource: HeightmapResource;
  decoder?: TerrainDecoder;

  ellipsoid?: Ellipsoid;
  tilingScheme?: TilingScheme;
  // workerURL: string;
  detailScalar?: number;
  minimumErrorLevel?: number;
  maxWorkers?: number;
  minZoomLevel?: number;
  fillPoles?: boolean;
}

export class StretchedTilingScheme extends WebMercatorTilingScheme {
  tileXYToRectangle(
    x: number,
    y: number,
    level: number,
    res: Rectangle,
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
  ellipsoid: Ellipsoid;
  levelOfDetailScalar: number | null = null;
  maxWorkers: number = 5;
  minError: number = 0.1;
  minZoomLevel: number;
  fillPoles: boolean = true;
  _errorAtMinZoom: number = 1000;

  resource: HeightmapResource = null;
  decoder: TerrainDecoder = null;

  RADIUS_SCALAR = 1.0;

  // @ts-ignore
  constructor(opts: MartiniTerrainOpts = {}) {
    //this.martini = new Martini(257);
    this.resource = opts.resource;
    this.credit = this.resource.credit ?? new Credit("Mapbox");

    this.decoder = opts.decoder;
    this.maxWorkers = opts.maxWorkers ?? 5;

    if (!this.decoder) {
      const maxWorkers = this.maxWorkers;
      if (maxWorkers > 0) {
        this.decoder = new WorkerFarmTerrainDecoder({ maxWorkers });
      } else {
        this.decoder = new DefaultTerrainDecoder();
      }
    }
    this.minZoomLevel = opts.minZoomLevel ?? 3;
    this.fillPoles = opts.fillPoles ?? true;

    this.ready = true;
    this.readyPromise = Promise.resolve(true);
    this.minError = opts.minimumErrorLevel ?? 0.1;

    this.errorEvent.addEventListener(console.log, this);
    this.ellipsoid = opts.ellipsoid ?? Ellipsoid.WGS84;

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

    this.levelOfDetailScalar = (opts.detailScalar ?? 2.0) + CMath.EPSILON5;

    //this.errorEvent.addEventListener(console.log, this);
    this.ellipsoid =
      opts.tilingScheme?.ellipsoid ?? opts.ellipsoid ?? Ellipsoid.WGS84;

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
    return this.decoder.requestTileGeometry(
      { x, y, z },
      this.processTile.bind(this),
    );
  }

  async processTile({ x, y, z }: TileCoordinates) {
    // Something wonky about our tiling scheme, perhaps
    // 12/2215/2293 @2x
    //const url = `https://a.tiles.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}${hires}.${this.format}?access_token=${this.accessToken}`;
    const tileRect = this.tilingScheme.tileXYToRectangle(x, y, z);
    const errorLevel = this.errorAtZoom(z);
    const maxVertexDistance = this.maxVertexDistance(tileRect);

    try {
      const { tileSize, getTilePixels } = this.resource;
      const r1 = getTilePixels.bind(this.resource, { x, y, z });

      if (r1 == null) {
        return;
      }
      const px = await r1();

      let pixelData = px.data;
      if (pixelData == null) {
        return;
      }

      ///const center = Rectangle.center(tileRect);

      const params: TerrainWorkerInput = {
        imageData: pixelData,
        maxVertexDistance,
        x,
        y,
        z,
        errorLevel,
        ellipsoidRadius: this.tilingScheme.ellipsoid.maximumRadius,
        tileSize,
      };

      const res = await this.decoder.decodeTerrain(params, pixelData.buffer);

      const meta: TerrainMeshMeta = {
        ellipsoid: this.tilingScheme.ellipsoid,
        errorLevel,
        overscaleFactor: 0,
        maxVertexDistance,
        tileRect,
        tileSize,
      };

      /** This builds a final terrain mesh object that can optionally
       * be upscaled to a higher resolution.
       */
      return createTerrainMesh(res, meta);
    } catch (err) {
      //console.log(err);
      return createEmptyMesh({
        tileRect,
        errorLevel,
        ellipsoid: this.tilingScheme.ellipsoid,
        tileCoord: { x, y, z },
        tileSize: 0,
      });
    }
  }

  errorAtZoom(zoom: number) {
    return Math.max(
      this.getLevelMaximumGeometricError(zoom) / this.levelOfDetailScalar,
      this.minError,
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
    const center = Rectangle.center(tileRect);

    const latScalar = Math.min(Math.abs(Math.sin(center.latitude)), 0.995);
    let v = Math.max(
      Math.ceil((200 / (z + 1)) * Math.pow(1 - latScalar, 0.25)),
      4,
    );
    const output = _emptyMesh(v);
    const err = this.errorAtZoom(z);
    return this.createQuantizedMeshData(tileRect, err, output);
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

    // Calculating occlusion height is kind of messy currently, but it definitely works
    const halfAngle = tileRect.width / 2;
    const dr = Math.cos(halfAngle); // half tile width since our ref point is at the center

    let occlusionHeight = dr * this.ellipsoid.maximumRadius + maximumHeight;
    if (halfAngle > Math.PI / 4) {
      occlusionHeight = (1 + halfAngle) * this.ellipsoid.maximumRadius;
    }

    const occlusionPoint = new Cartographic(
      center.longitude,
      center.latitude,
      occlusionHeight,
      // Scaling factor of two just to be sure.
    );

    const horizonOcclusionPoint = this.ellipsoid.transformPositionToScaledSpace(
      Cartographic.toCartesian(occlusionPoint),
    );

    let orientedBoundingBox = OrientedBoundingBox.fromRectangle(
      tileRect,
      minimumHeight,
      maximumHeight,
      this.tilingScheme.ellipsoid,
    );
    let boundingSphere =
      BoundingSphere.fromOrientedBoundingBox(orientedBoundingBox);

    // SE NW NE
    // NE NW SE

    /** TODO: we need to create raster terrain data. */
    return new QuantizedMeshTerrainData({
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
  }

  getLevelMaximumGeometricError(level) {
    const levelZeroMaximumGeometricError =
      TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
        this.tilingScheme.ellipsoid,
        65,
        this.tilingScheme.getNumberOfXTilesAtLevel(0),
      );

    /*
    Scalar to control overzooming
    - also seems to control zooming for imagery layers
    - This scalar was causing trouble for non-256 tile sizes,
      and we've removed it for now. It could be reintroduced
      if it seems necessary
    */
    const scalar = 1; //this.resource.tileSize / 256 ;

    return levelZeroMaximumGeometricError / scalar / (1 << level);
  }

  getTileDataAvailable(x, y, z) {
    return this.resource.getTileDataAvailable({ x, y, z });
  }
}
