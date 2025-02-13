import "core-js/stable";
// @ts-ignore
import {
  MartiniTerrainProvider,
  DefaultHeightmapResource,
  WorkerFarmTerrainDecoder,
} from "lib";

import TerrariumWorker from "./mapzen.worker";
import { buildExample } from "../_shared";

// Mapzen API discontinued, alternate source required
const terrainResource = new DefaultHeightmapResource({
  //url: "https://tile.mapzen.com/mapzen/terrain/v1/terrarium/{z}/{x}/{y}.png?api_key=XXX",
  //url: "http://localhost:8080/public/terrain1/{z}/{x}/{reverseY}.png",
  url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
  skipOddLevels: false,
  maxZoom: 15,
});

// Terrarium format utilises a different encoding scheme to Mapbox Terrain-RGB
// @ts-ignore
const terrainDecoder = new WorkerFarmTerrainDecoder({
  worker: new TerrariumWorker(),
});

// Construct terrain provider with Mapzen datasource and custom RGB decoding
// @ts-ignore
const terrainProvider = new MartiniTerrainProvider({
  resource: terrainResource,
  decoder: terrainDecoder,
});

buildExample(terrainProvider, process.env.MAPBOX_API_TOKEN);
