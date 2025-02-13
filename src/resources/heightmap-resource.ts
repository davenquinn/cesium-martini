import { Resource, Credit } from "cesium";
import { TileCoordinates } from "../terrain-provider";

export interface HeightmapResource {
  credit?: Credit;
  tileSize: number;
  getTilePixels: (coords: TileCoordinates) => Promise<ImageData> | undefined;
  getTileDataAvailable: (coords: TileCoordinates) => boolean;
}

interface CanvasRef {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}
export interface DefaultHeightmapResourceOpts {
  url?: string;
  // Legacy option, use skipZoomLevels instead
  skipOddLevels?: boolean;
  skipZoomLevels: [number] | ((z: number) => boolean);
  maxZoom?: number;
  tileSize?: number;
}

export class DefaultHeightmapResource implements HeightmapResource {
  resource: Resource = null;
  tileSize: number = 256;
  maxZoom: number;
  skipZoomLevel: (z: number) => boolean;
  contextQueue: CanvasRef[];

  constructor(opts: DefaultHeightmapResourceOpts = {}) {
    if (opts.url) {
      this.resource = Resource.createIfNeeded(opts.url);
    }
    this.skipZoomLevel = () => false;
    if (opts.skipZoomLevels) {
      if (Array.isArray(opts.skipZoomLevels)) {
        this.skipZoomLevel = (z: number) => opts.skipZoomLevels.includes(z);
      } else {
        this.skipZoomLevel = opts.skipZoomLevels;
      }
    } else if (opts.skipOddLevels) {
      this.skipZoomLevel = (z: number) => z % 2 == 1;
    }

    this.tileSize = opts.tileSize ?? 256;
    this.maxZoom = opts.maxZoom ?? 15;
    this.contextQueue = [];
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

  getTileResource(tileCoords: TileCoordinates) {
    // reverseY for TMS tiling (https://gist.github.com/tmcw/4954720)
    // See tiling schemes here: https://www.maptiler.com/google-maps-coordinates-tile-bounds-projection/
    const { z, y } = tileCoords;
    return this.resource.getDerivedResource({
      templateValues: {
        ...tileCoords,
        reverseY: Math.pow(2, z) - y - 1,
      },
      preserveQueryParameters: true,
    });
  }

  getTilePixels(coords: TileCoordinates): Promise<ImageData> | undefined {
    const resource = this.getTileResource(coords);
    const request = resource.fetchImage({
      preferImageBitmap: false,
      retryAttempts: 3,
    });
    if (request == null) return undefined;
    return request.then((img: HTMLImageElement | ImageBitmap) =>
      this.getPixels(img),
    );
  }

  getTileDataAvailable({ z }) {
    if (z == this.maxZoom) return true;
    /* Weird hack:
    For some reason, request render mode breaks if zoom 1 tiles are disabled.
    So we have to make sure that we always report zoom 1 tiles as available.
    */
    if (z < 2) return true;
    if (this.skipZoomLevel(z)) return false;
    if (z > this.maxZoom) return false;
    return true;
  }
}

export default DefaultHeightmapResource;
