<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  MapLocation, RefreshRight, Delete, Document, Location,
  TrendCharts, MagicStick,
  Position, Check,
} from '@element-plus/icons-vue'

import { createPathPlanningEnhanced } from '@/utils/pathPlanningEnhanced'
import {
  calculatePathStats,
  flattenPathCoordinates,
  getDistanceFromLatLonInMeters,
  type CompareResults,
} from '@/utils/pathCalculator'
import { enrichPathWithAltitude, normalizePathPoint } from '@/utils/pathAltitude'
import {
  planPathAStarGrid,
  planPathDijkstraGrid,
  planPathDijkstraGridAvoidPolygons,
  planPathAStarGridAvoidPolygons,
  planPathGeneticGrid,
  planPathGeneticGridAvoidPolygons
} from '@/utils/basicPathPlanner'
import { PathAnimationManager } from '@/utils/pathAnimation'
import {
  create2DMap,
  create3DMap,
  resetMapView,
  adjustMapViewport,
  getGeoPoint,
  createGeoMarker,
  removeOverlayFromMap,
  MAP_CONFIG
} from '@/utils/mapInitializer'
import {
  simulateFlight2D,
  stopAllFlightAnimations
} from '@/utils/flightSimulation'
import { ENABLE_ANIMATIONS } from '@/utils/flightSimulation'
import {
  loadTaskList as apiLoadTaskList,
  loadUavList as apiLoadUavList,
  selectTask as apiSelectTask,
  recommendUavByPath as apiRecommendUav
} from '@/utils/taskSelector'
import { planPath as apiPlanRlPath, planGridPath, generateUavEnvironmentPlot, exportExternalPath, regenerateRlPlots, logFinalPathPackage } from '@/api/system/pathPlanning'
import { decodeRlApiPathToGcj02 } from '@/utils/rlGridGeo'
import { getMissionTrainAnchor, unwarpUserPathToTrainAnchors } from '@/utils/offlineRlPathWarp'
import {
  resolvePythonMissionId,
  isMissionGeoMatch,
  getMissionGeoDistance,
  MISSION_GEO_MAX_DISTANCE_M
} from '@/utils/missionRlResolver'
import { planRoadInspectionRoute, planWaterInspectionRoute } from '@/utils/taskPathPlanner'
import { planPathGeneticAlongPolyline } from '@/utils/networkCorridorPlanner'
import { drawComparePathLine, clearComparePathLine, getAlgorithmColor } from '@/utils/pathStyleManager'
import { fetchBaiduBuildingPoiObstacles } from '@/utils/baiduBuildingObstacles'
import { filterBuildingsInCorridor } from '@/utils/corridorBuildings'
import { loadNoFlyZones, checkNoFlyZoneIntersection, DISABLE_NOFLY_ON_DRIVING_PLAN } from '@/utils/noFlyZoneService'
import { convertPathWgs84ToGcj02, gcj02ToWgs84 } from '@/utils/coordTransform'
import '@/assets/styles/pathPlanning.css'

const router = useRouter()
const map = ref(null)
const mapContainer = ref(null)
const is3DMode = ref(false)

const startPoint = ref('南昌市市政府')
const endPoint = ref('南昌市北京银行')
const selectedUav = ref(null)
/** 路径/任务类型：决定规划策略（道路巡检走真实路网等） */
const selectedPathType = ref('道路巡检')
const pathTypeOptions = [
  { label: '水域巡检', value: '水域巡检' },
  { label: '道路巡检', value: '道路巡检' },
  { label: '救援', value: '救援' },
  { label: '运送', value: '运送' },
  { label: '航拍', value: '航拍' },
  { label: '测绘', value: '测绘' },
  { label: '巡检', value: '巡检' }
]
const planningLoading = ref(false)
/** triple=三算法对比；single=单一算法 */
const planExecutionMode = ref<'triple' | 'single'>('triple')
const singleAlgorithm = ref<'强化学习' | 'A*算法' | '遗传算法'>('A*算法')
const singleAlgorithmOptions = [
  { label: '强化学习', value: '强化学习' },
  { label: 'A*算法', value: 'A*算法' },
  { label: '遗传算法', value: '遗传算法' }
] as const
/** 水域巡检子选项（与任务规划页一致） */
const waterSubType = ref<'河流' | '湖泊'>('河流')
const riverDirection = ref<'顺流' | '逆流'>('顺流')
const riverCenterOffsetM = ref(50)
const riverBankSide = ref<'left' | 'right'>('left')
/** 三算法对比结果 */
const tripleAlgoResults = ref<Array<{
  algorithm: string
  pathPoints: Array<{ lng: number; lat: number; alt: number }>
  totalDistance: number
  estimatedTime: number
  pointCount: number
  computationTime?: number
  note?: string
}>>([])
const rlPolylineStore = ref(null)
const astarPolylineStore = ref(null)
const gaPolylineStore = ref(null)
const uavList = ref([])
const pathPoints = ref<Array<{ lng: number; lat: number; alt: number }>>([])
/** 强化学习返回的环境障碍物（网格），用于右侧三维仿真线框楼体 */
const planObstacles = ref<any[]>([])
const cruiseAltitudeM = ref(88)
/** 与 Python/Java OFFLINE_GRID_N=54、z_scale=2.0 对齐；更高时后端自动放大 z_scale */
const RL_GRID_N = 54
const RL_Z_SCALE_M = 2
const rlMaxCruiseAtNativeScaleM = (RL_GRID_N - 1) * RL_Z_SCALE_M
/** 暂时关闭可拖拽路径锚点（避免路径点扎堆） */
const ENABLE_DRAGGABLE_PATH_MARKERS = false

// 规划表单持久化（页面切换不重置）
const PLANNING_FORM_KEY = 'uav_path_planning_form_v2'
const savePlanningForm = () => {
  try {
    localStorage.setItem(
      PLANNING_FORM_KEY,
      JSON.stringify({
        startPoint: startPoint.value,
        endPoint: endPoint.value,
        selectedUav: selectedUav.value,
        selectedPathType: selectedPathType.value,
        is3DMode: is3DMode.value,
        cruiseAltitudeM: cruiseAltitudeM.value,
        waterSubType: waterSubType.value,
        riverDirection: riverDirection.value,
        riverCenterOffsetM: riverCenterOffsetM.value,
        riverBankSide: riverBankSide.value,
        planExecutionMode: planExecutionMode.value,
        singleAlgorithm: singleAlgorithm.value
      })
    )
  } catch (e) {
    console.error('保存规划表单失败:', e)
  }
}
const restorePlanningForm = () => {
  try {
    const raw = localStorage.getItem(PLANNING_FORM_KEY)
    if (!raw) return
    const v = JSON.parse(raw)
    if (typeof v?.startPoint === 'string') startPoint.value = v.startPoint
    if (typeof v?.endPoint === 'string') endPoint.value = v.endPoint
    if (v?.selectedUav !== undefined) selectedUav.value = v.selectedUav
    if (typeof v?.selectedPathType === 'string') {
      selectedPathType.value = v.selectedPathType
    } else if (typeof v?.selectedAlgorithm === 'string') {
      const a = v.selectedAlgorithm
      if (a === '强化学习' || a === '强化学习模型') selectedPathType.value = '救援'
      else if (a === '遗传算法') selectedPathType.value = '道路巡检'
      else selectedPathType.value = '道路巡检'
    }
    if (typeof v?.is3DMode === 'boolean') is3DMode.value = v.is3DMode
    if (v?.cruiseAltitudeM !== undefined) cruiseAltitudeM.value = Number(v.cruiseAltitudeM) || cruiseAltitudeM.value
    if (v?.waterSubType === '河流' || v?.waterSubType === '湖泊') waterSubType.value = v.waterSubType
    if (v?.riverDirection === '顺流' || v?.riverDirection === '逆流') riverDirection.value = v.riverDirection
    if (v?.riverCenterOffsetM !== undefined) {
      const m = Number(v.riverCenterOffsetM)
      if (Number.isFinite(m)) riverCenterOffsetM.value = Math.max(0, Math.min(300, m))
    }
    if (v?.riverBankSide === 'left' || v?.riverBankSide === 'right') riverBankSide.value = v.riverBankSide
    if (v?.planExecutionMode === 'triple' || v?.planExecutionMode === 'single') {
      planExecutionMode.value = v.planExecutionMode
    }
    if (v?.singleAlgorithm === '强化学习' || v?.singleAlgorithm === 'A*算法' || v?.singleAlgorithm === '遗传算法') {
      singleAlgorithm.value = v.singleAlgorithm
    }
  } catch (e) {
    console.warn('恢复规划表单失败:', e)
  }
}

watch([startPoint, endPoint, selectedUav, selectedPathType, is3DMode, cruiseAltitudeM, waterSubType, riverDirection, riverCenterOffsetM, riverBankSide, planExecutionMode, singleAlgorithm], () => savePlanningForm(), { deep: false })

const weatherInfo = ref(null)
const weatherWarning = ref('')
const suitabilityScore = ref(null)

const compareResults = ref<CompareResults | null>(null)
const showComparePanel = ref(false)

const flowAnimationRef = ref<number | null | { stop: () => void }>(null)
/** 2D/3D 动画帧 ID（用于清除路径时统一取消） */
const animationIdRef = ref<number | null>(null)
const uavIconMarker = ref(null)
let animationManager: PathAnimationManager | null = null

const showPathInfo = ref(false)
const pathStats = ref({
  totalDistance: 0,
  estimatedTime: 0,
  pointCount: 0,
  avgSpeed: 10,
  startCoord: '',
  endCoord: ''
})


const persistRouteData = (payload: any) => {
  try {
    localStorage.setItem('uav_route_data', JSON.stringify(payload))
  } catch (e) {
    console.error('保存 route 数据失败:', e)
  }
}

const buildWaypointSpeeds = (pts: Array<{ lng: number; lat: number; alt: number }>) => {
  const uav = uavList.value.find((x) => x.uavId === selectedUav.value)
  const cruiseSpeed = Number(uav?.uavCruiseSpeed || uav?.cruiseSpeed || 10) || 10
  return pts.map((p) => ({ ...p, speed: cruiseSpeed }))
}

const samplePathPoints = (pts: Array<{ lng: number; lat: number; alt: number }>, maxPoints = 45) => {
  if (!Array.isArray(pts) || pts.length <= maxPoints) return pts || []
  const out: Array<{ lng: number; lat: number; alt: number }> = []
  const n = pts.length
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i * (n - 1)) / (maxPoints - 1))
    out.push(pts[idx])
  }
  return out
}

/** 百度 Point 或 { lat, lng } → 数值坐标 */
function toLatLng(p: any): { lat: number; lng: number } | null {
  if (!p) return null
  const lat =
    typeof p.lat === 'number' ? p.lat : typeof p.getLat === 'function' ? p.getLat() : NaN
  const lng =
    typeof p.lng === 'number' ? p.lng : typeof p.getLng === 'function' ? p.getLng() : NaN
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

const CORRIDOR_WIDTH_M = 100

/** 起终点直线 ±50m 走廊内建筑 → Python 生成 uav_environment.png，供路径信息页展示 */
const runUavEnvPlot = (start: any, end: any) => {
  // 用户当前模式：只生成路径，不做额外耗时/依赖 Python 的环境图渲染
  if (!ENABLE_ANIMATIONS) return

  const s = toLatLng(start)
  const e = toLatLng(end)
  if (!s || !e) return
  const alt = Number(cruiseAltitudeM.value || 0) || 0
  void (async () => {
    try {
      const buildings = await fetchBaiduBuildingPoiObstacles(s, e, {
        maxTotal: 80,
        padDeg: 0.015
      })
      const filtered = filterBuildingsInCorridor(s, e, buildings, CORRIDOR_WIDTH_M)
      const obstacles = filtered.map(({ name: _n, ...rest }: any) => rest)
      const resp = await generateUavEnvironmentPlot({
        startPoint: [s.lat, s.lng, alt],
        endPoint: [e.lat, e.lng, alt],
        obstacles,
        corridor_width_m: CORRIDOR_WIDTH_M
      })
      if (resp?.code === 200) {
        try {
          const mid = resolveMissionIdForRl()
          window.dispatchEvent(
            new CustomEvent('uav-reload-rl-plots', { detail: { missionId: mid > 0 ? mid : undefined, t: Date.now() } })
          )
        } catch {}
      }
    } catch (err) {
      console.warn('走廊环境三维图生成失败', err)
    }
  })()
}

const saveCurrentToRouteInfo = (extra?: Record<string, any>) => {
  const uav = uavList.value.find((x) => x.uavId === selectedUav.value)
  const missionId = resolveMissionIdForRl()
  const payload = {
    uavModel: uav?.uavModel || uav?.uavName || '未知无人机',
    uavMaxFlightTime: Number(uav?.uavMaxFlightTime) || undefined,
    cruiseAltitudeM: Number(cruiseAltitudeM.value) || undefined,
    startPoint: startPoint.value || '',
    endPoint: endPoint.value || '',
    savedAt: Date.now(),
    missionId: missionId > 0 ? missionId : undefined,
    pyMissionId: missionId > 0 ? missionId : undefined,
    rlTaskKey: extra?.rlTaskKey || extra?.rlMeta?.taskKey || undefined,
    businessTaskId: selectedTask.value?.taskId,
    algorithm: tripleAlgoResults.value?.[0]?.algorithm || '三算法对比',
    pathType: selectedPathType.value,
    coordinateSystem: 'GCJ02',
    rlSourceCoordinateSystem: 'WGS84',
    tripleAlgoResults: tripleAlgoResults.value,
    totalDistance: pathStats.value?.totalDistance || 0,
    estimatedTime: pathStats.value?.estimatedTime || 0,
    pointCount: pathPoints.value?.length || 0,
    startCoord: pathPoints.value?.[0] ? `${pathPoints.value[0].lat.toFixed(6)},${pathPoints.value[0].lng.toFixed(6)}` : '',
    endCoord: pathPoints.value?.length ? `${pathPoints.value[pathPoints.value.length - 1].lat.toFixed(6)},${pathPoints.value[pathPoints.value.length - 1].lng.toFixed(6)}` : '',
    waypoints: buildWaypointSpeeds(pathPoints.value || []),
    compareResults: compareResults.value,
    ...extra
  }
  persistRouteData(payload)
}

const exportPathForOfflineTrain = async (
  algorithmLabel: string,
  pts: Array<{ lng: number; lat: number; alt: number }>,
  opts?: { taskKey?: string; pathWgs?: Array<{ lng: number; lat: number; alt?: number }> }
) => {
  const missionId = resolveMissionIdForRl()
  const taskKey = opts?.taskKey || ''
  const algorithm = algorithmLabel === '遗传算法' ? 'GA' : 'ASTAR'
  let exportPts = opts?.pathWgs?.length
    ? opts.pathWgs.map((p) => ({
        lng: Number(p.lng),
        lat: Number(p.lat),
        alt: Number(p.alt ?? 0)
      }))
    : pts || []
  const trainAnchor = !taskKey && missionId > 0 ? getMissionTrainAnchor(missionId) : null
  const userStart = missionAnchorStart.value
  const userEnd = missionAnchorEnd.value
  if (!opts?.pathWgs?.length && trainAnchor && userStart && userEnd && exportPts.length >= 2) {
    const userStartWgs = gcj02ToWgs84({ lng: Number(userStart.lng), lat: Number(userStart.lat) })
    const userGoalWgs = gcj02ToWgs84({ lng: Number(userEnd.lng), lat: Number(userEnd.lat) })
    const mapWgs = exportPts.map((p) => {
      const wgs = gcj02ToWgs84({ lng: Number(p.lng), lat: Number(p.lat) })
      return { lat: Number(wgs.lat), lng: Number(wgs.lng), alt: Number(p.alt ?? 0) }
    })
    exportPts = unwarpUserPathToTrainAnchors(
      mapWgs,
      trainAnchor.start,
      trainAnchor.goal,
      { lat: userStartWgs.lat, lng: userStartWgs.lng, alt: Number(exportPts[0]?.alt ?? 0) },
      { lat: userGoalWgs.lat, lng: userGoalWgs.lng, alt: Number(exportPts[exportPts.length - 1]?.alt ?? 0) }
    ).map((p) => ({ lng: p.lng, lat: p.lat, alt: Number(p.alt ?? 0) }))
  } else if (!opts?.pathWgs?.length && taskKey && exportPts.length) {
    exportPts = exportPts.map((p) => {
      const wgs = gcj02ToWgs84({ lng: Number(p.lng), lat: Number(p.lat) })
      return { lng: Number(wgs.lng), lat: Number(wgs.lat), alt: Number(p.alt ?? 0) }
    })
  }
  const path = exportPts.map((p) => [Number(p.lat), Number(p.lng), Number(p.alt ?? 0)])
  if (!path.length) return
  const cruiseAlt = Number(cruiseAltitudeM.value || 0) || 100
  const startWgs = userStart ? gcj02ToWgs84({ lng: Number(userStart.lng), lat: Number(userStart.lat) }) : null
  const endWgs = userEnd ? gcj02ToWgs84({ lng: Number(userEnd.lng), lat: Number(userEnd.lat) }) : null
  await exportExternalPath({
    algorithm,
    missionId: !taskKey && Number.isFinite(missionId) && missionId > 0 ? missionId : undefined,
    taskKey: taskKey || undefined,
    startPoint: taskKey && startWgs ? [startWgs.lat, startWgs.lng, cruiseAlt] : undefined,
    endPoint: taskKey && endWgs ? [endWgs.lat, endWgs.lng, cruiseAlt] : undefined,
    path
  })
}

/** 避免每次三算法对比都触发 Python offline_train --plot-only（会重建栅格、耗时长） */
const REGENERATE_RL_PLOTS_DEBOUNCE_MS = 120_000
let regenerateRlPlotsTimer: ReturnType<typeof setTimeout> | null = null
let lastRegenerateRlPlotsAt = 0

const syncExternalPathsForPlots = (results: typeof tripleAlgoResults.value) => {
  const mid = resolveMissionIdForRl()
  if (mid <= 0 || !results?.length) return

  const hasAstarOrGa = results.some(
    (item) => item.algorithm === 'A*算法' || item.algorithm === '遗传算法'
  )
  if (!hasAstarOrGa) return

  if (regenerateRlPlotsTimer) clearTimeout(regenerateRlPlotsTimer)
  regenerateRlPlotsTimer = setTimeout(() => {
    regenerateRlPlotsTimer = null
    void runSyncExternalPathsForPlots(results, mid)
  }, 2500)
}

const runSyncExternalPathsForPlots = async (
  results: typeof tripleAlgoResults.value,
  mid: number
) => {
  const now = Date.now()
  if (now - lastRegenerateRlPlotsAt < REGENERATE_RL_PLOTS_DEBOUNCE_MS) {
    console.info(
      `[plots] 跳过 regenerate-rl-plots（${Math.round((REGENERATE_RL_PLOTS_DEBOUNCE_MS - (now - lastRegenerateRlPlotsAt)) / 1000)}s 内已触发过）`
    )
    return
  }

  const exports: Promise<void>[] = []
  for (const item of results) {
    if (item.algorithm === 'A*算法') {
      exports.push(exportPathForOfflineTrain('A*算法', item.pathPoints || [], { pathWgs: item.pathPointsWgs }))
    } else if (item.algorithm === '遗传算法') {
      exports.push(exportPathForOfflineTrain('遗传算法', item.pathPoints || [], { pathWgs: item.pathPointsWgs }))
    }
  }
  if (!exports.length) return

  try {
    await Promise.all(exports)
    lastRegenerateRlPlotsAt = Date.now()
    const resp = await regenerateRlPlots({ missionId: mid })
    if (resp?.code === 200) {
      try {
        window.dispatchEvent(new CustomEvent('uav-reload-rl-plots', { detail: { missionId: mid, t: Date.now() } }))
      } catch {}
    } else {
      console.warn('重新生成三算法对比图失败:', resp?.msg || resp)
    }
  } catch (e) {
    console.warn('同步 Java A*/GA 路径到 Python 对比图失败:', e)
  }
}

const taskList = ref([])
const selectedTask = ref(null)
const showTaskDialog = ref(false)
const missionAnchorStart = ref<{ lat: number; lng: number } | null>(null)
const missionAnchorEnd = ref<{ lat: number; lng: number } | null>(null)

/** 解析 Python offline mission；有地图锚点时须通过地理校验，避免误用 Mission 1 Q 表 */
const resolveMissionIdForRl = () =>
  resolvePythonMissionId({
    task: selectedTask.value,
    startPointText: startPoint.value,
    endPointText: endPoint.value,
    startGeo: missionAnchorStart.value,
    endGeo: missionAnchorEnd.value,
    extraTasks: taskList.value
  })

const buildRlTaskKey = (
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
  businessTaskId?: string | number | null
) => {
  if (businessTaskId != null && String(businessTaskId).trim()) {
    return String(businessTaskId).replace(/[^\w\-]/g, '_').slice(0, 48)
  }
  return `${Number(start.lat).toFixed(5)}_${Number(start.lng).toFixed(5)}_${Number(end.lat).toFixed(5)}_${Number(end.lng).toFixed(5)}`
}

const startMarker = ref(null)
const endMarker = ref(null)
const pathPolyline = ref(null)
const failureMarkersRef = ref<any[]>([])
const isRlFailureDisplayMode = ref(false)
const latestGoalPoint = ref<{ lng: number; lat: number } | null>(null)

const enhancedManager = ref(null)

const initMap = () => {
  map.value = is3DMode.value ? create3DMap(mapContainer.value) : create2DMap(mapContainer.value)

  // 记录用户是否已手动调整视角，避免每次规划都强制重置视角
  userHasAdjustedView = false
  attachUserViewListeners()
}

const toggleMapMode = () => {
  is3DMode.value = !is3DMode.value
  clearPath({ clearStorage: false })
  setTimeout(() => initMap(), 80)
}


let userHasAdjustedView = false
const attachUserViewListeners = () => {
  const m: any = map.value
  if (!m || typeof m.addEventListener !== 'function') return
  const mark = () => { userHasAdjustedView = true }
  ;['dragstart', 'zoomstart', 'movestart', 'touchstart', 'rotatestart', 'tiltstart'].forEach((evt) => {
    try { m.addEventListener(evt, mark) } catch {}
  })
}

const maybeAutoFitViewport = () => {
  // 只有用户没手动动过视角时才自动聚焦路径；否则交给“适应路径”按钮
  if (userHasAdjustedView) return
  if (map.value && pathPoints.value?.length) {
    adjustMapViewport(map.value, pathPoints.value)
  }
}

const is3DMap = () =>
  !!map.value && typeof (map.value as any).setPitch === 'function' && typeof (map.value as any).setRotation === 'function'

const loadData = async () => {
  const [uavs, tasks] = await Promise.all([
    apiLoadUavList(),
    apiLoadTaskList()
  ])
  
  uavList.value = uavs
  taskList.value = tasks
}

const openTaskSelector = async () => {
  showTaskDialog.value = true
  taskList.value = await apiLoadTaskList()
}

const selectTask = (task) => {
  const result = apiSelectTask(
    task,
    selectedTask,
    startPoint,
    endPoint,
    selectedUav
  )
  
  if (result.success) {
    if (task?.taskType) {
      selectedPathType.value = String(task.taskType)
    }
    ElMessage.success(result.message)
    showTaskDialog.value = false
  }
}

const ROAD_PATH_TYPES = new Set(['道路巡检', '巡检'])
const WATER_PATH_TYPE = '水域巡检'

const getWaterOpts = () => ({
  waterSubType: waterSubType.value,
  riverDirection: riverDirection.value,
  riverCenterOffsetM: riverCenterOffsetM.value,
  riverBankSide: riverBankSide.value
})

const resolveWaterBaseRoute = async (startSimple: { lng: number; lat: number }, endSimple: { lng: number; lat: number }) => {
  return planWaterInspectionRoute(
    { map: map.value, targetAltitudeM: cruiseAltitudeM.value },
    startSimple,
    endSimple,
    Number(cruiseAltitudeM.value || 0) || 0,
    getWaterOpts()
  )
}

const clearComparePolylines = () => {
  clearComparePathLine(rlPolylineStore)
  clearComparePathLine(astarPolylineStore)
  clearComparePathLine(gaPolylineStore)
}

const drawTriplePathsOnMap = async () => {
  if (!map.value) return
  await nextTick()
  clearComparePolylines()
  for (const item of tripleAlgoResults.value) {
    const pts = normalizeGeoPathPoints(item?.pathPoints || [])
    if (pts.length < 2) continue
    if (item.algorithm === '强化学习') {
      drawComparePathLine(map.value, pts, '强化学习', rlPolylineStore)
    } else if (item.algorithm === 'A*算法') {
      drawComparePathLine(map.value, pts, 'A*算法', astarPolylineStore)
    } else if (item.algorithm === '遗传算法') {
      drawComparePathLine(map.value, pts, '遗传算法', gaPolylineStore)
    }
  }
  const allPts = tripleAlgoResults.value.flatMap((x) => normalizeGeoPathPoints(x.pathPoints || []))
  if (allPts.length >= 2) adjustMapViewport(map.value, allPts)
}

const normalizeGeoPathPoints = (
  rawPath: Array<{ lng?: number; lat?: number; alt?: number } | number[]>
) => {
  const out: Array<{ lng: number; lat: number; alt?: number }> = []
  for (const p of rawPath || []) {
    let lat = Number(Array.isArray(p) ? p[0] : p?.lat)
    let lng = Number(Array.isArray(p) ? p[1] : p?.lng)
    const alt = Number(Array.isArray(p) ? p[2] : p?.alt)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
      const t = lat
      lat = lng
      lng = t
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue
    out.push({ lat, lng, alt: Number.isFinite(alt) ? alt : undefined })
  }
  return out
}

const buildAlgoResult = (
  rawPath: Array<{ lng: number; lat: number; alt?: number }>,
  algorithmName: string,
  computationTime: number,
  note = '',
  pathPointsWgs?: Array<{ lng: number; lat: number; alt?: number }>
) => {
  const geo = normalizeGeoPathPoints(rawPath)
  const enriched = enrichPathWithAltitude(geo, { cruiseAlt: cruiseAltitudeM.value })
  const stats = calculatePathStats(enriched)
  return {
    algorithm: algorithmName,
    pathPoints: enriched,
    pathPointsWgs: pathPointsWgs?.length ? pathPointsWgs : undefined,
    totalDistance: stats.totalDistance,
    estimatedTime: Math.max(1, Math.round(stats.estimatedTime)),
    pointCount: enriched.length,
    computationTime,
    note
  }
}

const resolveGridPlanningTarget = (start: { lat: number; lng: number }, end: { lat: number; lng: number }, taskKey = '') => {
  const mid = resolveMissionIdForRl()
  const geoMatched = mid > 0 && isMissionGeoMatch(mid, start, end)
  return {
    missionId: geoMatched ? mid : 0,
    taskKey: geoMatched ? '' : (taskKey || buildRlTaskKey(start, end, selectedTask.value?.taskId))
  }
}

const callRlSegment = async (
  segStart: { lat: number; lng: number },
  segEnd: { lat: number; lng: number },
  cruiseAlt: number
) => {
  const mid = resolveMissionIdForRl()
  const anchorStart = missionAnchorStart.value || segStart
  const anchorEnd = missionAnchorEnd.value || segEnd
  const geoMatched = mid > 0 && isMissionGeoMatch(mid, anchorStart, anchorEnd)

  if (mid <= 0) {
    throw new Error('未能匹配 Python 离线 mission，强化学习仅支持 Mission 1–5 预训练任务')
  }
  if (!geoMatched) {
    const dist = Math.round(getMissionGeoDistance(mid, anchorStart, anchorEnd))
    throw new Error(
      `起终点与 Mission ${mid} 训练锚点偏差 ${dist} m（>${MISSION_GEO_MAX_DISTANCE_M} m），请先执行 offline_train 或更换起终点`
    )
  }

  const startWgs = gcj02ToWgs84({ lng: segStart.lng, lat: segStart.lat })
  const endWgs = gcj02ToWgs84({ lng: segEnd.lng, lat: segEnd.lat })
  const rlResp = await apiPlanRlPath({
    startPoint: [startWgs.lat, startWgs.lng, cruiseAlt],
    endPoint: [endWgs.lat, endWgs.lng, cruiseAlt],
    qOnly: true,
    replayCachedPath: true,
    stochasticInference: false,
    inferenceNoiseSigma: 0,
    disableAutoFallbackRetry: true,
    missionId: mid
  })
  if (rlResp?.code !== 200) {
    throw new Error(rlResp?.msg || '强化学习路径规划失败')
  }
  const d = rlResp.data as Record<string, unknown>
  const hasPath =
    (Array.isArray(d?.path) && (d.path as unknown[]).length > 0) ||
    (Array.isArray(d?.path_wgs84) && (d.path_wgs84 as unknown[]).length > 0) ||
    (Array.isArray(d?.pathWgs84) && (d.pathWgs84 as unknown[]).length > 0) ||
    (Array.isArray(d?.pathGrid) && (d.pathGrid as unknown[]).length > 0)
  if (!hasPath) {
    throw new Error(rlResp?.msg || '强化学习路径规划失败')
  }
  const replayCached =
    (rlResp.data as Record<string, unknown>)?.replayCached === true ||
    (rlResp.data as Record<string, unknown>)?.mode === 'replay_cached'
  const raw = decodeRlApiPathToGcj02(
    rlResp.data as Record<string, unknown>,
    mid,
    { lat: segStart.lat, lng: segStart.lng },
    { lat: segEnd.lat, lng: segEnd.lng },
    cruiseAlt,
    { warpToUserAnchors: true, defaultAlt: cruiseAlt }
  )
  if (raw.length < 2) {
    throw new Error('强化学习路径坐标转换失败，请确认 Python/Java 服务已重启')
  }
  const rawWgs = raw.map((p) => {
    const wgs = gcj02ToWgs84({ lng: p.lng, lat: p.lat })
    return { lat: wgs.lat, lng: wgs.lng, alt: p.alt }
  })
  return {
    raw,
    rawWgs,
    rlMeta: {
      ...rlResp.data,
      pyMissionId: mid,
      qTableMode: replayCached ? 'mission_replay_cache' : 'mission_offline'
    }
  }
}

const runRlPlanning = async (start: any, end: any) => {
  const cruiseAlt = Number(cruiseAltitudeM.value || 0) || 0
  const t0 = performance.now()
  const { raw, rlMeta } = await callRlSegment(start, end, cruiseAlt)
  planObstacles.value = Array.isArray(rlMeta?.obstacles) ? [...rlMeta.obstacles] : []
  const note =
    rlMeta?.qTableMode === 'mission_replay_cache'
      ? rlMeta?.rlSuccess === false
        ? '离线训练缓存路径（标记未达终点）'
        : '离线训练缓存路径复现（WGS84→GCJ02 配准，未做 Q 表推理）'
      : rlMeta?.rlSuccess === false
        ? '离线 Q 表推理未到达终点'
        : '离线 Q 表推理（Python 预训练 mission）'
  return {
    result: buildAlgoResult(raw, '强化学习', Math.round(performance.now() - t0), note),
    rlMeta
  }
}

const anchorPathEndpoints = (
  raw2d: Array<{ lng: number; lat: number }>,
  start: { lng: number; lat: number },
  end: { lng: number; lat: number }
) => {
  if (!raw2d?.length) return raw2d
  const out = raw2d.map((p) => ({ lng: Number(p.lng), lat: Number(p.lat) }))
  out[0] = { lng: Number(start.lng), lat: Number(start.lat) }
  out[out.length - 1] = { lng: Number(end.lng), lat: Number(end.lat) }
  return out
}

/** 非道路巡检：A* 与 GA 走 Python 2.5D 建筑栅格（与 RL 同环境） */
const runPythonGridPlanning = async (
  start: { lng: number; lat: number },
  end: { lng: number; lat: number },
  algorithm: 'astar' | 'ga',
  opts?: { taskKey?: string; missionId?: number }
) => {
  const cruiseAlt = Number(cruiseAltitudeM.value || 0) || 100
  const startWgs = gcj02ToWgs84({ lng: start.lng, lat: start.lat })
  const endWgs = gcj02ToWgs84({ lng: end.lng, lat: end.lat })
  const resp: any = await planGridPath({
    startPoint: [startWgs.lat, startWgs.lng, cruiseAlt],
    endPoint: [endWgs.lat, endWgs.lng, cruiseAlt],
    taskKey: opts?.missionId ? undefined : opts?.taskKey,
    missionId: opts?.missionId && opts.missionId > 0 ? opts.missionId : undefined,
    algorithm
  })
  if (resp?.code !== 200 || !resp?.data?.path?.length) {
    throw new Error(resp?.msg || resp?.data?.error || 'Python 栅格路径规划失败')
  }
  const rawWgs = normalizeGeoPathPoints(resp.data.path as any[])
  const rawGcj = convertPathWgs84ToGcj02(rawWgs as any).map((p) => ({
    lng: p.lng,
    lat: p.lat,
    alt: Number(p.alt ?? cruiseAlt)
  }))
  const note =
    algorithm === 'ga'
      ? 'Python 2.5D 建筑栅格遗传算法（高空避障）'
      : 'Python 2.5D 建筑栅格 A*（高空避障）'
  return { rawGcj, rawWgs, note }
}

const shouldUsePythonGridPlanner = () =>
  selectedPathType.value !== WATER_PATH_TYPE && !ROAD_PATH_TYPES.has(selectedPathType.value)

const planGaodeRoadPath2d = async (
  start: { lng: number; lat: number },
  end: { lng: number; lat: number }
) => {
  const road = await planRoadInspectionRoute(
    { map: map.value, targetAltitudeM: cruiseAltitudeM.value },
    start,
    end,
    Number(cruiseAltitudeM.value || 0) || 0
  )
  const raw2d = anchorPathEndpoints(
    (road.pathPoints || []).map((p) => ({ lng: p.lng, lat: p.lat })),
    start,
    end
  )
  if (raw2d.length < 2) throw new Error('高德道路路径过短')
  return { raw2d, note: road.algorithm || '高德驾车路网规划' }
}

const runAstarPlanning = async (
  start: any,
  end: any,
  polygons: any[],
  taskKey = ''
) => {
  const t0 = performance.now()
  const startSimple = { lng: start.lng, lat: start.lat }
  const endSimple = { lng: end.lng, lat: end.lat }
  const useAvoid = !DISABLE_NOFLY_ON_DRIVING_PLAN && polygons.length > 0
  let raw2d: Array<{ lng: number; lat: number }>
  let note = ''

  if (selectedPathType.value === WATER_PATH_TYPE) {
    try {
      const water = await resolveWaterBaseRoute(startSimple, endSimple)
      raw2d = anchorPathEndpoints(
        (water.pathPoints || []).map((p) => ({ lng: p.lng, lat: p.lat })),
        startSimple,
        endSimple
      )
      note = water.algorithm || '水域步行/覆盖路网'
    } catch (e: any) {
      raw2d = useAvoid
        ? planPathAStarGridAvoidPolygons(startSimple, endSimple, polygons)
        : planPathAStarGrid(startSimple, endSimple)
      note = `水域路网规划失败，已降级网格 A*：${e?.message || e}`
    }
  } else if (ROAD_PATH_TYPES.has(selectedPathType.value)) {
    try {
      const road = await planGaodeRoadPath2d(startSimple, endSimple)
      raw2d = road.raw2d
      note = road.note
    } catch (e: any) {
      raw2d = useAvoid
        ? planPathAStarGridAvoidPolygons(startSimple, endSimple, polygons)
        : planPathAStarGrid(startSimple, endSimple)
      note = `高德道路规划失败，已降级网格 A*：${e?.message || e}`
    }
  } else {
    const gridTarget = resolveGridPlanningTarget(startSimple, endSimple, taskKey)
    try {
      const grid = await runPythonGridPlanning(startSimple, endSimple, 'astar', gridTarget)
      raw2d = anchorPathEndpoints(
        grid.rawGcj.map((p) => ({ lng: p.lng, lat: p.lat })),
        startSimple,
        endSimple
      )
      note = grid.note
      const wgsPts = grid.rawWgs.map((p) => ({ lng: p.lng, lat: p.lat, alt: p.alt }))
      return buildAlgoResult(raw2d, 'A*算法', Math.round(performance.now() - t0), note, wgsPts)
    } catch (e: any) {
      raw2d = useAvoid
        ? planPathAStarGridAvoidPolygons(startSimple, endSimple, polygons)
        : planPathAStarGrid(startSimple, endSimple)
      note = `Python 栅格 A* 失败，已降级本地网格：${e?.message || e}`
    }
  }

  const result = buildAlgoResult(raw2d, 'A*算法', Math.round(performance.now() - t0), note)
  return result
}

const runGaPlanning = async (
  start: any,
  end: any,
  polygons: any[],
  taskKey = ''
) => {
  const t0 = performance.now()
  const startSimple = { lng: start.lng, lat: start.lat }
  const endSimple = { lng: end.lng, lat: end.lat }
  const useAvoid = !DISABLE_NOFLY_ON_DRIVING_PLAN && polygons.length > 0
  const finishGa = (
    raw2d: Array<{ lng: number; lat: number }>,
    note: string,
    pathPointsWgs?: Array<{ lng: number; lat: number; alt?: number }>
  ) => buildAlgoResult(raw2d, '遗传算法', Math.round(performance.now() - t0), note, pathPointsWgs)

  if (selectedPathType.value === WATER_PATH_TYPE) {
    try {
      const water = await resolveWaterBaseRoute(startSimple, endSimple)
      const base2d = anchorPathEndpoints(
        (water.pathPoints || []).map((p) => ({ lng: p.lng, lat: p.lat })),
        startSimple,
        endSimple
      )
      if (base2d.length < 2) throw new Error('水域基准路径过短')
      const raw2d = planPathGeneticAlongPolyline(base2d, {
        maxLateralM: Math.min(40, Math.max(12, riverCenterOffsetM.value * 0.6)),
        riverBankSide: riverBankSide.value
      })
      const note =
        waterSubType.value === '湖泊'
          ? '沿湖泊覆盖线遗传优化'
          : '沿步行/河道走廊遗传优化'
      return finishGa(raw2d, note)
    } catch (e: any) {
      const raw2d = useAvoid
        ? planPathGeneticGridAvoidPolygons(startSimple, endSimple, polygons)
        : planPathGeneticGrid(startSimple, endSimple)
      return finishGa(raw2d, `水域走廊 GA 失败，已降级网格：${e?.message || e}`)
    }
  }

  if (ROAD_PATH_TYPES.has(selectedPathType.value)) {
    try {
      const road = await planGaodeRoadPath2d(startSimple, endSimple)
      return finishGa(road.raw2d, road.note)
    } catch (e: any) {
      const raw2d = useAvoid
        ? planPathGeneticGridAvoidPolygons(startSimple, endSimple, polygons)
        : planPathGeneticGrid(startSimple, endSimple)
      return finishGa(raw2d, `高德道路规划失败，已降级网格 GA：${e?.message || e}`)
    }
  }

  const gridTarget = resolveGridPlanningTarget(startSimple, endSimple, taskKey)
  try {
    const grid = await runPythonGridPlanning(startSimple, endSimple, 'ga', gridTarget)
    const raw2d = anchorPathEndpoints(
      grid.rawGcj.map((p) => ({ lng: p.lng, lat: p.lat })),
      startSimple,
      endSimple
    )
    const wgsPts = grid.rawWgs.map((p) => ({ lng: p.lng, lat: p.lat, alt: p.alt }))
    return finishGa(raw2d, grid.note, wgsPts)
  } catch (e: any) {
    const raw2d = useAvoid
      ? planPathGeneticGridAvoidPolygons(startSimple, endSimple, polygons)
      : planPathGeneticGrid(startSimple, endSimple)
    return finishGa(raw2d, `Python 栅格 GA 失败，已降级本地网格：${e?.message || e}`)
  }
}

const applyPlanningResults = async (results: typeof tripleAlgoResults.value, rlMeta?: any) => {
  if (!results.length) throw new Error('未生成有效路径')
  tripleAlgoResults.value = results
  showComparePanel.value = true
  compareResults.value = null
  const primary = results.find((x) => x.algorithm === '强化学习') || results[0]
  pathPoints.value = primary.pathPoints
  pathStats.value = {
    totalDistance: primary.totalDistance,
    estimatedTime: primary.estimatedTime,
    pointCount: primary.pointCount,
    avgSpeed: 10,
    startCoord: primary.pathPoints[0]
      ? `${primary.pathPoints[0].lat.toFixed(6)},${primary.pathPoints[0].lng.toFixed(6)}`
      : '',
    endCoord: primary.pathPoints.length
      ? `${primary.pathPoints[primary.pathPoints.length - 1].lat.toFixed(6)},${primary.pathPoints[primary.pathPoints.length - 1].lng.toFixed(6)}`
      : ''
  }
  showPathInfo.value = true
  await drawTriplePathsOnMap()
  await initEnhancedFeatures()
  saveCurrentToRouteInfo({
    pathType: selectedPathType.value,
    tripleAlgoResults: results,
    algorithm: primary.algorithm,
    rlMeta: rlMeta || undefined,
    rlTaskKey: rlMeta?.taskKey || undefined,
    obstacles: planObstacles.value
  })
  if (results.length >= 3) {
    const finalPathPackage = results.map((item) => ({
      algorithm: item.algorithm,
      coordinateSystem: 'GCJ02',
      totalDistance: item.totalDistance,
      estimatedTime: item.estimatedTime,
      pointCount: item.pointCount,
      note: item.note,
      pathPoints: item.pathPoints
    }))
    console.info('[三算法最终路径信息包]', finalPathPackage)
    void logFinalPathPackage({
      pathType: selectedPathType.value,
      generatedAt: new Date().toISOString(),
      paths: finalPathPackage
    }).catch(() => {})
  }
  try {
    const mid = resolveMissionIdForRl()
    window.dispatchEvent(
      new CustomEvent('uav-reload-rl-plots', { detail: { missionId: mid > 0 ? mid : undefined, t: Date.now() } })
    )
  } catch {}
}

const calculateSinglePathByApi = async (start: any, end: any) => {
  planningLoading.value = true
  try {
    missionAnchorStart.value = { lat: Number(start.lat), lng: Number(start.lng) }
    missionAnchorEnd.value = { lat: Number(end.lat), lng: Number(end.lng) }
    latestGoalPoint.value = { lng: end.lng, lat: end.lat }
    planObstacles.value = []
    tripleAlgoResults.value = []
    clearComparePolylines()

    let one: (typeof tripleAlgoResults.value)[0] | null = null
    let rlMeta: any = null
    const algo = singleAlgorithm.value

    if (algo === '强化学习') {
      const pyMission = resolveMissionIdForRl()
      const geoMatched =
        pyMission > 0 &&
        isMissionGeoMatch(pyMission, missionAnchorStart.value || start, missionAnchorEnd.value || end)
      if (!geoMatched) {
        throw new Error(
          pyMission > 0
            ? `起终点未对齐 Mission ${pyMission} 预训练锚点，强化学习不可用`
            : '未匹配 Python 离线 mission（Mission 1–5），强化学习不可用'
        )
      }
      const pack = await runRlPlanning(start, end)
      one = pack.result
      rlMeta = pack.rlMeta
      if (rlMeta?.rlSuccess === false) {
        ElMessage.warning('离线 Q 表推理未到达终点，仍展示轨迹')
      }
    } else if (algo === 'A*算法') {
      const gridTaskKey = shouldUsePythonGridPlanner()
        ? buildRlTaskKey(start, end, selectedTask.value?.taskId)
        : ''
      one = await runAstarPlanning(start, end, [], gridTaskKey)
    } else {
      const gridTaskKey = shouldUsePythonGridPlanner()
        ? buildRlTaskKey(start, end, selectedTask.value?.taskId)
        : ''
      one = await runGaPlanning(start, end, [], gridTaskKey)
    }

    await applyPlanningResults([one], rlMeta)
    if (one && (one.algorithm === 'A*算法' || one.algorithm === '遗传算法')) {
      void syncExternalPathsForPlots([one])
    }
    runUavEnvPlot(start, end)
    ElMessage.success(`${algo} 规划完成（${selectedPathType.value}）`)
  } catch (error: any) {
    console.error('路径规划失败:', error)
    ElMessage.error('路径规划失败：' + (error?.message || String(error)))
  } finally {
    planningLoading.value = false
  }
}

const planPath = async () => {
  if (!startPoint.value || !endPoint.value) {
    ElMessage.error('请输入起始地点和终点')
    return
  }

  if (!selectedUav.value) {
    ElMessage.error('请选择无人机')
    return
  }

  try {
    const startPointObj = await getGeoPoint(startPoint.value, map.value, '南昌市')
    const endPointObj = await getGeoPoint(endPoint.value, map.value, '南昌市')
    startMarker.value = createGeoMarker(map.value, startPointObj, is3DMode.value)
    endMarker.value = createGeoMarker(map.value, endPointObj, is3DMode.value)
    if (planExecutionMode.value === 'single') {
      await calculateSinglePathByApi(startPointObj, endPointObj)
    } else {
      await calculatePathByApi(startPointObj, endPointObj)
    }
  } catch (error: any) {
    console.error('路径规划失败:', error)
    ElMessage.error('路径规划失败：' + (error?.message || String(error)))
  }
}

const goAlgorithmCompare = () => {
  router.push({ path: '/uavNavigation/algorithmCompare' }).catch(() => {})
}

function applyBackendPathSingle(data: { pathPoints: any[] }) {
  const raw = data.pathPoints.map(normalizePathPoint)
  pathPoints.value = enrichPathWithAltitude(raw, {
    cruiseAlt: cruiseAltitudeM.value,
    preserveExistingAlt: true
  })
  showComparePanel.value = false
  compareResults.value = null
  if (map.value && pathPoints.value.length) maybeAutoFitViewport()
  simulateFlight()
  initEnhancedFeatures()
  // 保存供 routeInfo 展示
  try {
    pathStats.value.totalDistance = data?.totalDistance || pathStats.value.totalDistance
    pathStats.value.estimatedTime = data?.estimatedTime || pathStats.value.estimatedTime
  } catch {}
  saveCurrentToRouteInfo()
}

const calculatePathByApi = async (start, end) => {
  planningLoading.value = true
  try {
    missionAnchorStart.value = { lat: Number(start.lat), lng: Number(start.lng) }
    missionAnchorEnd.value = { lat: Number(end.lat), lng: Number(end.lng) }
    const pyMission = resolveMissionIdForRl()
    const geoMatched =
      pyMission > 0 &&
      isMissionGeoMatch(pyMission, missionAnchorStart.value, missionAnchorEnd.value)
    const gridTaskKey = shouldUsePythonGridPlanner()
      ? buildRlTaskKey(start, end, selectedTask.value?.taskId)
      : ''

    if (geoMatched) {
      ElMessage.info(
        `三算法对比（mission=${pyMission}）：RL 复现 offline_train 缓存路径（非在线 Q 推理）；A*/GA 使用高德路网（道路巡检）或栅格（其他类型）。`
      )
    } else {
      ElMessage.info('当前起终点未匹配预训练 mission，强化学习不可用；A*/GA 按路径类型规划。')
    }
    latestGoalPoint.value = { lng: end.lng, lat: end.lat }
    isRlFailureDisplayMode.value = false
    planObstacles.value = []
    tripleAlgoResults.value = []
    clearComparePolylines()

    const [rlPack, astarResult, gaResult] = await Promise.all([
      (geoMatched
        ? runRlPlanning(start, end)
        : Promise.resolve({
            error:
              pyMission > 0
                ? `起终点未对齐 Mission ${pyMission} 预训练锚点`
                : '未匹配 Python 离线 mission（Mission 1–5）'
          })
      ).catch((e: any) => ({ error: e?.message || String(e) })),
      Promise.resolve()
        .then(() => runAstarPlanning(start, end, [], gridTaskKey))
        .catch((e: any) => ({ error: e?.message || String(e) })),
      Promise.resolve()
        .then(() => runGaPlanning(start, end, [], gridTaskKey))
        .catch((e: any) => ({ error: e?.message || String(e) }))
    ])

    const results: typeof tripleAlgoResults.value = []
    let rlMeta: any = null
    let rlErr = '未知错误'
    let astarErr = '未知错误'
    let gaErr = '未知错误'

    if (rlPack && !(rlPack as any).error && (rlPack as any).result) {
      results.push((rlPack as any).result)
      rlMeta = (rlPack as any).rlMeta
      if (rlMeta?.rlSuccess === false) {
        isRlFailureDisplayMode.value = true
        ElMessage.warning('离线 Q 表推理未到达终点，已保留轨迹用于对比。')
      }
    } else {
      rlErr = (rlPack as any)?.error || '未知错误'
      ElMessage.warning(`强化学习失败：${rlErr}`)
    }

    if (astarResult && !(astarResult as any).error) {
      results.push(astarResult as any)
    } else {
      astarErr = (astarResult as any)?.error || '未知错误'
      ElMessage.warning(`A* 失败：${astarErr}`)
    }

    if (gaResult && !(gaResult as any).error) {
      results.push(gaResult as any)
    } else {
      gaErr = (gaResult as any)?.error || '未知错误'
      ElMessage.warning(`遗传算法失败：${gaErr}`)
    }

    if (!results.length) {
      throw new Error(`三种算法均未生成有效路径。强化学习: ${rlErr}；A*: ${astarErr}；GA: ${gaErr}`)
    }

    await applyPlanningResults(results, rlMeta)
    if (geoMatched) {
      void syncExternalPathsForPlots(results)
    }
    runUavEnvPlot(start, end)
    const rlModeLabel = geoMatched ? `离线Q表 mission=${pyMission}` : '不可用'
    ElMessage.success(
      `三算法对比完成（${selectedPathType.value}，RL=${rlModeLabel}）：已绘制可用算法路径`
    )
  } catch (error: any) {
    console.error('路径规划失败:', error)
    ElMessage.error('路径规划失败：' + (error?.message || String(error)))
  } finally {
    planningLoading.value = false
  }
}

const navigateToRouteInfo = () => {
  const savedData = localStorage.getItem('uav_route_data')
  if (!savedData) {
    ElMessage.warning('请先进行路径规划')
    return
  }
  window.location.href = '/#/uav-navigation/route-info'
}

const calculatePathWithBaiduMap = (start, end) => {
  // 保留函数名用于最小改动：内部已改为 AMap 驾车路线
  return new Promise((resolve, reject) => {
    try {
      if (typeof AMap === 'undefined') {
        reject(new Error('AMap API 未加载'))
        return
      }

      const metersToLngLatDelta = (lng: number, lat: number, dxM: number, dyM: number) => {
        const mPerDegLat = 111320
        const dLat = dyM / mPerDegLat
        const dLng = dxM / (mPerDegLat * Math.cos((lat * Math.PI) / 180))
        return { lng: lng + dLng, lat: lat + dLat }
      }

      const polygonCentroid = (poly: any[]) => {
        if (!Array.isArray(poly) || poly.length < 3) return null
        let sx = 0
        let sy = 0
        for (const p of poly) {
          sx += Number(p[0])
          sy += Number(p[1])
        }
        return { lng: sx / poly.length, lat: sy / poly.length }
      }

      const polygonRadiusMetersApprox = (poly: any[]) => {
        if (!Array.isArray(poly) || poly.length < 3) return 500
        let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
        for (const p of poly) {
          const lng = Number(p[0])
          const lat = Number(p[1])
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
          minLng = Math.min(minLng, lng)
          maxLng = Math.max(maxLng, lng)
          minLat = Math.min(minLat, lat)
          maxLat = Math.max(maxLat, lat)
        }
        if (!Number.isFinite(minLng)) return 500
        // 以经纬差粗略估算米
        const mPerDegLat = 111320
        const dyM = (maxLat - minLat) * mPerDegLat
        const dxM = (maxLng - minLng) * mPerDegLat * Math.cos(((minLat + maxLat) / 2) * Math.PI / 180)
        return Math.max(200, Math.sqrt(dxM * dxM + dyM * dyM) / 2)
      }

      const buildDetourCandidates = (polygons: any[], s: any, e: any) => {
        const all: Array<{ lng: number; lat: number }> = []
        const vx = Number(e.lng) - Number(s.lng)
        const vy = Number(e.lat) - Number(s.lat)
        const len = Math.sqrt(vx * vx + vy * vy) || 1
        const ux = vx / len
        const uy = vy / len
        // 法向量
        const nx = -uy
        const ny = ux

        for (const poly of polygons || []) {
          const c = polygonCentroid(poly)
          if (!c) continue
          const r = polygonRadiusMetersApprox(poly) + 300
          // 环向候选
          const angles = [0, 45, 90, 135, 180, 225, 270, 315]
          for (const deg of angles) {
            const rad = (deg * Math.PI) / 180
            const dx = Math.cos(rad) * r
            const dy = Math.sin(rad) * r
            all.push(metersToLngLatDelta(c.lng, c.lat, dx, dy))
          }
          // 顺路两侧偏置候选（更容易仍沿道路绕行）
          const side = r * 1.1
          all.push(metersToLngLatDelta(c.lng, c.lat, nx * side, ny * side))
          all.push(metersToLngLatDelta(c.lng, c.lat, -nx * side, -ny * side))
          all.push(metersToLngLatDelta(c.lng, c.lat, ux * side * 0.6 + nx * side, uy * side * 0.6 + ny * side))
          all.push(metersToLngLatDelta(c.lng, c.lat, ux * side * 0.6 - nx * side, uy * side * 0.6 - ny * side))
        }
        // 去重
        const uniq = new Map<string, { lng: number; lat: number }>()
        for (const p of all) {
          const k = `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`
          if (!uniq.has(k)) uniq.set(k, p)
        }
        return Array.from(uniq.values())
      }

      const drivingResultToRaw2d = (result: any) => {
        const steps = result.routes?.[0]?.steps || []
        const raw2d: { lng: number; lat: number }[] = []
        for (const step of steps) {
          const path = step?.path || []
          for (const p of path) {
            const lng = Array.isArray(p) ? p[0] : typeof p?.getLng === 'function' ? p.getLng() : p?.lng
            const lat = Array.isArray(p) ? p[1] : typeof p?.getLat === 'function' ? p.getLat() : p?.lat
            if (lng != null && lat != null && !Number.isNaN(Number(lng)) && !Number.isNaN(Number(lat))) {
              raw2d.push({ lng: Number(lng), lat: Number(lat) })
            }
          }
        }
        return raw2d
      }

      const tryDrivingWithWaypoint = (driving: any, wp: { lng: number; lat: number }) =>
        new Promise<any>((resolve2, reject2) => {
          driving.search(
            [start.lng, start.lat],
            [end.lng, end.lat],
            { waypoints: [[wp.lng, wp.lat]] },
            (status: any, result: any) => {
              const ok = status === 'complete' || result?.info === 'OK' || result?.info === 'OK.'
              if (!ok) {
                reject2(new Error('Driving waypoint search failed'))
                return
              }
              resolve2(result)
            }
          )
        })

      const ensureDriving = () =>
        new Promise<void>((r) => {
          if (!AMap || typeof AMap.plugin !== 'function') return r()
          AMap.plugin(['AMap.Driving'], () => r())
        })

      const fallbackLocal = async (reason?: string) => {
        try {
          if (reason) ElMessage.warning(`${reason}，已降级为本地网格路径`)
          const zones = DISABLE_NOFLY_ON_DRIVING_PLAN ? [] : await loadNoFlyZones()
          const polygons = (zones || [])
            .filter((z: any) => Array.isArray(z?.path) && z.path.length >= 3)
            .map((z: any) => z.path)
          const grid =
            !DISABLE_NOFLY_ON_DRIVING_PLAN && polygons.length
              ? planPathDijkstraGridAvoidPolygons(
                  { lng: start.lng, lat: start.lat },
                  { lng: end.lng, lat: end.lat },
                  polygons
                )
              : planPathDijkstraGrid({ lng: start.lng, lat: start.lat }, { lng: end.lng, lat: end.lat })
          pathPoints.value = enrichPathWithAltitude(grid, { cruiseAlt: cruiseAltitudeM.value })
          if (map.value && pathPoints.value.length > 0) {
            adjustMapViewport(map.value, pathPoints.value)
          }
          simulateFlight()
          resolve(true)
        } catch (e) {
          reject(e)
        }
      }

      ensureDriving()
        .then(() => {
          if (typeof AMap.Driving !== 'function') {
            fallbackLocal('AMap.Driving 未就绪')
            return
          }

          let driving: any
          try {
            driving = new AMap.Driving({ map: null })
          } catch (e) {
            fallbackLocal('AMap.Driving 初始化失败')
            return
          }

          driving.search([start.lng, start.lat], [end.lng, end.lat], {}, (status, result) => {
            const ok = status === 'complete' || result?.info === 'OK' || result?.info === 'OK.'
            if (!ok) {
              fallbackLocal('AMap 驾车路线规划失败')
              return
            }

            const raw2d = drivingResultToRaw2d(result)

            if (raw2d.length < 2) {
              fallbackLocal('AMap 返回空路径')
              return
            }

            void (async () => {
              try {
                const candidate = enrichPathWithAltitude(raw2d, { cruiseAlt: cruiseAltitudeM.value })
                if (DISABLE_NOFLY_ON_DRIVING_PLAN) {
                  pathPoints.value = candidate
                } else {
                const zones = await loadNoFlyZones()
                const nfCheck = checkNoFlyZoneIntersection(candidate, zones)
                const polygons = (zones || [])
                  .filter((z: any) => Array.isArray(z?.path) && z.path.length >= 3)
                  .map((z: any) => z.path)

                if (nfCheck?.hasViolation && polygons.length) {
                  // 驾车 + 途经点绕行；失败再本地网格（已移除「道路折线图删边+Dijkstra」实验方案）
                  let found = false
                  const candidates = buildDetourCandidates(polygons, start, end)
                  for (const wp of candidates.slice(0, 20)) {
                    try {
                      const detourResult = await tryDrivingWithWaypoint(driving, wp)
                      const detourRaw = drivingResultToRaw2d(detourResult)
                      if (detourRaw.length < 2) continue
                      const detourCandidate = enrichPathWithAltitude(detourRaw, { cruiseAlt: cruiseAltitudeM.value })
                      const detourCheck = checkNoFlyZoneIntersection(detourCandidate, zones)
                      if (!detourCheck?.hasViolation) {
                        ElMessage.warning('路径穿越禁飞区，已自动绕行（沿道路-途经点）')
                        pathPoints.value = detourCandidate
                        found = true
                        break
                      }
                    } catch {}
                  }
                  if (!found) {
                    ElMessage.warning('路径穿越禁飞区，已自动绕行（本地网格）')
                    const grid = planPathDijkstraGridAvoidPolygons(
                      { lng: start.lng, lat: start.lat },
                      { lng: end.lng, lat: end.lat },
                      polygons
                    )
                    pathPoints.value = enrichPathWithAltitude(grid, { cruiseAlt: cruiseAltitudeM.value })
                  }
                } else {
                  pathPoints.value = candidate
                }
                }
              } catch {
                pathPoints.value = enrichPathWithAltitude(raw2d, { cruiseAlt: cruiseAltitudeM.value })
              }
              if (pathPoints.value.length > 0) {
                adjustMapViewport(map.value, pathPoints.value)
              }
              simulateFlight()
              resolve(true)
            })()
          })
        })
        .catch(() => fallbackLocal('Driving 插件加载失败'))
    } catch (e) {
      reject(e)
    }
  })
}

const simulateFlight = async () => {
  if (!pathPoints.value || pathPoints.value.length === 0) return

  const result = await simulateFlight2D(
    map.value,
    pathPoints.value,
    uavIconMarker,
    pathPolyline,
    flowAnimationRef,
    animationIdRef,
    flattenPathCoordinates,
    calculatePathStats,
    {
      failureDisplay: {
        enabled: Boolean(isRlFailureDisplayMode.value),
        goal: latestGoalPoint.value
      },
      failureMarkersRef
    }
  )

  if (result) {
    pathStats.value = result.pathStats
    showPathInfo.value = true
  }
}

const initEnhancedFeatures = async () => {
  if (enhancedManager.value) {
    enhancedManager.value.destroy()
    enhancedManager.value = null
  }
  enhancedManager.value = createPathPlanningEnhanced({
    enableDraggableMarkers: ENABLE_DRAGGABLE_PATH_MARKERS,
    autoLoadWeather: true,
    autoLoadNoFlyZones: false,
    getLivePathPoints: () => pathPoints.value
  })

  await enhancedManager.value.init(map.value, pathPoints.value)
  
  enhancedManager.value.callbacks.onWarningsChanged = (warnings, weather, score) => {
    weatherInfo.value = weather
    weatherWarning.value = warnings.join('\n')
    suitabilityScore.value = score
    
    if (warnings.length > 0) {
      ElMessage.warning(warnings[0])
    }
  }
}


const clearPath = (opts: { clearStorage?: boolean } | Event = {}) => {
  const clearStorage =
    opts && typeof (opts as { clearStorage?: boolean }).clearStorage === 'boolean'
      ? (opts as { clearStorage: boolean }).clearStorage
      : true
  const stop3D = typeof flowAnimationRef.value === 'object' ? flowAnimationRef.value?.stop : null
  stopAllFlightAnimations(animationManager, stop3D, flowAnimationRef, animationIdRef)

  if (map.value) {
    removeOverlayFromMap(map.value, startMarker.value)
    removeOverlayFromMap(map.value, endMarker.value)
    removeOverlayFromMap(map.value, pathPolyline.value)
    removeOverlayFromMap(map.value, uavIconMarker.value)
  }
  // 清除引用，避免后续重复 removeOverlay / dispose
  startMarker.value = null
  endMarker.value = null
  pathPolyline.value = null
  uavIconMarker.value = null
  failureMarkersRef.value?.forEach((m) => m?.setMap?.(null))
  failureMarkersRef.value = []
  isRlFailureDisplayMode.value = false
  
  planObstacles.value = []
  pathPoints.value = []
  showPathInfo.value = false
  pathStats.value = {
    totalDistance: 0,
    estimatedTime: 0,
    pointCount: 0,
    avgSpeed: 10,
    startCoord: '',
    endCoord: ''
  }
  weatherInfo.value = null
  weatherWarning.value = ''
  suitabilityScore.value = null
  showComparePanel.value = false
  compareResults.value = null
  tripleAlgoResults.value = []
  clearComparePolylines()
  // 只有用户显式“清除路径”时才清空缓存；页面卸载/切换时不要清空，便于地图展示/路径信息复用
  if (clearStorage) {
    try {
      localStorage.removeItem('uav_route_data')
    } catch {}
  }

  if (enhancedManager.value) {
    enhancedManager.value.destroy()
    enhancedManager.value = null
  }
}

const selectBestUav = () => {
  if (!pathPoints.value || pathPoints.value.length === 0) {
    ElMessage.warning('请先规划路径')
    return
  }
  
  const recommendedUav = apiRecommendUav(
    pathPoints.value,
    uavList.value,
    map.value
  )
  
  if (recommendedUav) {
    selectedUav.value = recommendedUav.uavId
    ElMessage.success(`推荐使用：${recommendedUav.uavModel} (续航${recommendedUav.uavMaxFlightTime}分钟)`)
  } else {
    ElMessage.warning('未找到合适的无人机')
  }
}

const uavStatusLabels: Record<number, string> = {
  1: '正常',
  2: '任务中',
  3: '维修中',
  4: '停用'
}

const formatDuration = (sec: number) => {
  if (!sec || sec <= 0) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`
}

const currentUav = computed(() =>
  uavList.value.find((x: any) => x.uavId === selectedUav.value) || null
)

const flightTelemetry = computed(() => {
  const uav = currentUav.value as any
  const stats = pathStats.value
  const speed = Number(stats.avgSpeed || 10) || 10
  const altitude = Number(cruiseAltitudeM.value || 0) || 0
  const estSeconds = Number(stats.estimatedTime || 0) || 0
  const maxMinutes = Number(uav?.uavMaxFlightTime || 0) || 0
  const maxSeconds = maxMinutes * 60
  const powerPercent =
    maxSeconds > 0 && estSeconds > 0
      ? Math.min(100, Math.round((estSeconds / maxSeconds) * 100))
      : 0
  const remainPercent =
    maxSeconds > 0 && estSeconds > 0 ? Math.max(0, 100 - powerPercent) : 100
  const remainMinutes =
    maxMinutes > 0 && estSeconds > 0
      ? Math.max(0, Math.round(maxMinutes - estSeconds / 60))
      : maxMinutes || null

  return {
    model: uav?.uavModel || uav?.uavCode || '未选择无人机',
    code: uav?.uavCode || '—',
    type: uav?.uavType || '—',
    status: uavStatusLabels[uav?.uavStatus as number] || (uav ? '未知' : '—'),
    statusCode: uav?.uavStatus,
    speed,
    speedKmh: (speed * 3.6).toFixed(1),
    altitude,
    totalDistance: stats.totalDistance || 0,
    pointCount: stats.pointCount || 0,
    estSeconds,
    estTimeText: formatDuration(estSeconds),
    remainPercent,
    powerPercent,
    remainMinutes,
    batteryType: uav?.uavBatteryType || '—',
    batteryCapacity: uav?.uavBatteryCapacity ?? '—',
    maxFlightTime: maxMinutes || null,
    hasPath: Boolean(showPathInfo.value && stats.totalDistance > 0),
    pathType: selectedPathType.value
  }
})

const getUavStatusTagType = (code?: number) => {
  const types: Record<number, string> = { 1: 'success', 2: 'warning', 3: 'danger', 4: 'info' }
  return types[code || 0] || 'info'
}

const onMapContainerResize = () => {
  try {
    ;(map.value as any)?.resize?.()
  } catch {}
}

onMounted(async () => {
  restorePlanningForm()
  window.addEventListener('resize', onMapContainerResize)
  setTimeout(() => {
    initMap()
    setTimeout(onMapContainerResize, 120)
  }, 500)

  await loadData()
})

onUnmounted(() => {
  window.removeEventListener('resize', onMapContainerResize)
  // 页面卸载：仅清理覆盖物/引用，不清理缓存数据（uav_route_data）
  clearPath({ clearStorage: false })
})
</script>

<template>
  <div class="app-container path-planning-page">
    <div class="pp-page__bg" aria-hidden="true" />
    <div class="pp-page__decor" aria-hidden="true">
      <svg class="pp-page__lines" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <path class="pp-line" d="M-20 180 Q 320 120, 580 240 T 1100 160" />
        <path class="pp-line" d="M180 880 Q 460 640, 720 760 T 1300 520" />
      </svg>
    </div>

    <header class="pp-page-header fade-in">
      <div>
        <h1 class="pp-page-header__title">路径规划</h1>
        <p class="pp-page-header__desc">地图预览航线，下方配置参数并执行规划</p>
      </div>
      <span class="pp-page-header__badge">{{ selectedPathType }}</span>
    </header>

    <div class="card pp-card pp-workspace fade-in">
      <div class="pp-map-section">
        <div class="pp-map-card__head">
          <span class="pp-map-card__title">航线地图</span>
          <span class="pp-map-card__meta">{{ is3DMode ? '3D 视图' : '2D 视图' }}</span>
        </div>
        <div class="map-workspace">
          <div class="map-container" :class="{ 'with-three-panel': is3DMode }">
            <div class="map-stack">
              <div ref="mapContainer" class="baidu-map-mount"></div>

              <div v-if="tripleAlgoResults.length" class="map-legend-dock">
                <div class="map-legend-title">路径图例</div>
                <div v-for="item in tripleAlgoResults" :key="item.algorithm" class="map-legend-item">
                  <span class="legend-dot" :style="{ background: getAlgorithmColor(item.algorithm) }"></span>
                  <span>{{ item.algorithm }}</span>
                  <span class="legend-dist">{{ item.totalDistance }}m</span>
                </div>
              </div>
            </div>
          </div>

          <aside class="flight-info-panel">
            <div class="flight-info-panel__head">
              <div>
                <div class="flight-info-panel__label">当前无人机</div>
                <div class="flight-info-panel__model">{{ flightTelemetry.model }}</div>
              </div>
              <el-tag
                v-if="currentUav"
                :type="getUavStatusTagType(flightTelemetry.statusCode)"
                size="small"
                effect="plain"
              >
                {{ flightTelemetry.status }}
              </el-tag>
            </div>

            <div v-if="!currentUav" class="flight-info-panel__empty">
              请先选择无人机，规划路径后将在此展示飞行参数
            </div>

            <template v-else>
              <div class="flight-info-panel__meta">
                <span>编号 {{ flightTelemetry.code }}</span>
                <span>{{ flightTelemetry.type }}</span>
              </div>

              <div class="flight-info-metrics">
                <div class="flight-info-metric">
                  <span class="flight-info-metric__label">飞行速度</span>
                  <span class="flight-info-metric__value">{{ flightTelemetry.speed }}<small>m/s</small></span>
                  <span class="flight-info-metric__sub">≈ {{ flightTelemetry.speedKmh }} km/h</span>
                </div>
                <div class="flight-info-metric">
                  <span class="flight-info-metric__label">飞行高度</span>
                  <span class="flight-info-metric__value">{{ flightTelemetry.altitude }}<small>m</small></span>
                  <span class="flight-info-metric__sub">巡航高度</span>
                </div>
                <div class="flight-info-metric">
                  <span class="flight-info-metric__label">剩余电量</span>
                  <span class="flight-info-metric__value">{{ flightTelemetry.remainPercent }}<small>%</small></span>
                  <span class="flight-info-metric__sub">
                    {{ flightTelemetry.hasPath ? '规划后预估' : '满电待命' }}
                  </span>
                </div>
                <div class="flight-info-metric">
                  <span class="flight-info-metric__label">预计耗时</span>
                  <span class="flight-info-metric__value flight-info-metric__value--sm">
                    {{ flightTelemetry.hasPath ? flightTelemetry.estTimeText : '—' }}
                  </span>
                  <span class="flight-info-metric__sub">
                    {{ flightTelemetry.maxFlightTime ? `最大续航 ${flightTelemetry.maxFlightTime} min` : '未设续航' }}
                  </span>
                </div>
              </div>

              <div class="flight-info-battery">
                <div class="flight-info-battery__row">
                  <span>电量消耗预估</span>
                  <span>{{ flightTelemetry.hasPath ? flightTelemetry.powerPercent : 0 }}%</span>
                </div>
                <div class="flight-info-battery__track">
                  <div
                    class="flight-info-battery__bar flight-info-battery__bar--remain"
                    :style="{ width: flightTelemetry.remainPercent + '%' }"
                  />
                </div>
              </div>

              <ul class="flight-info-details">
                <li>
                  <span>航程</span>
                  <strong>{{ flightTelemetry.hasPath ? flightTelemetry.totalDistance + ' m' : '—' }}</strong>
                </li>
                <li>
                  <span>航点数</span>
                  <strong>{{ flightTelemetry.hasPath ? flightTelemetry.pointCount : '—' }}</strong>
                </li>
                <li>
                  <span>电池</span>
                  <strong>{{ flightTelemetry.batteryType }} · {{ flightTelemetry.batteryCapacity }} mAh</strong>
                </li>
                <li>
                  <span>剩余续航</span>
                  <strong>
                    {{
                      flightTelemetry.hasPath && flightTelemetry.remainMinutes != null
                        ? flightTelemetry.remainMinutes + ' min'
                        : flightTelemetry.maxFlightTime
                          ? flightTelemetry.maxFlightTime + ' min'
                          : '—'
                    }}
                  </strong>
                </li>
              </ul>
            </template>
          </aside>
        </div>
      </div>

      <div class="pp-control-dock">
        <div class="path-form">
        <el-form 
          :model="{
            startPoint: startPoint,
            endPoint: endPoint,
            uavId: selectedUav,
            pathType: selectedPathType
          }" 
          inline
          class="inline-form"
        >
          <el-form-item label="起始地点" class="form-item-inline">
            <el-input v-model="startPoint" placeholder="请输入起始地点" clearable />
          </el-form-item>

          <el-form-item label="终点" class="form-item-inline">
            <el-input v-model="endPoint" placeholder="请输入终点" clearable />
          </el-form-item>

          <el-form-item label="无人机" class="form-item-inline">
            <el-select v-model="selectedUav" placeholder="请选择无人机" clearable style="width: 150px;">
              <el-option
                  v-for="uav in uavList"
                  :key="uav.uavId"
                  :label="uav.uavModel"
                  :value="uav.uavId"

              />
            </el-select>
          </el-form-item>
          
          <el-form-item label="路径类型" class="form-item-inline">
            <el-select v-model="selectedPathType" placeholder="请选择路径类型" style="width: 150px;">
              <el-option
                v-for="opt in pathTypeOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-form-item>
          <template v-if="selectedPathType === '水域巡检'">
            <el-form-item label="水域类型" class="form-item-inline">
              <el-select v-model="waterSubType" style="width: 110px;">
                <el-option label="河流" value="河流" />
                <el-option label="湖泊" value="湖泊" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="waterSubType === '河流'" label="顺/逆流" class="form-item-inline">
              <el-select v-model="riverDirection" style="width: 100px;">
                <el-option label="顺流" value="顺流" />
                <el-option label="逆流" value="逆流" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="waterSubType === '河流'" label="河心法向(m)" class="form-item-inline">
              <el-input-number
                v-model="riverCenterOffsetM"
                :min="0"
                :max="300"
                :step="5"
                controls-position="right"
                style="width: 120px;"
              />
            </el-form-item>
            <el-form-item v-if="waterSubType === '河流'" label="偏移侧" class="form-item-inline">
              <el-select v-model="riverBankSide" style="width: 90px;">
                <el-option label="左" value="left" />
                <el-option label="右" value="right" />
              </el-select>
            </el-form-item>
          </template>
          <el-form-item label="巡航高度(m)" class="form-item-inline">
            <el-input-number
              v-model="cruiseAltitudeM"
              :min="15"
              :max="500"
              :step="5"
              controls-position="right"
              style="width: 140px;"
            />
            <span class="cruise-alt-hint">
              栅格原生上限约 {{ rlMaxCruiseAtNativeScaleM }}m（2m/格）；更高时自动扩展 Z 比例（改高度会重训 Q 表）
            </span>
          </el-form-item>
        </el-form>
        
        <el-form-item label="执行方式" class="form-item-inline">
          <el-radio-group v-model="planExecutionMode" size="small">
            <el-radio-button value="triple">三算法对比</el-radio-button>
            <el-radio-button value="single">单一算法</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="planExecutionMode === 'single'" label="算法" class="form-item-inline">
          <el-select v-model="singleAlgorithm" style="width: 130px;">
            <el-option
              v-for="opt in singleAlgorithmOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>

        <div class="action-bar">
          <el-button type="primary" :loading="planningLoading" @click="planPath" class="btn-primary" :icon="RefreshRight">
            {{
              planExecutionMode === 'single'
                ? '执行路径规划'
                : '三算法对比（离线Q表）'
            }}
          </el-button>
          <el-button type="success" plain @click="goAlgorithmCompare">算法对比页</el-button>
          <el-button @click="openTaskSelector" class="btn-secondary" :icon="Document">
            选择任务
          </el-button>
          <el-button @click="selectBestUav" class="btn-success" :icon="MagicStick">
            智能推荐
          </el-button>
          <el-button @click="clearPath" class="btn-danger" :icon="Delete">
            清除路径
          </el-button>
          <el-button @click="navigateToRouteInfo" class="btn-secondary" :icon="TrendCharts">
            查看路线信息
          </el-button>
          <el-button @click="toggleMapMode" class="btn-secondary" :icon="Position">
            {{ is3DMode ? '切换到 2D' : '切换到 3D' }}
          </el-button>
        </div>
      </div>
      </div>
    </div>

    <!-- 算法对比面板 -->
    <div v-if="showComparePanel && compareResults" class="card fade-in" style="margin-top: 20px;">
      <div class="compare-panel">
        <div class="panel-header">
          <div class="panel-title gradient-text">
            <el-icon><TrendCharts /></el-icon>
            算法对比分析
          </div>
        </div>
        
        <!-- 对比表格 -->
        <div class="comparison-table-wrapper">
          <table class="comparison-table">
            <thead>
              <tr>
                <th width="25%">指标</th>
                <th width="37.5%" class="astar-header">
                  <span class="algo-icon">⚡</span>A*算法
                </th>
                <th width="37.5%" class="dijkstra-header">
                  <span class="algo-icon">🔍</span>迪杰斯特拉算法
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in compareResults.tableData" :key="index">
                <td class="label-cell">{{ row.metric }}</td>
                <td :class="['value-cell', row.astar.better ? 'better' : '']">
                  {{ row.astar.value }} {{ row.astar.unit }}
                </td>
                <td :class="['value-cell', row.dijkstra.better ? 'better' : '']">
                  {{ row.dijkstra.value }} {{ row.dijkstra.unit }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- 推荐结果 -->
        <div v-if="compareResults.analysisReport" class="recommendation-box">
          <div class="recommendation-header">
            <div class="recommendation-title">
              <span class="trophy">🏆</span>
              推荐算法：<span class="highlight-badge">{{ compareResults.analysisReport.recommendation.algorithm }}</span>
              <span class="confidence-badge">置信度：{{ compareResults.analysisReport.recommendation.confidence.toFixed(1) }}%</span>
            </div>
          </div>
          <div class="recommendation-content">
            <div class="reason-section">
              <div class="section-label"><el-icon><MagicStick /></el-icon> 推荐理由</div>
              <div class="reason-list">
                <div v-for="(reason, index) in compareResults.analysisReport.recommendation.reasons" :key="index" class="reason-tag">
                  {{ reason }}
                </div>
              </div>
            </div>
            <div class="advantage-section">
              <div class="section-label"><el-icon><TrendCharts /></el-icon> 核心优势</div>
              <div class="advantage-list">
                <div v-for="(adv, index) in compareResults.analysisReport.recommendation.reasons" :key="index" class="advantage-item">
                  <el-icon class="check-icon"><Check /></el-icon>
                  {{ adv }}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 算法优缺点分析 -->
        <div v-if="compareResults.analysisReport" class="analysis-details">
          <div class="analysis-grid">
            <div class="analysis-card astar-card">
              <div class="analysis-header">
                <h4>⚡ A*算法分析</h4>
              </div>
              <div class="analysis-content">
                <div class="sub-section">
                  <div class="sub-title text-success">✓ 优点</div>
                  <ul class="feature-list">
                    <li v-for="(adv, i) in compareResults.analysisReport.astar.advantages" :key="i">{{ adv }}</li>
                  </ul>
                </div>
                <div class="sub-section">
                  <div class="sub-title text-warning">⚠ 缺点</div>
                  <ul class="feature-list">
                    <li v-for="(dis, i) in compareResults.analysisReport.astar.disadvantages" :key="i">{{ dis }}</li>
                  </ul>
                </div>
                <div class="sub-section">
                  <div class="sub-title text-info">💡 适用场景</div>
                  <ul class="feature-list">
                    <li v-for="(scene, i) in compareResults.analysisReport.astar.bestFor" :key="i">{{ scene }}</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div class="analysis-card dijkstra-card">
              <div class="analysis-header">
                <h4>🔍 迪杰斯特拉算法分析</h4>
              </div>
              <div class="analysis-content">
                <div class="sub-section">
                  <div class="sub-title text-success">✓ 优点</div>
                  <ul class="feature-list">
                    <li v-for="(adv, i) in compareResults.analysisReport.dijkstra.advantages" :key="i">{{ adv }}</li>
                  </ul>
                </div>
                <div class="sub-section">
                  <div class="sub-title text-warning">⚠ 缺点</div>
                  <ul class="feature-list">
                    <li v-for="(dis, i) in compareResults.analysisReport.dijkstra.disadvantages" :key="i">{{ dis }}</li>
                  </ul>
                </div>
                <div class="sub-section">
                  <div class="sub-title text-info">💡 适用场景</div>
                  <ul class="feature-list">
                    <li v-for="(scene, i) in compareResults.analysisReport.dijkstra.bestFor" :key="i">{{ scene }}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    
    <!-- 任务选择对话框 -->
    <el-dialog v-model="showTaskDialog" title="选择任务" width="900px">
      <el-table :data="taskList" style="width: 100%" border highlight-current-row>
        <el-table-column prop="taskId" label="任务编号" width="100" align="center"/>
        <el-table-column prop="taskName" label="任务名称" width="150" align="center"/>
        <el-table-column prop="taskType" label="任务类型" width="100" align="center"/>
        <el-table-column prop="startLocation" label="起始地点" width="150" align="center" show-overflow-tooltip/>
        <el-table-column prop="endLocation" label="终点" width="150" align="center" show-overflow-tooltip/>
        <el-table-column prop="maxDistance" label="距离 (km)" width="90" align="center">
          <template #default="scope">
            {{ scope.row.maxDistance?.toFixed(2) || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="estimatedTime" label="时间 (min)" width="90" align="center">
          <template #default="scope">
            {{ scope.row.estimatedTime || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="urgency" label="紧急度" width="80" align="center">
          <template #default="scope">
            <el-tag v-if="scope.row.urgency === 1" type="info">普通</el-tag>
            <el-tag v-else-if="scope.row.urgency === 2" type="warning">紧急</el-tag>
            <el-tag v-else type="danger">非常紧急</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="uavModel" label="推荐无人机" width="120" align="center" show-overflow-tooltip/>
        <el-table-column label="操作" width="120" align="center" fixed="right">
          <template #default="scope">
            <el-button type="primary" size="small" @click="selectTask(scope.row)">选择此任务</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showTaskDialog = false">取消</el-button>
      </template>
    </el-dialog>
  </div>
</template>