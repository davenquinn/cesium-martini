# Cesium-Martini

**On-the-fly meshing of raster elevation tiles for the CesiumJS virtual globe**

![Cesium-Martini](/img/cesium-martini.png)

This package contains a preliminary but functional implementation of a Cesium
[TerrainProvider](https://cesium.com/docs/cesiumjs-ref-doc/TerrainProvider.html)
that uses right-triangular irregular networks (RTIN) pioneered by
[Mapbox's Martini](https://observablehq.com/@mourner/martin-real-time-rtin-terrain-mesh) to
transform [Terrain-RGB elevation tiles](https://blog.mapbox.com/global-elevation-data-6689f1d0ba65) into
[quantized mesh terrain](https://github.com/CesiumGS/quantized-mesh),
for rendering in the [CesiumJS digital globe](https://cesium.com).
The module provides a general technique applicable to all raster imagery
(although the Terrain-RGB format is near-ideal for streaming elevation data).
Fixes for performance and better control of rendering quality are in progress.

This module was created to support our geologic map visualization work
at [Macrostrat](https://macrostrat.org) and as a building block
for future rich geoscience visualizations.

## Installation

This package is listed on NPM as `@macrostrat/cesium-martini`. It can be installed
using the command

```
npm install --save @macrostrat/cesium-martini
```

## Development

After cloning this repository, you can build the module (using Rollup) with
`npm run build`, or build and watch for changes with `npm run watch`.

To run an example application, add `MAPBOX_API_TOKEN=<your-mapbox-token>` to a `.env` file.
in the root of this repository. `npm run dev` bundles and runs the test
application, which runs in the Webpack development server on `http://localhost:8080`.

Contributions in the form of bug reports and pull requests are welcome.
These can be to add functionality (e.g. optional normal-map generation) or for
performance. See list of [known limitations](#current-known-limitations) below.

## Motivation

The Cesium digital globe is a powerful platform for visualization of geospatial
data in 3D. Cesium maintains a global elevation dataset as a prebuilt terrain mesh,
which caches the computationally-intensive step of meshing height-field data
into a triangle irregular network (TIN). Unfortunately, this
[quantized mesh](https://github.com/CesiumGS/quantized-mesh) format is relatively
new, narrowly supported and tailored to Cesium itself. Going forward, supporting
a TIN format for elevation datasets requires maintenance of significant single-purpose
processing pipelines and storage resources.

Mapbox maintains a multiscale global elevation dataset in their clever
[terrain-RGB](https://blog.mapbox.com/global-elevation-data-6689f1d0ba65)
format, which bridges web standard file formats (PNG images) with traditional raster GIS
formats for representing terrain. Rasters are the standard representation of elevation data across the
geosciences, and many pipelines are available to create and modify raster images.
Basically any elevation dataset can be easily rescaled to the Terrain-RGB
format, but the jump from there to a "Quantized mesh" is more complicated.

Recently, the [MARTINI](https://github.com/mapbox/martini) project by
[Vladimir Agafonkin](https://agafonkin.com/) at Mapbox demonstrated an
[elegant algorithmic approach](https://observablehq.com/@mourner/martin-real-time-rtin-terrain-mesh)
that sidesteps this issue.
MARTINI meshes based on right-triangulated irregular networks (RTIN, _Evans et al., 1998_)
and is far quicker than the traditional TIN generation techniques.

A speedy meshing algorithm allows this data-preparation step to be handled
in the browser after elevation tiles are loaded. Integrating this
toolchain into the Cesium digital globe enables the usage of Mapbox global
data and other raster terrain layers (e.g. planetary and bathymetric data!),
without adding overhead of TIN processing and storage.

## Current limitations

### Data transport inefficiency

Cesium's implementations of the `TerrainProvider` interface are generally geared
towards representing static terrain meshes. The RTIN algorithm used here can
dynamically build meshes at a variety of error levels, and the input height
field are data-dense and can represent extremely detailed meshes. Right now,
meshes are generated at levels of detail that undersample the available structure
in a terrain tile — levels of detail are calibrated to what Cesium needs to
render visually pleasing output at a given zoom level.

A smarter and more parsimonious solution would use much lower zoom levels
for terrain than imagery, using the full resolution of the dataset in
mesh construction. Done correctly, this could lead to an extremely
data-efficient and adaptive terrain render, but this seems to run somewhat
counter to how Cesium internally manages levels of detail, and some thought will have to
go into how to organize this. Ideally, someone familiar with the inner workings
of Cesium would provide some guidance here.

### Basic bugs and issues

- [x] Right now, there is a bug with rendering tile bounding boxes when
      `terrainExaggeration: 1` in the Cesium viewer
      (setting `terrainExaggeration: 1.00001` works just fine). I'm uncertain why
      this is occurring, but it is likely easily fixable.
- [x] High-resolution `@2x` tiles can be requested, but an indexing error
      prevents them from rendering properly.
- [x] The increased resolution of `@2x` tiles can be used, but doing so forces
      the loading of high resolution overlay imagery across a wide area, so using them is not
      advisable until broader changes are made to the renderer.
- [x] Tiles at low zoom levels must to respond to the curvature of the Earth,
      while their topographic range often yields only two triangles covering the entire
      tile. For zoom levels less than 5, we currently fall back to a basic height field,
      but we should ideally have a method that subdivides triangles to densify
      the mesh.
- [ ] There is no formal testing framework to catch regressions.
- [ ] TypeScript types are discarded on compilation rather than checked properly.

## Prior art and relevant examples

- [Mapbox MARTINI](https://github.com/mapbox/martini)
- [MARTINI algorithm explanation](https://observablehq.com/@mourner/martin-real-time-rtin-terrain-mesh)
- [Evans et al., _Right-triangulated irregular networks_, 1998](https://www.cs.ubc.ca/~will/papers/rtin.pdf)
  ([journal link](https://link.springer.com/article/10.1007/s00453-001-0006-x))
- [Cesium quantized mesh specification](https://github.com/CesiumGS/quantized-mesh)
- [Quantized mesh viewer](https://github.com/heremaps/quantized-mesh-viewer)
- [Cesium globe materials example](https://sandcastle.cesium.com/?src=Globe%20Materials.html)
- [Cesium sky/atmosphere example](https://sandcastle.cesium.com/?src=Sky%20Atmosphere.html)

## TODO

- Make compatible with Mapbox's new `terrain-dem` tileset if possible
- Better masking of unavailable tiles
- Bathymetry option
- Tie to hillshade generator so the same tiles are loaded
- Caps for poles

Pull requests for any and all of these priorities are appreciated!

## Changelog

### `[1.1.3]`: June 2021

- Fix memory leak where `ArrayBuffer`s were retained due to console logging.

### `[1.1.2]`: May 2021

- Fixed a bug with loading high-resolution tiles
- Added a `skipOddLevels` option that significantly reduces the load of zooming through many terrain levels.
  This is enabled by default.
- Greatly increase skirt height

### `[1.1.0]`: May 2021

- Fixed a bug with tile occlusion south of the equator for high-detail tiles
- A quicker and more robust mesh-densification algorithm for low zoom levels
- More configurability with options like `detailScalar` and `minimumErrorLevel`.
- Updated README and examples
- Uses web workers for rapid tile generation off the main thread
