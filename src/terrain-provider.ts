import {
  CesiumTerrainProvider,
  Cartographic,
  Rectangle,
  Ellipsoid,
  WebMercatorTilingScheme
} from "cesium"

// https://github.com/CesiumGS/cesium/blob/1.68/Source/Scene/MapboxImageryProvider.js#L42

class MapboxTerrainProvider extends CesiumTerrainProvider {
  constructor(opts) {
    console.log(opts)
    super(opts)
  }

  requestMapboxTile (x, y, z) {
    const access_token = process.env.MAPBOX_API_TOKEN
    const mx = this.tilingScheme.getNumberOfYTilesAtLevel(z)

    // Something wonky about our tiling scheme, perhaps
    const url =  `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z+1}/${x}/${y}.pngraw?access_token=${access_token}`

    window.fetch(url).then(res => {
      console.log(res)
    })

  }


  generateDummyTileHeader (x, y, z) {
    const tileRect = this.tilingScheme.tileXYToRectangle(x, y, z)
    const tileNativeRect = this.tilingScheme.tileXYToNativeRectangle(x, y, z)
    const tileCenter = Cartographic.toCartesian(Rectangle.center(tileRect))
    const horizonOcclusionPoint = Ellipsoid.WGS84.transformPositionToScaledSpace(
      tileCenter
    )

    return {
      centerX: tileCenter.x,
      centerY: tileCenter.y,
      centerZ: tileCenter.z,
      minHeight: 0,
      maxHeight: 0,
      boundingSphereCenterX: tileCenter.x,
      boundingSphereCenterY: tileCenter.y,
      boundingSphereCenterZ: tileCenter.z,
      boundingSphereRadius: tileNativeRect.height,
      horizonOcclusionPointX: horizonOcclusionPoint.x,
      horizonOcclusionPointY: horizonOcclusionPoint.y,
      horizonOcclusionPointZ: horizonOcclusionPoint.z
    }
  }

  requestTileGeometry (x, y, z) {
    console.log(x,y,z)
    const geom = super.requestTileGeometry(x, y, z)


    this.requestMapboxTile(x,y,z)

    return geom.then(value => {
      console.log(value)
      return value
    })
  }

}

export default MapboxTerrainProvider
