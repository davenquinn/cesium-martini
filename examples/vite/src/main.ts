import TerrainProvider from "../../..";
import { buildExample } from "../../_shared";

// // @ts-ignore
const terrainProvider = new TerrainProvider({
  requestVertexNormals: false,
  requestWaterMask: false,
  accessToken: import.meta.env.MAPBOX_API_TOKEN,
  highResolution: true,
  skipZoomLevels(z: number) {
    return z % 3 != 0;
  },
});

buildExample(terrainProvider, import.meta.env.MAPBOX_API_TOKEN);
