import { UserConfig } from "vite";
import cesium from "vite-plugin-cesium";
import path from "node:path";

const cesiumPath = import.meta.resolve("cesium").replace("file://", "");

const cesiumRoot = cesiumPath.replace("/Source/Cesium.js", "/Build");
const cesiumBuildPath = path.join(cesiumRoot, "Cesium");

console.log(cesiumPath);
console.log(cesiumRoot);
console.log(cesiumBuildPath);

const config: UserConfig = {
  // override the cache dir because we don't have a node_modules folder with yarn PnP
  define: {
    "process.env": {
      NODE_DEBUG: false,
    },
  },
  envPrefix: "MAPBOX_",
  envDir: path.join(__dirname, "..", ".."),
  // Not sure what the difference between cesiumBuildPath and cesiumBuildRootPath is
  plugins: [cesium({ cesiumBuildPath, cesiumBuildRootPath: cesiumRoot })],
};

export default config;
