import "core-js/stable";
import "regenerator-runtime/runtime";

import "cesiumSource/Widgets/widgets.css";
const Cesium: any = require("cesiumSource/Cesium");
// Import @types/cesium to use along with CesiumJS
import { MapboxImageryProvider } from "cesium";
import TerrainProvider from "../../dist";
import { render } from "react-dom";
import { useRef, useEffect } from "react";
import h from "@macrostrat/hyper";
import { Viewer, ImageryLayer, useCesium } from "resium";

const terrainProvider = new TerrainProvider({
  // @ts-ignore
  hasVertexNormals: false,
  hasWaterMask: false,
  accessToken: process.env.MAPBOX_API_TOKEN,
  highResolution: false,
  credit: "Mapbox",
});

const SatelliteLayer = (props) => {
  let satellite = useRef(
    new MapboxImageryProvider({
      mapId: "mapbox.satellite",
      maximumLevel: 19,
      accessToken: process.env.MAPBOX_API_TOKEN,
    })
  );

  return h(ImageryLayer, { imageryProvider: satellite.current, ...props });
};

//const terrainProvider2 = createWorldTerrain();

function Inspector() {
  const { viewer } = useCesium();
  useEffect(() => {
    viewer?.extend(Cesium.viewerCesiumInspectorMixin, {});
  }, [viewer]);
  return null;
}

function CesiumView() {
  return h(
    Viewer,
    {
      full: true,
      terrainProvider: terrainProvider,
      imageryProvider: false,
    },
    [h(SatelliteLayer), h(Inspector)]
  );
}
render(h(CesiumView), document.body);
document.title = "Mapbox / Resium Terrain Example";
