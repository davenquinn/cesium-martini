# Cesium-Martini

Mapbox maintains a multiscale global elevation dataset available in their clever
[terrain-RGB](https://blog.mapbox.com/global-elevation-data-6689f1d0ba65)
format, which bridges web standard file formats (PNG images) with standard GIS
patterns for representing terrain. The tiles are optimized for streaming generation of
contours and hillshades; as a raster format and are a bit more
data-dense than [Cesium's](https://cesium.com) Quantized Mesh tiles, since
heights are encoded at known locations in the x-y plane. More critically,
rasters are the standard representation of elevation data across the
geosciences, and many pipelines are available to create and modify raster images.
Consequently, basically any elevation dataset can be easily rescaled to the Terrain-RGB
format.

Cesium's pre-computed 3D terrain mesh has one key advantage over streaming
raster data — it saves the computationally-intensive step of meshing
height-field data into a triangle interpolated network (TIN) on the client.
However, the recent [MARTINI](https://github.com/mapbox/martini) project by
[Vladimir Agafonkin](https://agafonkin.com/) at Mapbox demonstrates a [nifty
approach](https://observablehq.com/@mourner/martin-real-time-rtin-terrain-mesh)
based on right-triangulated irregular networks (RTIN, *Evans et al., 1998*)
that is a key breakthrough in using raster data to drive 3D terrain.

The RTIN algorithm is far quicker than the traditional TIN generation
techniques, allowing it to be handled effectively in the browser when tiles are
loaded! Integrating this toolchain into the Cesium digital globe will enable the
usage of Mapbox global data and other raster terrain layers (e.g. planetary and
bathymetric data!), without the overhead of additional processing and storage
into TINs.

This package contains an rough but functional implementation of Cesium's
[TerrainProvider](https://cesium.com/docs/cesiumjs-ref-doc/TerrainProvider.html)
that uses MARTINI to transform Terrain-RGB elevation tiles into
[QuantizedMeshTerrainData](https://cesium.com/docs/cesiumjs-ref-doc/QuantizedMeshTerrainData.html),
instances and streams them into the WebGL core of the Cesium renderer.
It demonstrates a general technique applicable to all raster imagery
(although the Terrain-RGB format is probably ideal for streaming elevation data).
Fixes for performance and better control of rendering quality are in progress.

## Prior art and relevant examples

- [Quantized mesh viewer](https://github.com/heremaps/quantized-mesh-viewer)
- [Mapbox MARTINI](https://github.com/mapbox/martini)
- [MARTINI algorithm explanation](https://observablehq.com/@mourner/martin-real-time-rtin-terrain-mesh)
- [Evans et al., *Right-triangulated irregular networks*, 1998](https://www.cs.ubc.ca/~will/papers/rtin.pdf)
  ([journal link](https://link.springer.com/article/10.1007/s00453-001-0006-x))
- [Cesium globe materials example](https://sandcastle.cesium.com/?src=Globe%20Materials.html)
- [Cesium sky/atmosphere example](https://sandcastle.cesium.com/?src=Sky%20Atmosphere.html)

## Current known limitations

### Basic bugs

- Right now, there is a bug with rendering tile bounding boxes when
  `terrainExaggeration: 1` in the Cesium viewer
  (setting `terrainExaggeration: 1.00001` works just fine). I'm uncertain why
  this is occurring, but it is likely easily fixable.
- High-resolution `@2x` tiles can be requested, but an indexing error
  prevents them from rendering properly. Additionally, the increased resolution
  is not offset by requesting tiles at a lower zoom level, so using them is not
  advisable until more broad changes are made to the renderer.
- Tiles at low zoom levels must to respond to the curvature of the Earth,
  while their topographic range often yields only two triangles covering the entire
  tile. For zoom levels less than 5, we currently fall back to a basic height field,
  but we should ideally have a method that subdivides triangles to densify
  the mesh.

### Data transport inefficiency

Cesium's implementations of the `TerrainProvider` interface are generally
geared towards representing static terrain meshes. The RTIN algorithm used here
can dynamically builds meshes at a variety of error levels, and the input height
field can represent extremely detailed meshes. Right now, tiles are generated at
hard-coded error levels, which means that increased detail can only be rendered
by requesting a new tile. The net effect is that we are significantly
over-requesting detailed data at high zoom levels.

A smarter solution would prioritize more detailed meshes from lower-zoom tiles levels over requesting
higher-resolution data. Done correctly, this could lead to an extremely
data-efficient and adaptive terrain render, but significant thought will have to
go into how to organize this. Ideally, someone familiar with the inner workings of
Cesium would provide some guidance here.

## Contributing

Contributions to add functionality (e.g. optional normal-map generation) or for
performance and bug fixes are welcome.
