# Cesium-Martini

Mapbox has a very nice world elevation dataset put together in its RGB terrain
tiles. These are optimized for streaming generation of contours and hillshades;
unlike [Cesium's](https://cesium.com) Quantized Mesh tiles, they are in a raster
format.

This package contains an implementation of Cesium's
[TerrainProvider](https://cesium.com/docs/cesiumjs-ref-doc/TerrainProvider.html)
that transforms Mapbox RGB elevation tiles into
[QuantizedMeshTerrainData](https://cesium.com/docs/cesiumjs-ref-doc/QuantizedMeshTerrainData.html)
instances and streams them into the WebGL core of the Cesium renderer.

## Prior art

https://github.com/heremaps/quantized-mesh-viewer
https://observablehq.com/@mourner/martin-real-time-rtin-terrain-mesh

## Relevant examples

https://sandcastle.cesium.com/?src=Globe%20Materials.html
https://sandcastle.cesium.com/?src=Sky%20Atmosphere.html
