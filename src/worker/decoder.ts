import { HeightmapTerrainData, QuantizedMeshTerrainData } from "cesium";
import { TileCoordinates } from "../terrain-provider";
import WorkerFarm from "./worker-farm";
import { TerrainWorkerInput, QuantizedMeshResult } from "./worker-util";

export interface TerrainDecoder {
  requestTileGeometry: (
    coords: TileCoordinates,
    processFunction: (
      coords: TileCoordinates,
    ) => Promise<HeightmapTerrainData | QuantizedMeshTerrainData>,
  ) => Promise<HeightmapTerrainData | QuantizedMeshTerrainData> | undefined;
  decodeTerrain: (
    params: TerrainWorkerInput,
    data: ArrayBufferLike,
  ) => Promise<QuantizedMeshResult>;
}

export class DefaultTerrainDecoder implements TerrainDecoder {
  inProgress: number = 0;
  maxRequests: number = 2;

  requestTileGeometry(coords, processFunction) {
    if (this.inProgress > this.maxRequests) return undefined;
    this.inProgress += 1;
    return processFunction(coords).finally(() => {
      this.inProgress -= 1;
    });
  }

  decodeTerrain(params, data) {
    return Promise.resolve(null);
  }
}

interface WorkerFarmDecoderOpts {
  maxWorkers?: number;
  worker?: Worker;
}

export class WorkerFarmTerrainDecoder extends DefaultTerrainDecoder {
  farm: WorkerFarm;

  constructor(opts: WorkerFarmDecoderOpts) {
    super();
    this.farm = new WorkerFarm({ worker: opts.worker });
    this.maxRequests = opts.maxWorkers ?? 5;
  }

  decodeTerrain(params, data) {
    return this.farm.scheduleTask(params, [
      data,
    ]) as Promise<QuantizedMeshResult>;
  }
}

export default WorkerFarmTerrainDecoder;
