import { Credit, Resource } from "cesium";
import {
  DefaultHeightmapResource,
  DefaultHeightmapResourceOpts,
} from "./heightmap-resource";

export enum ImageFormat {
  WEBP = "webp",
  PNG = "png",
  PNGRAW = "pngraw",
}

export type MapboxTerrainResourceOpts = {
  highResolution?: boolean;
  imageFormat?: ImageFormat;
  accessToken?: string;
  urlTemplate?: string;
} & DefaultHeightmapResourceOpts;

export class MapboxTerrainResource extends DefaultHeightmapResource {
  resource: Resource = null;
  credit = new Credit("Mapbox");

  constructor(opts: MapboxTerrainResourceOpts = {}) {
    super(opts);
    const highResolution = opts.highResolution ?? false;
    const format = opts.imageFormat ?? ImageFormat.WEBP;
    const { urlTemplate } = opts;

    // overrides based on highResolution flag
    if (highResolution) {
      if (opts.maxZoom === undefined) {
        this.maxZoom = 14;
      }
      if (opts.tileSize === undefined) {
        this.tileSize = 512;
      }
    }

    const defaultURL = `https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}${
      highResolution ? "@2x" : ""
    }.${format}`;

    this.resource = new Resource({ url: urlTemplate ?? defaultURL });
    if (opts.accessToken) {
      this.resource.setQueryParameters({
        access_token: opts.accessToken,
      });
    }
  }
}

export default MapboxTerrainResource;
