import "core-js/stable";
import "./main.css";
import "cesium/Source/Widgets/widgets.css";
const Cesium: any = require("cesium/Source/Cesium");
// Import @types/cesium to use along with CesiumJS
import { MapboxImageryProvider } from "cesium";
import TerrainProvider from "../../..";
import { createRoot } from "react-dom/client";
import { useRef, useEffect } from "react";
import h from "@macrostrat/hyper";
import { Viewer, ImageryLayer, useCesium } from "resium";

console.log("Cesium version:", Cesium.VERSION);

const terrainProvider = new TerrainProvider({
  // @ts-ignore
  hasVertexNormals: false,
  hasWaterMask: false,
  accessToken: process.env.MAPBOX_API_TOKEN,
  highResolution: true,
  credit: "Mapbox",
});

const SatelliteLayer = (props) => {
  let satellite = useRef(
    new MapboxImageryProvider({
      mapId: "mapbox.satellite",
      maximumLevel: 19,
      accessToken: process.env.MAPBOX_API_TOKEN,
    }),
  );

  return h(ImageryLayer, { imageryProvider: satellite.current, ...props });
};

//const terrainProvider2 = createWorldTerrain();

function Inspector() {
  const { viewer } = useCesium();
  useEffect(() => {
    if (viewer == null) return;
    viewer.extend(Cesium.viewerCesiumInspectorMixin, {});
    viewer.scene.requestRenderMode = true;
    viewer.scene.debugShowFramesPerSecond = true;
  }, [viewer]);
  return null;
}

function CesiumView() {
  return h(
    Viewer,
    {
      full: true,
      terrainProvider: terrainProvider,
      //imageryProvider: false,
      animation: false,
      baseLayerPicker: false,
      timeline: false,
    },
    [h(SatelliteLayer), h(Inspector)],
  );
}

const root = document.createElement("div");
document.body.appendChild(root);

const reactRoot = createRoot(root);

reactRoot.render(h(CesiumView));

document.title = "Mapbox / Resium Terrain Example";
