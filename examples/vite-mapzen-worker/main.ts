import { MartiniTerrainProvider } from "../..";
import { DefaultHeightmapResource } from "../../src/resources/heightmap-resource";
import { WorkerFarmTerrainDecoder } from "../../src/worker/decoder";
import { buildExample } from "../_shared";

const terrariumWorker = new Worker(
  new URL("./mapzen.worker", import.meta.url),
  { type: "module" },
);

// Mapzen API discontinued, alternate source required
const terrainResource = new DefaultHeightmapResource({
  //url: "https://tile.mapzen.com/mapzen/terrain/v1/terrarium/{z}/{x}/{y}.png?api_key=XXX",
  //url: "http://localhost:8080/public/terrain1/{z}/{x}/{reverseY}.png",
  url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
  skipOddLevels: true,
  maxZoom: 15,
});

// Terrarium format utilises a different encoding scheme to Mapbox Terrain-RGB
// @ts-ignore
const terrainDecoder = new WorkerFarmTerrainDecoder({
  worker: terrariumWorker,
});

// Construct terrain provider with Mapzen datasource and custom RGB decoding
// @ts-ignore
const terrainProvider = new MartiniTerrainProvider({
  resource: terrainResource,
  decoder: terrainDecoder,
});

buildExample(terrainProvider, import.meta.env.MAPBOX_API_TOKEN);
