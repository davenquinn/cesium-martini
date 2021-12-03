const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const DotenvPlugin = require("dotenv-webpack");
const { DefinePlugin } = require("webpack");
const path = require("path");

const cesiumSource = "node_modules/cesium/Source";
const cesiumWorkers = "../Build/CesiumUnminified/Workers";

module.exports = {
  // Enable sourcemaps for debugging webpack's output.
  devtool: "source-map",
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    alias: {
      // CesiumJS module name
      cesiumSource: path.resolve(__dirname, cesiumSource),
      lib: path.resolve(__dirname, 'src'),
    }
  },
  module: {
    unknownContextCritical: false,
    rules: [
      // Place this *before* the `ts-loader`.
      {
        test: /\.worker\.ts$/,
        loader: "worker-loader",
      },
      {
        test: /\.ts(x?)$/,
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
      // https://github.com/CesiumGS/cesium/issues/9790#issuecomment-943773870
      {
        test: /.js$/,
        include: path.resolve(__dirname, 'node_modules/cesium/Source'),
        use: { loader: require.resolve('@open-wc/webpack-import-meta-loader') }
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
    new HtmlWebpackPlugin({ title: "Mapbox / Cesium Terrain" }),
    new CopyPlugin([
      { from: path.join(cesiumSource, cesiumWorkers), to: "Workers" }
    ]),
    new CopyPlugin([{ from: path.join(cesiumSource, "Assets"), to: "Assets" }]),
    new CopyPlugin([
      { from: path.join(cesiumSource, "Widgets"), to: "Widgets" }
    ]),
    new DotenvPlugin(),
    new DefinePlugin({
      // Define relative base path in cesium for loading assets
      CESIUM_BASE_URL: JSON.stringify("/")
    })
  ]
};
