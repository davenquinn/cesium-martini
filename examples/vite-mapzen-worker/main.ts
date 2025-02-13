import "./main.css";
import "cesium/Source/Widgets/widgets.css";
import * as Cesium from "cesium";
// Import @types/cesium to use along with CesiumJS
import { MartiniTerrainProvider } from "../..";
import { DefaultHeightmapResource } from "../../src/resources/heightmap-resource";
import { WorkerFarmTerrainDecoder } from "../../src/worker/decoder";

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

let satellite = new Cesium.MapboxImageryProvider({
  mapId: "mapbox.satellite",
  maximumLevel: 19,
  accessToken: import.meta.env.MAPBOX_API_TOKEN,
});

const opts = {
  terrainProvider, //: createWorldTerrain(),
  // imageryProvider: Cesium.createWorldImagery({
  //   style: Cesium.IonWorldImageryStyle.AERIAL,
  // }),
  // @ts-ignore
  skyBox: false as false,
  baseLayerPicker: false,
  geocoder: false,
  skyAtmosphere: false as false,
  animation: false,
  timeline: false,
  // Makes cesium not render high fps all the time
  requestRenderMode: true,
  // Use full scene buffer (respecting pixel ratio) if this is false
  useBrowserRecommendedResolution: false,
  // We have a bug in the tile bounding box calculation somewhere.
  terrainExaggeration: 1.0,
  baseLayer: new Cesium.ImageryLayer(satellite),
};

const domID = "cesium-container";
const g = document.createElement("div");
g.id = domID;
document.body.appendChild(g);

const clat = -21.133786;
const clon = 14.5481193;

const viewer = new Cesium.Viewer(domID, opts);
// Quadtree props: don't preload ancestors

//viewer.scene.globe.baseColor = Cesium.Color.AQUAMARINE
// @ts-ignore
//viewer.scene.globe._surface._tileProvider._debug.wireframe = true
// @ts-ignore
viewer.extend(Cesium.viewerCesiumInspectorMixin);
viewer.scene.debugShowFramesPerSecond = true;

const extent = Cesium.Cartesian3.fromDegrees(clon, clat - 0.3, 8000);
viewer.camera.setView({
  destination: extent,
  orientation: {
    heading: Cesium.Math.toRadians(0), // east, default value is 0.0 (north)
    pitch: Cesium.Math.toRadians(-15), // default value (looking down)
    roll: 0.0, // default value
  },
});

//viewer.resolutionScale = 2
//viewer.scene.globe.enableLighting = true
//viewer.canvas.style.imageRendering = false
