import "./module.d.ts";
import DefaultHeightmapResource from "./resources/heightmap-resource";
import MapboxTerrainResource from "./resources/mapbox-resource";
import {
  MartiniTerrainProvider,
  StretchedTilingScheme,
} from "./terrain-provider";
import { MapboxTerrainProvider } from "./mapbox-terrain-provider";
export * from "./worker/decoder";
export * from "./worker/worker-util";

export default MapboxTerrainProvider;
export {
  MapboxTerrainProvider,
  MartiniTerrainProvider,
  DefaultHeightmapResource,
  MapboxTerrainResource,
  StretchedTilingScheme,
};
