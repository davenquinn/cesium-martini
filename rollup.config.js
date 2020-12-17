import pkg from "./package.json";
import babel from "rollup-plugin-babel";
import resolve from "@rollup/plugin-node-resolve";
const deps = { ...pkg.dependencies, ...pkg.peerDependencies };
// bundle web workers
import webWorkerLoader from "rollup-plugin-web-worker-loader";
import commonjs from "@rollup/plugin-commonjs";

//https://2ality.com/2017/02/babel-preset-env.html

const extensions = [".js", ".ts"];

export default {
  input: "src/index.ts", // our source file
  output: {
    file: pkg.main,
    format: "cjs",
    sourcemap: true,
    exports: "auto",
  },
  external: Object.keys(deps),
  plugins: [
    resolve({ extensions, module: true }),
    commonjs(),
    babel({
      extensions,
      exclude: "node_modules/**",
    }),
    webWorkerLoader({
      inline: true,
      targetPlatform: "browser",
      extensions: ["ts", "js"],
      external: [],
    }),
  ],
};
