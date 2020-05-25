import {
  Cartographic,
  Rectangle,
  Ellipsoid,
  WebMercatorTilingScheme,
  TerrainProvider,
  Math as CMath,
  Event as CEvent,
  Cartesian3,
  BoundingSphere,
  QuantizedMeshTerrainData,
  HeightmapTerrainData,
  MapboxImageryProvider,
  // @ts-ignore
  OrientedBoundingBox,
  Credit
} from "cesium"
const ndarray = require('ndarray')
import Martini from '@mapbox/martini'

function mapboxTerrainToGrid(png: ndarray<number>) {
    // maybe we should do this on the GPU using REGL?
    // but that would require GPU -> CPU -> GPU
    const gridSize = png.shape[0] + 1;
    const terrain = new Float32Array(gridSize * gridSize);
    const tileSize = png.shape[0];

    // decode terrain values
    for (let y = 0; y < tileSize; y++) {
        for (let x = 0; x < tileSize; x++) {
            const yc = y
            const r = png.get(x,yc,0);
            const g = png.get(x,yc,1);
            const b = png.get(x,yc,2);
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

enum ImageFormat {
  WEBP = 'webp',
  PNG = 'png',
  PNGRAW = 'pngraw'
}

interface MapboxTerrainOpts {
  format: ImageFormat
  ellipsoid?: Ellipsoid
  accessToken: string
  highResolution?: boolean
}

class MapboxTerrainProvider {
  martini: any
  hasWaterMask = false
  hasVertexNormals = false
  credit = new Credit("Mapbox")
  ready: boolean
  readyPromise: Promise<boolean>
  availability = null
  errorEvent = new CEvent()
  tilingScheme: TerrainProvider["tilingScheme"]
  ellipsoid: Ellipsoid
  accessToken: string
  format: ImageFormat
  highResolution: boolean
  tileSize: number = 256
  backend: MapboxImageryProvider

  // @ts-ignore
  constructor(opts: MapboxTerrainOpts) {

    //this.martini = new Martini(257);
    this.highResolution = false //opts.highResolution ?? false
    this.tileSize = this.highResolution ? 512 : 256

    this.martini = new Martini(this.tileSize+1)
    this.ready = true
    this.readyPromise = Promise.resolve(true)
    this.accessToken = opts.accessToken

    this.errorEvent.addEventListener(console.log, this);
    this.ellipsoid = opts.ellipsoid ?? Ellipsoid.WGS84
    this.format = opts.format ?? ImageFormat.PNG

    this.backend = new MapboxImageryProvider({
      mapId : 'mapbox.terrain-rgb',
      maximumLevel : 15,
      accessToken: process.env.MAPBOX_API_TOKEN,
      hasAlphaChannel: false
    })

    this.tilingScheme = new WebMercatorTilingScheme({
      numberOfLevelZeroTilesX: 1,
      numberOfLevelZeroTilesY: 1,
      ellipsoid: this.ellipsoid
    })

  }

  async getPixels(img: HTMLImageElement|HTMLCanvasElement) {
    return new Promise((resolve, reject)=>{
      //img.onload = ()=>{
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const context = canvas.getContext('2d')
      context.drawImage(img, 0, 0)
      const pixels = context.getImageData(0, 0, img.width, img.height)
      resolve(ndarray(new Uint8Array(pixels.data), [img.width, img.height, 4], [4, 4*img.width, 1], 0))
      //}
    })
  }

  async requestMapboxTile (x, y, z, request) {
    const mx = this.tilingScheme.getNumberOfYTilesAtLevel(z)
    const err = this.getLevelMaximumGeometricError(z)

    const hires = this.highResolution ? '@2x' : ''

    // Something wonky about our tiling scheme, perhaps
    // 12/2215/2293 @2x
    const url =  `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}${hires}.${this.format}?access_token=${this.accessToken}`

    try {
      const img = await this.backend.requestImage(x,y,z, request)

      // Get image pixels
      const pxArray = await this.getPixels(img)
      const terrain = mapboxTerrainToGrid(pxArray)

      // set up mesh generator for a certain 2^k+1 grid size
      // generate RTIN hierarchy from terrain data (an array of size^2 length)
      const tile = this.martini.createTile(terrain);

      // get a mesh (vertices and triangles indices) for a 10m error
      console.log(`Error level: ${err}`)
      const mesh = tile.getMesh(err);

      return await this.createQuantizedMeshData(x, y, z, tile, mesh)
    } catch(err) {
      console.log(err)
      // We fall back to a heightmap
      const v = Math.max(32-4*z, 4)
      return this.emptyHeightmap(v)
    }
  }

  emptyHeightmap(samples) {
    return new HeightmapTerrainData({
      buffer: new Uint8Array(Array(samples*samples).fill(0)),
      width: samples,
      height: samples
    })
  }

  async createQuantizedMeshData (x, y, z, tile, mesh) {
    const err = this.getLevelMaximumGeometricError(z)
    const skirtHeight = err*5

    const xvals = []
    const yvals = []
    const heightMeters = []
    const northIndices = []
    const southIndices = []
    const eastIndices = []
    const westIndices = []

    for (let ix = 0; ix < mesh.vertices.length/2; ix++) {
      const vertexIx = ix
      const px = mesh.vertices[ix*2]
      const py = mesh.vertices[ix*2+1]
      heightMeters.push(tile.terrain[py*(this.tileSize+1)+px])

      if (py == 0) northIndices.push(vertexIx)
      if (py == this.tileSize) southIndices.push(vertexIx)
      if (px == 0) westIndices.push(vertexIx)
      if (px == this.tileSize) eastIndices.push(vertexIx)

      const scalar = 32768/this.tileSize
      let xv = px*scalar
      let yv = (this.tileSize-py)*scalar

      xvals.push(xv)
      yvals.push(yv)
    }

    const maxHeight = Math.max.apply(this, heightMeters)
    const minHeight = Math.min.apply(this, heightMeters)

    const heights = heightMeters.map(d =>{
      if (maxHeight-minHeight < 1) return 0
      return (d-minHeight)*(32767/(maxHeight-minHeight))
    })


    const tileRect = this.tilingScheme.tileXYToRectangle(x, y, z)
    const tileCenter = Cartographic.toCartesian(Rectangle.center(tileRect))
    // Need to get maximum distance at zoom level
    // tileRect.width is given in radians
    // cos of half-tile-width allows us to use right-triangle relationship
    const cosWidth = Math.cos(tileRect.width/2)// half tile width since our ref point is at the center
    // scale max height to max ellipsoid radius
    // ... it might be better to use the radius of the entire
    const ellipsoidHeight = maxHeight/this.ellipsoid.maximumRadius
    // cosine relationship to scale height in ellipsoid-relative coordinates
    const occlusionHeight = (1+ellipsoidHeight)/cosWidth

    const scaledCenter = Ellipsoid.WGS84.transformPositionToScaledSpace(tileCenter)
    const horizonOcclusionPoint = new Cartesian3(scaledCenter.x, scaledCenter.y, occlusionHeight)

    let orientedBoundingBox = null
    let boundingSphere: BoundingSphere
    if (tileRect.width < CMath.PI_OVER_TWO + CMath.EPSILON5) {
      // @ts-ignore
      orientedBoundingBox = OrientedBoundingBox.fromRectangle(tileRect, minHeight, maxHeight)
      // @ts-ignore
      boundingSphere = BoundingSphere.fromOrientedBoundingBox(orientedBoundingBox)
    } else {
      // If our bounding rectangle spans >= 90º, we should use the entire globe as a bounding sphere.
      boundingSphere = new BoundingSphere(
        Cartesian3.ZERO,
        // radius (seems to be max height of Earth terrain?)
        6379792.481506292
      )
    }

    const triangles = new Uint16Array(mesh.triangles)

    // @ts-ignore

    // If our tile has greater than ~1º size
    if (tileRect.width > 0.04 && triangle.length < 500) {
      // We need to be able to specify a minimum number of triangles...
      return this.emptyHeightmap(64)
    }

    const quantizedVertices = new Uint16Array(
      //verts
      [...xvals, ...yvals, ...heights]
    )

    // SE NW NE
    // NE NW SE

    return new QuantizedMeshTerrainData({
      minimumHeight: minHeight,
      maximumHeight: maxHeight,
      quantizedVertices,
      indices : triangles,
      // @ts-ignore
      boundingSphere,
      // @ts-ignore
      orientedBoundingBox,
      // @ts-ignore
      horizonOcclusionPoint,
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

  async requestTileGeometry (x, y, z, request) {
    try {
      const mapboxTile = await this.requestMapboxTile(x,y,z, request)
      return mapboxTile
    } catch(err) {
      console.log(err)
    }
  }

  getLevelMaximumGeometricError (level) {
    const levelZeroMaximumGeometricError = TerrainProvider
      .getEstimatedLevelZeroGeometricErrorForAHeightmap(
        this.tilingScheme.ellipsoid,
        65,
        this.tilingScheme.getNumberOfXTilesAtLevel(0)
      )

    // Scalar to control overzooming
    // also seems to control zooming for imagery layers
    const scalar = this.highResolution ? 8 : 4

    return levelZeroMaximumGeometricError / (1 << level)
  }

  getTileDataAvailable(x, y, z) {
    return z <= 15
  }
}

export default MapboxTerrainProvider
