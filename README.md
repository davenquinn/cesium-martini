# Cesium-Martini

**High-performance raster elevation tiles for the CesiumJS virtual globe**

This package contains an rough but functional implementation of Cesium's
[TerrainProvider](https://cesium.com/docs/cesiumjs-ref-doc/TerrainProvider.html)
that uses MARTINI to
transform [Terrain-RGB elevation tiles](https://blog.mapbox.com/global-elevation-data-6689f1d0ba65) into
[QuantizedMeshTerrainData](https://cesium.com/docs/cesiumjs-ref-doc/QuantizedMeshTerrainData.html),
for rendering in the [CesiumJS digital globe](https://cesium.com).
It demonstrates a general technique applicable to all raster imagery
(although the Terrain-RGB format is probably ideal for streaming elevation data).
Fixes for performance and better control of rendering quality are in progress.

![Cesium-Martini](/img/cesium-martini.png)

## Installation

This package is listed on NPM as `@macrostrat/cesium-martini`. It can be installed
using the command
```
npm install --save @macrostrat/cesium-martini
```

## Development

After cloning this repository, you can build the module (using Rollup) with
`npm run build`, or build and watch for changes with `npm run watch`.
`npm run dev` bundles and runs a test application using Webpack.

Contributions in the form of bug reports and pull requests are welcome.
These can be to add functionality (e.g. optional normal-map generation) or for
performance. See list of [known limitations](#current-known-limitations) below.

## Motivation

The Cesium digital globe is a powerful platform for visualization of geospatial
data in 3D. Cesium maintains a global elevation dataset as a pre-computed terrain mesh,
which caches the computationally-intensive step of meshing height-field data
into a triangle irregular network (TIN). Unfortunately, this
[quantized mesh](https://github.com/CesiumGS/quantized-mesh) format is relatively
new, narrowly supported and tailored to Cesium itself. Additionally, supporting this
new format for third-party elevation datasets requires maintenance of additional
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
MARTINI meshes based on right-triangulated irregular networks (RTIN, *Evans et al., 1998*)
and is far quicker than the traditional TIN generation techniques.

A speedy meshing algorithm allows this data-preparation step to be handled
effectively in the browser after elevation tiles are loaded. Integrating this
toolchain into the Cesium digital globe will enables the usage of Mapbox global
data and other raster terrain layers (e.g. planetary and bathymetric data!),
without the overhead of additional processing and storage of TINs.

## Current limitations

### Data transport inefficiency

Cesium's implementations of the `TerrainProvider` interface are generally geared
towards representing static terrain meshes. The RTIN algorithm used here can
dynamically build meshes at a variety of error levels, and the input height
field are data-dense and can represent extremely detailed meshes. Right now,
meshes are generated at levels of detail that undersample the available structure
in a terrain tile — levels of detail are calibrated to what Cesium needs to
render visually pleasing output at a given zoom level.

A smarter and more parsimonious solution would save triangles for tiles to
prioritize generating meshes from lower-zoom tiles levels over requesting
higher-resolution data. Done correctly, this could lead to an extremely
data-efficient and adaptive terrain render, but some thought will have to
go into how to organize this. Ideally, someone familiar with the inner workings
of Cesium would provide some guidance here.

### Basic bugs and issues

[ ] Right now, there is a bug with rendering tile bounding boxes when
    `terrainExaggeration: 1` in the Cesium viewer
    (setting `terrainExaggeration: 1.00001` works just fine). I'm uncertain why
    this is occurring, but it is likely easily fixable.
[ ] High-resolution `@2x` tiles can be requested, but an indexing error
    prevents them from rendering properly. Additionally, the increased resolution
    is not offset by requesting tiles at a lower zoom level, so using them is not
    advisable until more broad changes are made to the renderer.
[ ] Tiles at low zoom levels must to respond to the curvature of the Earth,
    while their topographic range often yields only two triangles covering the entire
    tile. For zoom levels less than 5, we currently fall back to a basic height field,
    but we should ideally have a method that subdivides triangles to densify
    the mesh.
[ ] There is no formal testing framework to catch regressions.
[ ] TypeScript types are discarded on compilation, not checked properly.

## Prior art and relevant examples

- [Cesium quantized mesh specification](https://github.com/CesiumGS/quantized-mesh)
- [Quantized mesh viewer](https://github.com/heremaps/quantized-mesh-viewer)
- [Mapbox MARTINI](https://github.com/mapbox/martini)
- [MARTINI algorithm explanation](https://observablehq.com/@mourner/martin-real-time-rtin-terrain-mesh)
- [Evans et al., *Right-triangulated irregular networks*, 1998](https://www.cs.ubc.ca/~will/papers/rtin.pdf)
  ([journal link](https://link.springer.com/article/10.1007/s00453-001-0006-x))
- [Cesium globe materials example](https://sandcastle.cesium.com/?src=Globe%20Materials.html)
- [Cesium sky/atmosphere example](https://sandcastle.cesium.com/?src=Sky%20Atmosphere.html)
