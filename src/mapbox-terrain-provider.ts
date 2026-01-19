import { TerrainProvider } from "cesium";
import MapboxTerrainResource, {
  MapboxTerrainResourceOpts,
} from "./resources/mapbox-resource";
import { MartiniTerrainOpts, MartiniTerrainProvider } from "./terrain-provider";
import WorkerFarmTerrainDecoder from "./worker/decoder";
import MapboxTerrainWorker from "web-worker:./worker/mapbox-worker";

type MapboxTerrainOpts = Omit<MartiniTerrainOpts, "resource"> &
  MapboxTerrainResourceOpts;

export class MapboxTerrainProvider extends MartiniTerrainProvider<TerrainProvider> {
  constructor(opts: MapboxTerrainOpts = {}) {
    const resource = new MapboxTerrainResource(opts);
    const decoder = new WorkerFarmTerrainDecoder({
      worker: new MapboxTerrainWorker(),
    });

    super({
      ...opts,
      resource,
      decoder,
    });
  }
}
