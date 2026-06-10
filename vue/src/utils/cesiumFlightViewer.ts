import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

export interface CityBuildingsMountOptions {
  ionToken: string
  showBaseImagery: boolean
  globeNoImageryColor: string
  /** 本地 GeoJSON（Polygon / MultiPolygon），建议含 height（米） */
  buildingsGeoJsonUrl: string
  /** 要素无 height 时的默认拉伸高度（米） */
  defaultBuildingHeightM: number
  /** 将读取到的高度乘以该系数（整体夸张） */
  heightExaggeration: number
  /** 是否启用低功耗渲染模式，飞行模拟页默认使用 */
  lowPowerMode?: boolean
}

export interface BuildingLoadStats {
  ok: boolean
  polygonCount: number
  minHeightM: number
  maxHeightM: number
  usedDefaultHeightCount: number
}

export interface CesiumCityBuildingsHandle {
  viewer: Cesium.Viewer
  reloadBuildings: () => Promise<BuildingLoadStats>
  setBaseImageryVisible: (visible: boolean) => void
  setNoImageryGlobeColor: (hexColor: string) => void
  /** 更新默认高度、夸张系数或 GeoJSON 地址后调用 reloadBuildings 生效 */
  setBuildingLoadParams: (
    partial: Partial<Pick<CityBuildingsMountOptions, 'defaultBuildingHeightM' | 'heightExaggeration' | 'buildingsGeoJsonUrl'>>
  ) => void
  destroy: () => void
}

function normalizeColor(input: string) {
  try {
    return Cesium.Color.fromCssColorString(input || '#4a5f52')
  } catch {
    return Cesium.Color.fromCssColorString('#4a5f52')
  }
}

function applyImageryVisibility(viewer: Cesium.Viewer, visible: boolean, noImageryColor: string) {
  const layers = viewer.imageryLayers
  for (let i = 0; i < layers.length; i++) {
    layers.get(i).show = visible
  }
  viewer.scene.globe.baseColor = visible ? Cesium.Color.fromCssColorString('#1f2937') : normalizeColor(noImageryColor)
}

/** 从 GeoJSON properties 解析建筑高度（米）；未命中返回 null */
function readHeightMeters(props: Record<string, unknown> | undefined): number | null {
  if (!props) return null
  const tryKeys = [
    'height',
    'HEIGHT',
    'Height',
    'building_height',
    'Building_H',
    'bld_hgt',
    'BH',
    'H',
    'h',
    '楼高',
    '建筑高度'
  ]
  for (const k of tryKeys) {
    if (!(k in props)) continue
    const v = (props as Record<string, unknown>)[k]
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

function heightToColor(heightM: number, minH: number, maxH: number): Cesium.Color {
  const span = Math.max(maxH - minH, 1e-3)
  const t = Cesium.Math.clamp((heightM - minH) / span, 0, 1)
  return Cesium.Color.lerp(
    Cesium.Color.fromCssColorString('#1d4ed8'),
    Cesium.Color.fromCssColorString('#fb923c'),
    t,
    new Cesium.Color()
  )
}

async function loadExtrudedBuildings(
  viewer: Cesium.Viewer,
  url: string,
  previous: Cesium.GeoJsonDataSource | null,
  options: Pick<CityBuildingsMountOptions, 'defaultBuildingHeightM' | 'heightExaggeration'>
): Promise<{ ds: Cesium.GeoJsonDataSource | null; stats: BuildingLoadStats }> {
  if (previous) {
    try {
      viewer.dataSources.remove(previous, true)
    } catch {}
  }
  const rawUrl = (url || '').trim()
  if (!rawUrl) {
    return { ds: null, stats: { ok: false, polygonCount: 0, minHeightM: 0, maxHeightM: 0, usedDefaultHeightCount: 0 } }
  }

  try {
    const ds = await Cesium.GeoJsonDataSource.load(rawUrl, {
      clampToGround: false,
      /** 避免触发 polygon outline Worker（createPolygonOutlineGeometry），减少 dev 下 Worker 拉取失败导致渲染崩溃 */
      stroke: Cesium.Color.TRANSPARENT,
      strokeWidth: 0,
      fill: Cesium.Color.WHITE.withAlpha(0.2)
    })
    await viewer.dataSources.add(ds)

    const polygonEntities: Cesium.Entity[] = []
    for (let i = 0; i < ds.entities.values.length; i++) {
      const e = ds.entities.values[i]
      if (e.polygon) polygonEntities.push(e)
    }

    const now = Cesium.JulianDate.now()
    const resolvedHeights: number[] = []
    let usedDefaultHeightCount = 0

    for (const entity of polygonEntities) {
      const props = entity.properties?.getValue(now) as Record<string, unknown> | undefined
      let h = readHeightMeters(props)
      if (h == null || h <= 0) {
        h = options.defaultBuildingHeightM
        usedDefaultHeightCount++
      }
      h *= options.heightExaggeration
      resolvedHeights.push(h)
    }

    const minHeightM = resolvedHeights.length ? Math.min(...resolvedHeights) : 0
    const maxHeightM = resolvedHeights.length ? Math.max(...resolvedHeights) : 0

    for (let i = 0; i < polygonEntities.length; i++) {
      const entity = polygonEntities[i]
      const h = resolvedHeights[i]
      const poly = entity.polygon!
      poly.heightReference = new Cesium.ConstantProperty(Cesium.HeightReference.CLAMP_TO_GROUND)
      poly.extrudedHeight = new Cesium.ConstantProperty(h)
      poly.extrudedHeightReference = new Cesium.ConstantProperty(Cesium.HeightReference.RELATIVE_TO_GROUND)
      poly.outline = new Cesium.ConstantProperty(false)
      poly.material = new Cesium.ColorMaterialProperty(heightToColor(h, minHeightM, maxHeightM).withAlpha(0.9))
    }

    if (polygonEntities.length) {
      try {
        await viewer.flyTo(ds, { duration: 1.4 })
      } catch {}
    }

    return {
      ds,
      stats: {
        ok: true,
        polygonCount: polygonEntities.length,
        minHeightM,
        maxHeightM,
        usedDefaultHeightCount
      }
    }
  } catch (e) {
    console.warn('[buildings] GeoJSON load failed:', e)
    return { ds: null, stats: { ok: false, polygonCount: 0, minHeightM: 0, maxHeightM: 0, usedDefaultHeightCount: 0 } }
  }
}

/**
 * 初始化 Cesium 场景：无底图 OSM 建筑，仅加载本地建筑 GeoJSON 并按 height 拉伸体块。
 */
export async function mountCesiumFlightMap(
  container: HTMLElement,
  options: CityBuildingsMountOptions
): Promise<CesiumCityBuildingsHandle> {
  const token = (options.ionToken || '').trim()
  if (token) Cesium.Ion.defaultAccessToken = token

  const viewerOptions: Cesium.Viewer.ConstructorOptions = {
    animation: false,
    timeline: false,
    navigationHelpButton: false,
    vrButton: false,
    geocoder: false,
    homeButton: true,
    sceneModePicker: true,
    baseLayerPicker: true,
    fullscreenButton: true,
    infoBox: true,
    selectionIndicator: true,
    requestRenderMode: options.lowPowerMode !== false,
    maximumRenderTimeChange: Infinity
  }
  if (token && typeof (Cesium.Terrain as any)?.fromWorldTerrain === 'function') {
    try {
      viewerOptions.terrain = (Cesium.Terrain as any).fromWorldTerrain()
    } catch {}
  }

  const viewer = new Cesium.Viewer(container, viewerOptions)
  viewer.scene.globe.depthTestAgainstTerrain = options.lowPowerMode === false
  viewer.scene.globe.enableLighting = options.lowPowerMode === false
  viewer.scene.fxaa = options.lowPowerMode === false

  flyCameraToNanchang(viewer)
  bindHomeToNanchang(viewer)
  viewer.scene.requestRender()

  let noImageryColor = options.globeNoImageryColor || '#4a5f52'
  let imageryVisible = options.showBaseImagery
  applyImageryVisibility(viewer, imageryVisible, noImageryColor)

  let buildingsDs: Cesium.GeoJsonDataSource | null = null
  const buildingLoad = {
    buildingsGeoJsonUrl: options.buildingsGeoJsonUrl,
    defaultBuildingHeightM: options.defaultBuildingHeightM,
    heightExaggeration: options.heightExaggeration
  }

  async function reloadInternal(): Promise<BuildingLoadStats> {
    const { ds, stats } = await loadExtrudedBuildings(viewer, buildingLoad.buildingsGeoJsonUrl, buildingsDs, {
      defaultBuildingHeightM: buildingLoad.defaultBuildingHeightM,
      heightExaggeration: buildingLoad.heightExaggeration
    })
    buildingsDs = ds
    return stats
  }

  return {
    viewer,
    reloadBuildings: reloadInternal,
    setBaseImageryVisible: (visible: boolean) => {
      imageryVisible = visible
      applyImageryVisibility(viewer, imageryVisible, noImageryColor)
    },
    setNoImageryGlobeColor: (hexColor: string) => {
      noImageryColor = hexColor || '#4a5f52'
      applyImageryVisibility(viewer, imageryVisible, noImageryColor)
    },
    setBuildingLoadParams: (partial) => {
      if (typeof partial.buildingsGeoJsonUrl === 'string') buildingLoad.buildingsGeoJsonUrl = partial.buildingsGeoJsonUrl
      if (typeof partial.defaultBuildingHeightM === 'number' && Number.isFinite(partial.defaultBuildingHeightM)) {
        buildingLoad.defaultBuildingHeightM = partial.defaultBuildingHeightM
      }
      if (typeof partial.heightExaggeration === 'number' && Number.isFinite(partial.heightExaggeration)) {
        buildingLoad.heightExaggeration = partial.heightExaggeration
      }
    },
    destroy: () => {
      if (buildingsDs) {
        try {
          viewer.dataSources.remove(buildingsDs, true)
        } catch {}
        buildingsDs = null
      }
      viewer.destroy()
    }
  }
}

export type CesiumFlightHandle = CesiumCityBuildingsHandle

/** 南昌市默认视角（与任务池高德地图中心一致） */
export const NANCHANG_DEFAULT_VIEW = {
  lng: 115.892151,
  lat: 28.676493,
  heightM: 28000,
  headingDeg: 0,
  pitchDeg: -48
} as const

export interface FlyCameraOptions {
  duration?: number
  pitchDeg?: number
}

/** 将相机定位到南昌市域，避免打开页面时显示整颗地球 */
export function flyCameraToNanchang(viewer: Cesium.Viewer, options: FlyCameraOptions = {}) {
  const { duration = 0, pitchDeg = NANCHANG_DEFAULT_VIEW.pitchDeg } = options
  const destination = Cesium.Cartesian3.fromDegrees(
    NANCHANG_DEFAULT_VIEW.lng,
    NANCHANG_DEFAULT_VIEW.lat,
    NANCHANG_DEFAULT_VIEW.heightM
  )
  const orientation = {
    heading: Cesium.Math.toRadians(NANCHANG_DEFAULT_VIEW.headingDeg),
    pitch: Cesium.Math.toRadians(pitchDeg),
    roll: 0
  }
  if (duration > 0) {
    void viewer.camera.flyTo({ destination, orientation, duration })
  } else {
    viewer.camera.setView({ destination, orientation })
  }
  viewer.scene.requestRender()
}

export interface PathCameraPoint {
  lng: number
  lat: number
  alt?: number
}

/** 根据航线路径点自动缩放相机到任务区域 */
export function flyCameraToPathBounds(
  viewer: Cesium.Viewer,
  rawPoints: PathCameraPoint[],
  options: FlyCameraOptions = {}
) {
  const points = (rawPoints || []).filter(
    (p) => Number.isFinite(p.lng) && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
  )
  if (points.length < 2) {
    flyCameraToNanchang(viewer, options)
    return
  }

  const positions = points.map((p) =>
    Cesium.Cartesian3.fromDegrees(p.lng, p.lat, Math.max(Number(p.alt) || 120, 80))
  )
  const sphere = Cesium.BoundingSphere.fromPoints(positions)
  const duration = options.duration ?? 1.2
  const pitch = Cesium.Math.toRadians(options.pitchDeg ?? -45)
  const range = Math.max(sphere.radius * 2.8, 1800)

  void viewer.camera.flyToBoundingSphere(sphere, {
    duration,
    offset: new Cesium.HeadingPitchRange(0, pitch, range)
  })
  viewer.scene.requestRender()
}

function bindHomeToNanchang(viewer: Cesium.Viewer) {
  const home = viewer.homeButton?.viewModel
  if (!home) return
  home.command.beforeExecute.addEventListener((e) => {
    e.cancel = true
    flyCameraToNanchang(viewer, { duration: 1.2 })
  })
}
