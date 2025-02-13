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
  mode: "development",
  devtool: "source-map",
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      // CesiumJS module name,
      cesiumSource,
      "cesium/Source": cesiumSource,
      cesium: "cesium/Source/Cesium",
      lib: path.resolve(__dirname, "..", "..", "dist"),
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
      // Place this *before* the `ts-loader`.
      {
        test: /\.worker\.ts$/,
        use: [require.resolve("worker-loader")],
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: require.resolve("babel-loader"),
            options: {
              presets: [
                require.resolve("@babel/preset-env"),
                require.resolve("@babel/preset-typescript"),
              ],
            },
          },
        ],
      },
      {
        test: /\.(png|svg)$/,
        use: [require.resolve("file-loader")],
      },
      {
        test: /\.css$/,
        use: [require.resolve("style-loader"), require.resolve("css-loader")],
      },
    ],
  },
  amd: {
    // Enable webpack-friendly use of require in Cesium
    toUrlUndefined: true,
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
  ],
};
