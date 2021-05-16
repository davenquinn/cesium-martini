const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const DotenvPlugin = require("dotenv-webpack");
const { DefinePlugin } = require("webpack");
const path = require("path");

const cesiumSource = "node_modules/cesium/Source";
const cesiumWorkers = "../Build/Cesium/Workers";

module.exports = {
  // Enable sourcemaps for debugging webpack's output.
  devtool: "source-map",
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    alias: {
      // CesiumJS module name
      cesiumSource: path.resolve(__dirname, cesiumSource),
    },
  },
  module: {
    unknownContextCritical: false,
    rules: [
      {
        test: /\.ts(x?)$/,
        exclude: /node_modules/,
        use: ["babel-loader"],
      },
      {
        test: /\.(png|svg)$/,
        use: ["file-loader"],
      },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
      // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
      {
        enforce: "pre",
        test: /\.js$/,
        loader: "source-map-loader",
      },
    ],
  },
  node: {
    fs: "empty",
  },
  entry: "./example/index.ts",
  output: {
    path: path.join(__dirname, "example-dist"),
    sourcePrefix: "",
  },
  amd: {
    // Enable webpack-friendly use of require in Cesium
    toUrlUndefined: true,
  },
  plugins: [
    new HtmlWebpackPlugin({ title: "Mapbox / Cesium Terrain" }),
    new CopyPlugin([
      { from: path.join(cesiumSource, cesiumWorkers), to: "Workers" },
    ]),
    new CopyPlugin([{ from: path.join(cesiumSource, "Assets"), to: "Assets" }]),
    new CopyPlugin([
      { from: path.join(cesiumSource, "Widgets"), to: "Widgets" },
    ]),
    new DotenvPlugin(),
    new DefinePlugin({
      // Define relative base path in cesium for loading assets
      CESIUM_BASE_URL: JSON.stringify("/"),
    }),
  ],
};
