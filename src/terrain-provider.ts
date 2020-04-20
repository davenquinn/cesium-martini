import Cesium, {
  CesiumTerrainProvider,
  Cartographic,
  Rectangle,
  Ellipsoid,
  WebMercatorTilingScheme,
  Math as CMath,
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

    const terrainTile = await this.createQuantizedMeshData(x, y, z, tile, mesh)

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

  async createQuantizedMeshData (x, y, z, tile, mesh) {
    const err = this.getLevelMaximumGeometricError(z+1)
    const skirtHeight = err*5

    const header = this.generateDummyTileHeader(x,y,z)

    const tileRect = this.tilingScheme.tileXYToRectangle(x, y, z)
    const boundingSphereCenter = new Cartesian3(
      header.boundingSphereCenterX,
      header.boundingSphereCenterY,
      header.boundingSphereCenterZ
    )
    let boundingSphere = new BoundingSphere(
      boundingSphereCenter,
      // radius
      100000
    )
    const horizonOcclusionPoint = new Cartesian3(
      header.horizonOcclusionPointX,
      header.horizonOcclusionPointY,
      header.horizonOcclusionPointZ
    )
    let orientedBoundingBox

    if (tileRect.width < CMath.PI_OVER_TWO + CMath.EPSILON5) {
      // @ts-ignore
      orientedBoundingBox = OrientedBoundingBox.fromRectangle(
        tileRect,
        header.minHeight,
        header.maxHeight
      )

      // @ts-ignore
      boundingSphere = BoundingSphere.fromOrientedBoundingBox(orientedBoundingBox)
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

    const geom = await super.requestTileGeometry(x, y, z)

    console.log(geom, tile, mesh)
    //return geom

    // multiply by a factor of 128
    // vertices is an array of x-y coordinates in pixel space

    // indices is an array of triangle coordinates

    const xvals = []
    const yvals = []
    const heightMeters = []
    const northIndices = []
    const southIndices = []
    const eastIndices = []
    const westIndices = []


    for (let ix = 0; ix < mesh.vertices.length; ix++) {
      const vertexIx = ix/2
      x = mesh.vertices[ix]
      ix++
      y = mesh.vertices[ix]
      heightMeters.push(tile.terrain[x*256+y])

      if (y == 0) northIndices.push(vertexIx)
      if (y == 256) southIndices.push(vertexIx)
      if (x == 0) westIndices.push(vertexIx)
      if (x == 256) eastIndices.push(vertexIx)

      xvals.push(x*128)
      yvals.push(y*128)
    }

    const mx = Math.max.apply(this, heightMeters)
    const mn = Math.min.apply(this, heightMeters)

    const heights = heightMeters.map(d => (d-mn)*(32768/(mx-mn)))


    //const heights = verticesXY.map(([x,y])=>terrain.get(x,y))

    //if (z > 10) debugger

    //debugger
    console.log(mn, mx, xvals, yvals, heights)

    return new QuantizedMeshTerrainData({
        minimumHeight : mn,
        maximumHeight : mx,
        quantizedVertices : new Uint16Array([// order is SW NW SE NE
                                             // longitude
                                            ...xvals,
                                             // latitude
                                             ...yvals,
                                             // heights
                                             ...heights]),
        indices : new Uint16Array(mesh.triangles),
        // @ts-ignore
        boundingSphere: geom._boundingSphere,
        // @ts-ignore
        orientedBoundingBox: geom._orientedBoundingBox,
        // @ts-ignore
        horizonOcclusionPoint: geom._horizonOcclusionPoint,
        westIndices,
        southIndices,
        eastIndices,
        northIndices,
        westSkirtHeight : skirtHeight,
        southSkirtHeight : skirtHeight,
        eastSkirtHeight : skirtHeight,
        northSkirtHeight : skirtHeight,
        childTileMask: 15
    })
  }

  async requestTileGeometry (x, y, z) {
    console.log(x,y,z)
    const mapboxTile = await this.requestMapboxTile(x,y,z)
    //if (z > 10) debugger
    return mapboxTile
  }

}

export default MapboxTerrainProvider
