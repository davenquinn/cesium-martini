import "cesiumSource/Widgets/widgets.css"
import "./main.css"
const Cesium: any = require('cesiumSource/Cesium')
// Import @types/cesium to use along with CesiumJS
import { Viewer, Ion, IonResource, CesiumTerrainProvider } from 'cesium';
import TerrainProvider from "./terrain-provider"

const terrainProvider = new TerrainProvider({
    // @ts-ignore
    url: IonResource.fromAssetId("1"),
    requestVertexNormals: false,
    requestWaterMask: false
});

var opts = {
  terrainProvider,
  imageryProvider : new Cesium.GridImageryProvider(),
  // @ts-ignore
  skyBox: false as false,
  baseLayerPicker : false,
  geocoder: false,
  skyAtmosphere: false as false,
  animation: false,
  timeline: false,
  // Makes cesium not render high fps all the time
  //requestRenderMode : true,
  // Use full scene buffer (respecting pixel ratio) if this is false
  useBrowserRecommendedResolution: false,
  terrainExaggeration: 1.5
}

Ion.defaultAccessToken = process.env.CESIUM_ACCESS_TOKEN;

const domID = "cesium-container"
const g = document.createElement('div');
g.id = domID;
document.body.appendChild(g)

var clon = -21.133786
var clat = 14.5481193

var viewer = new Viewer(domID, opts)

//var extent = Cesium.Rectangle.fromDegrees(clat-1, clon-0.5, clat-1, clon+0.5);
var extent = Cesium.Cartesian3.fromDegrees(clat, clon-0.3, 10000)

viewer.scene.globe.baseColor = Cesium.Color.AQUAMARINE
// @ts-ignore
viewer.scene.globe._surface._tileProvider._debug.wireframe = true
// @ts-ignore
//viewer.extend(Cesium.viewerCesiumInspectorMixin)


viewer.camera.setView({
    destination : extent,
    orientation: {
        heading : Cesium.Math.toRadians(0), // east, default value is 0.0 (north)
        pitch : Cesium.Math.toRadians(-15),    // default value (looking down)
        roll : 0.0                             // default value
    }
});

//viewer.resolutionScale = 2
//viewer.scene.globe.enableLighting = true
//viewer.canvas.style.imageRendering = false
