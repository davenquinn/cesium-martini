const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const DotenvPlugin = require("dotenv-webpack");
const { DefinePlugin } = require("webpack");
const path = require("path");

const cesium = path.dirname(require.resolve("cesium"));
const cesiumSource = path.join(cesium, "Source");
const cesiumWorkers = "../Build/CesiumUnminified/Workers";

module.exports = {
  // Enable sourcemaps for debugging webpack's output.
  devtool: "source-map",
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      // CesiumJS module name,
      cesiumSource,
      cesium: "cesium/Source/Cesium",
    },
    // We need fallbacks for cesium source files
    fallback: {
      https: false,
      zlib: false,
      http: false,
      url: false,
      path: require.resolve("path-browserify"),
      assert: require.resolve("assert/"),
    },
  },
  module: {
    unknownContextCritical: false,
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: ["babel-loader"]
      },
      {
        test: /\.(png|svg)$/,
        use: ["file-loader"]
      },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
      // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
      {
        enforce: "pre",
        test: /\.js$/,
        loader: "source-map-loader"
      },
    ]
  },
  node: {
    fs: "empty"
  },
  amd: {
    // Enable webpack-friendly use of require in Cesium
    toUrlUndefined: true
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: "Mapbox / Cesium Terrain",
    }),
    new CopyPlugin({
      patterns: [
        { from: path.join(cesiumSource, cesiumWorkers), to: "cesium/Workers" },
        { from: path.join(cesiumSource, "Assets"), to: "cesium/Assets" },
        { from: path.join(cesiumSource, "Widgets"), to: "cesium/Widgets" },
      ],
    }),
    new DotenvPlugin({
      path: "../../.env",
    }),
    new DefinePlugin({
      // Define relative base path in cesium for loading assets
      CESIUM_BASE_URL: JSON.stringify("/cesium"),
      // Git revision information
    }),
  ]
};
