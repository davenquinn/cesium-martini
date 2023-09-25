import { UserConfig } from "vite";
import cesium from "vite-plugin-cesium";

const cesiumRoot = require.resolve("cesium").replace("/index.cjs", "/Build");
const config: UserConfig = {
  // override the cache dir because we don't have a node_modules folder with yarn PnP
  cacheDir: ".vite",
  build: {
    sourcemap: true,
  },
  define: {
    "process.env": {
      NODE_DEBUG: false,
    },
  },
  // Not sure what the difference between cesiumBuildPath and cesiumBuildRootPath is
  plugins: [cesium({cesiumBuildPath: cesiumRoot, cesiumBuildRootPath: cesiumRoot})],
};

export default config;