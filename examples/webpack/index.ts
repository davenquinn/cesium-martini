import "core-js/stable";
import TerrainProvider from "../..";
import { buildExample } from "../_shared";

// @ts-ignore
const terrainProvider = new TerrainProvider({
  requestVertexNormals: false,
  requestWaterMask: false,
  accessToken: process.env.MAPBOX_API_TOKEN,
  skipOddLevels: false,
  highResolution: false,
});

// @ts-ignore
buildExample(terrainProvider, process.env.MAPBOX_API_TOKEN);
