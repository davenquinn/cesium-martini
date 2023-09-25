import "cesium/Source/Widgets/widgets.css";
import * as Cesium from "cesium"
import "./main.css";
// Import @types/cesium to use along with CesiumJS
import TerrainProvider from "../../..";

// // @ts-ignore
const terrainProvider = new TerrainProvider({
  requestVertexNormals: false,
  requestWaterMask: false,
  accessToken: import.meta.env.MAPBOX_API_TOKEN,
  // TODO: skipOddLevels breaks request render mode (again) 
  //skipOddLevels: true,
  highResolution: true,
});

let satellite = new Cesium.MapboxImageryProvider({
  mapId: "mapbox.satellite",
  maximumLevel: 19,
  accessToken: import.meta.env.MAPBOX_API_TOKEN,
});

var opts = {
  terrainProvider,
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
  baseLayer: new Cesium.ImageryLayer(satellite)
};

const domID = "cesium-container";
const g = document.createElement("div");
g.id = domID;
document.body.appendChild(g);

var clat = -21.133786;
var clon = 14.5481193;

const rect = Cesium.Rectangle.fromDegrees(
  clon - 0.01,
  clat - 0.01,
  clon + 0.01,
  clat + 0.01
);
//Cesium.Camera.DEFAULT_VIEW_RECTANGLE = rect;
//Cesium.Camera.DEFAULT_VIEW_FACTOR = 0.005;
//Cesium.Camera.DEFAULT_VIEW_OFFSET = new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-10), 1)

var viewer = new Cesium.Viewer(domID, opts);
// Quadtree props: don't preload ancestors

//viewer.scene.globe.baseColor = Cesium.Color.AQUAMARINE
// @ts-ignore
//viewer.scene.globe._surface._tileProvider._debug.wireframe = true
// @ts-ignore
viewer.extend(Cesium.viewerCesiumInspectorMixin);
viewer.scene.debugShowFramesPerSecond = true;

var extent = Cesium.Cartesian3.fromDegrees(clon, clat - 0.3, 8000);
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
