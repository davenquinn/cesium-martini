import pkg from "./package.json";
import babel from "@rollup/plugin-babel";
import resolve from "@rollup/plugin-node-resolve";
const deps = { ...pkg.dependencies, ...pkg.peerDependencies };
// bundle web workers
import webWorkerLoader from "rollup-plugin-web-worker-loader";
import commonjs from "@rollup/plugin-commonjs";

//https://2ality.com/2017/02/babel-preset-env.html

const extensions = [".js", ".ts"];

let external = Object.keys(deps);
delete external["maplibre-gl"];

export default {
  input: "src/index.ts", // our source file
  output: {
    file: pkg.main,
    format: "cjs",
    sourcemap: true,
    exports: "auto",
  },
  external,
  plugins: [
    resolve({ extensions, module: true }),
    commonjs(),
    babel({
      extensions,
      include: ["src/**/*.ts", "node_modules/maplibre-gl/**/*.ts"],
    }),
    webWorkerLoader({
      inline: true,
      targetPlatform: "browser",
      extensions: ["ts", "js"],
      external: [],
    }),
  ],
};
