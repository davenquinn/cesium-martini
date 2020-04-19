import "cesium/Widgets/widgets.css"
import "./main.css"
// @ts-ignore
import * as Cesium from "cesium/Cesium"

var opts = {
  terrainProvider: Cesium.createWorldTerrain(),
  imageryProvider : Cesium.createWorldImagery({
      style : Cesium.IonWorldImageryStyle.AERIAL
  }),
  //baseLayerPicker : false,
  geocoder: false,
  //skyAtmosphere: true,
  animation: false,
  timeline: false,
  // Makes cesium not render high fps all the time
  requestRenderMode : true,
  // Use full scene buffer (respecting pixel ratio) if this is false
  useBrowserRecommendedResolution: false
}


Cesium.Ion.defaultAccessToken = process.env.CESIUM_ACCESS_TOKEN;

const domID = "cesium-container"
const g = document.createElement('div');
g.id = domID;
document.body.appendChild(g)

var viewer = new Cesium.Viewer(domID, opts)
//viewer.resolutionScale = 2
//viewer.scene.globe.enableLighting = true
//viewer.canvas.style.imageRendering = false
