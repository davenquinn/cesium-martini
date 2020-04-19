import Cesium, {
  CesiumTerrainProvider,
  Cartographic,
  Rectangle,
  Ellipsoid,
  WebMercatorTilingScheme,
  Math,
  Cartesian3,
  BoundingSphere,
  QuantizedMeshTerrainData,
} from "cesium"
import OrientedBoundingBox from "cesium/Source/Core/OrientedBoundingBox"
import ndarray from 'ndarray'
import getPixels from 'get-pixels'
import Martini from '@mapbox/martini'

function mapboxTerrainToGrid(png: ndarray<number>) {
    const gridSize = png.shape[0] + 1;
    const terrain = new Float32Array(gridSize * gridSize);
    const tileSize = png.shape[0];

    // decode terrain values
    for (let y = 0; y < tileSize; y++) {
        for (let x = 0; x < tileSize; x++) {
            const r = png.get(x,y,0);
            const g = png.get(x,y,1);
            const b = png.get(x,y,2);
            terrain[y * gridSize + x] = (r * 256 * 256 + g * 256.0 + b) / 10.0 - 10000.0;
        }
    }
    // backfill right and bottom borders
    for (let x = 0; x < gridSize - 1; x++) {
        terrain[gridSize * (gridSize - 1) + x] = terrain[gridSize * (gridSize - 2) + x];
    }
    for (let y = 0; y < gridSize; y++) {
        terrain[gridSize * y + gridSize - 1] = terrain[gridSize * y + gridSize - 2];
    }
    return terrain;
}

// https://github.com/CesiumGS/cesium/blob/1.68/Source/Scene/MapboxImageryProvider.js#L42

class MapboxTerrainProvider extends CesiumTerrainProvider {
  martini: any
  constructor(opts) {
    console.log(opts)
    super(opts)
    this.martini = new Martini(257);

  }

  async getPixels(url: string, type=""): Promise<ndarray<number>> {
    return new Promise((resolve, reject)=>{
      getPixels(url, type, (err, array)=>{
        if (err != null) reject(err)
        resolve(array)
      })
    })
  }

  async requestMapboxTile (x, y, z) {
    const access_token = process.env.MAPBOX_API_TOKEN
    const mx = this.tilingScheme.getNumberOfYTilesAtLevel(z)
    const err = this.getLevelMaximumGeometricError(z+1)


    // Something wonky about our tiling scheme, perhaps
    // 12/2215/2293 @2x
    const url =  `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z+1}/${x}/${y}.pngraw?access_token=${access_token}`
    const pxArray = await this.getPixels(url)
    const terrain = mapboxTerrainToGrid(pxArray)

    // set up mesh generator for a certain 2^k+1 grid size
    // generate RTIN hierarchy from terrain data (an array of size^2 length)
    const tile = this.martini.createTile(terrain);

    // get a mesh (vertices and triangles indices) for a 10m error
    console.log(`Error level: ${err}`)
    const mesh = tile.getMesh(err);

    const terrainTile = this.createQuantizedMeshData(x, y, z, tile, mesh)

    console.log(tile, mesh, terrainTile)
    return terrainTile

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

  createQuantizedMeshData (x, y, z, tile, mesh) {
    const err = this.getLevelMaximumGeometricError(z+1)
    const skirtHeight = err*5

    const header = this.generateDummyTileHeader(x,y,z)

    const tileRect = this.tilingScheme.tileXYToRectangle(x, y, z)
    const boundingSphereCenter = new Cartesian3(
      header.boundingSphereCenterX,
      header.boundingSphereCenterY,
      header.boundingSphereCenterZ
    )
    const boundingSphere = new BoundingSphere(
      boundingSphereCenter,
      header.boundingSphereRadius
    )
    const horizonOcclusionPoint = new Cartesian3(
      header.horizonOcclusionPointX,
      header.horizonOcclusionPointY,
      header.horizonOcclusionPointZ
    )
    let orientedBoundingBox

    if (tileRect.width < Math.PI_OVER_TWO + Math.EPSILON5) {
      // @ts-ignore
      orientedBoundingBox = OrientedBoundingBox.fromRectangle(
        tileRect,
        header.minHeight,
        header.maxHeight
      )
    }


    /*
    new QuantizedMeshTerrainData({
      minimumHeight: header.minHeight,
      maximumHeight: header.maxHeight,
      quantizedVertices: vertexData,
      indices: mesh.triangleIndices,
      boundingSphere: boundingSphere,
      horizonOcclusionPoint: horizonOcclusionPoint,
      westIndices: null,
      southIndices: null,
      eastIndices: null,
      northIndices: null,
      westSkirtHeight: 100,
      southSkirtHeight: 100,
      eastSkirtHeight: 100,
      northSkirtHeight: 100,
      childTileMask: 15,
      // @ts-ignore
      orientedBoundingBox
    })
    */

    return new QuantizedMeshTerrainData({
        minimumHeight : -100,
        maximumHeight : 500,
        quantizedVertices : new Uint16Array([// order is SW NW SE NE
                                             // longitude
                                             0, 0, 32767, 32767,
                                             // latitude
                                             0, 32767, 0, 32767,
                                             // heights
                                             16384, 0, 32767, 16384]),
        indices : new Uint16Array([0, 3, 1,
                                   0, 2, 3]),
        boundingSphere,
        // @ts-ignore
        orientedBoundingBox,
        horizonOcclusionPoint,
        westIndices : [0, 1],
        southIndices : [0, 1],
        eastIndices : [2, 3],
        northIndices : [1, 3],
        westSkirtHeight : skirtHeight,
        southSkirtHeight : skirtHeight,
        eastSkirtHeight : skirtHeight,
        northSkirtHeight : skirtHeight
    })
  }

  async requestTileGeometry (x, y, z) {
    console.log(x,y,z)
    const geom = await super.requestTileGeometry(x, y, z)
    const mapboxTile = await this.requestMapboxTile(x,y,z)
    console.log(geom, mapboxTile)
    return geom
  }

}

export default MapboxTerrainProvider
