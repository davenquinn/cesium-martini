import { Resource } from "cesium";
import { DefaultHeightmapResource, DefaultHeightmapResourceOpts } from "./heightmap-resource";
import { TileCoordinates } from "./terrain-provider";

export enum ImageFormat {
  WEBP = "webp",
  PNG = "png",
  PNGRAW = "pngraw",
}

export type MapboxTerrainResourceOpts = {
  highResolution?: boolean;
  imageFormat?: ImageFormat;
  accessToken?: string;
} & DefaultHeightmapResourceOpts;

export class MapboxTerrainResource extends DefaultHeightmapResource {
  resource: Resource = null;

  constructor(opts: MapboxTerrainResourceOpts = {}) {
    super(opts);
    const highResolution = opts.highResolution ?? false;
    const format = opts.imageFormat ?? ImageFormat.WEBP;

    // overrides based on highResolution flag
    if (highResolution) {
      if (opts.maxZoom === undefined) {
        this.maxZoom = 14;
      }
      if (opts.tileSize === undefined) {
        this.tileSize = 512;
      }
    }
    
    this.resource = Resource.createIfNeeded(`https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}${highResolution ? "@2x" : ""}.${format}`);
    if (opts.accessToken) {
      this.resource.setQueryParameters({
        access_token: opts.accessToken
      });
    }
  }
}

export default MapboxTerrainResource;