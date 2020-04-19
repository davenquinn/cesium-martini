const HtmlWebpackPlugin = require('html-webpack-plugin')
const {join} = require("path")

module.exports = {
  // Enable sourcemaps for debugging webpack's output.
  devtool: "source-map",
  resolve: {
    extensions: [".ts", ".tsx", ".js"]
  },
  module: {
    rules: [
      {
        test: /\.ts(x?)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader"
          }
        ]
      },
      {test: /\.css$/, use: ["style-loader", 'css-loader' ]},
      // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
      {
        enforce: "pre",
        test: /\.js$/,
        loader: "source-map-loader"
      }
    ]
  },
  entry: "./src/index.ts",
  output: {
    path: join(__dirname, "dist")
  },
  plugins: [
    new HtmlWebpackPlugin({title: "Mapbox / Cesium Terrain"}),
  ]
};
