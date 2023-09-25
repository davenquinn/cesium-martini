import { UserConfig } from "vite";
import cesium from "vite-plugin-cesium";

const cesiumRoot = require.resolve("cesium").replace("/index.cjs", "/Build");

console.log(cesiumRoot);

const config: UserConfig = {
  build: {
    sourcemap: true,
  },
  define: {
    "process.env": {
      NODE_DEBUG: false,
    },
  },
  plugins: [cesium({cesiumBuildPath: cesiumRoot, cesiumBuildRootPath: cesiumRoot})],
};

export default config;