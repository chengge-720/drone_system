<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  MapLocation, RefreshRight, Delete, Document, Location,
  Clock, Loading, VideoCamera, TrendCharts, MagicStick,
  Position, Check,
} from '@element-plus/icons-vue'

import { createPathPlanningEnhanced } from '@/utils/pathPlanningEnhanced'
import {
  calculatePathStats,
  flattenPathCoordinates,
  getDistanceFromLatLonInMeters,
  type CompareResults,
  type PathCoord3D
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
import { initDistanceChart } from '@/utils/chartInit'
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
import { planPath as apiPlanRlPath, generateUavEnvironmentPlot, exportExternalPath, logFinalPathPackage } from '@/api/system/pathPlanning'
import { getMissionTrainAnchor, warpOfflineRlPathToUserAnchors } from '@/utils/offlineRlPathWarp'
import { planRoadInspectionRoute, planWaterInspectionRoute } from '@/utils/taskPathPlanner'
import {
  planPathGeneticAlongPolyline,
  subsamplePolylineForSegments,
  slicePolylineBetween
} from '@/utils/networkCorridorPlanner'
import { drawComparePathLine, clearComparePathLine, getAlgorithmColor } from '@/utils/pathStyleManager'
import { fetchBaiduBuildingPoiObstacles } from '@/utils/baiduBuildingObstacles'
import { filterBuildingsInCorridor } from '@/utils/corridorBuildings'
import { loadNoFlyZones, checkNoFlyZoneIntersection, DISABLE_NOFLY_ON_DRIVING_PLAN } from '@/utils/noFlyZoneService'
import { convertPathWgs84ToGcj02, gcj02ToWgs84 } from '@/utils/coordTransform'
import {
  disposeChart
} from '@/utils/comparisonCharts'
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
const flatPathCoords = ref<PathCoord3D[]>([])
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
const chartContainer = ref(null)
let distanceChart = null


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
          window.dispatchEvent(new CustomEvent('uav-reload-rl-plots', { detail: { t: Date.now() } }))
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
    missionId: missionId > 0 ? missionId : undefined,
    taskId: missionId > 0 ? missionId : undefined,
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

const exportPathForOfflineTrain = async (algorithmLabel: string, pts: Array<{ lng: number; lat: number; alt: number }>) => {
  try {
    const missionId = resolveMissionIdForRl()
    const algorithm = algorithmLabel === '遗传算法' ? 'GA' : 'ASTAR'
    const path = (pts || []).map((p) => {
      const wgs = gcj02ToWgs84({ lng: Number(p.lng), lat: Number(p.lat) })
      return [Number(wgs.lat), Number(wgs.lng), Number(p.alt ?? 0)]
    })
    if (!path.length) return
    await exportExternalPath({
      algorithm,
      missionId: Number.isFinite(missionId) && missionId > 0 ? missionId : undefined,
      path
    })
  } catch (e) {
    console.warn('导出外部算法路径失败:', e)
  }
}

const taskList = ref([])
const selectedTask = ref(null)
const showTaskDialog = ref(false)
const missionAnchorStart = ref<{ lat: number; lng: number } | null>(null)
const missionAnchorEnd = ref<{ lat: number; lng: number } | null>(null)

/**
 * Python 训练任务的 mission_id 映射规则。
 * 对应 python_service/offline_train.py 的默认任务定义，不等同于业务 taskId。
 */
const PY_MISSION_RULES: Array<{
  missionId: number
  keywords: string[]
  startAliases: string[]
  endAliases: string[]
}> = [
  { missionId: 1, keywords: ['南昌舰', '八一大桥'], startAliases: ['南昌舰', '主题公园'], endAliases: ['八一', '八一大桥', '大桥'] },
  { missionId: 2, keywords: ['秋水广场', '地铁大厦'], startAliases: ['秋水广场', '秋水'], endAliases: ['地铁大厦', '地铁', '大厦'] },
  { missionId: 3, keywords: ['南昌大学', '第一医院'], startAliases: ['南昌大学', '大学'], endAliases: ['第一医院', '医院', '第一'] },
  { missionId: 4, keywords: ['南昌航空大学', '人民政府'], startAliases: ['南昌航空大学', '航空大学', '南航'], endAliases: ['人民政府', '市政府', '政府'] }
]

const collectPlaceTexts = (task?: any) => {
  const t = task || selectedTask.value
  const startFields = [(t as any)?.startLocation, startPoint.value].map(normalizePlaceText).filter(Boolean)
  const endFields = [(t as any)?.endLocation, endPoint.value].map(normalizePlaceText).filter(Boolean)
  const nameField = normalizePlaceText((t as any)?.taskName)
  const allText = [...startFields, ...endFields, nameField].filter(Boolean).join('|')
  return { startFields, endFields, allText }
}
const PY_MISSION_GEO = [
  { missionId: 1, start: { lat: 28.717861, lng: 115.865875 }, end: { lat: 28.692707, lng: 115.882176 } },
  { missionId: 2, start: { lat: 28.684521, lng: 115.858910 }, end: { lat: 28.681276, lng: 115.861983 } },
  { missionId: 3, start: { lat: 28.664729, lng: 115.918957 }, end: { lat: 28.675901, lng: 115.899369 } },
  { missionId: 4, start: { lat: 28.683899, lng: 115.853558 }, end: { lat: 28.683186, lng: 115.857866 } }
]

const normalizePlaceText = (v: any) =>
  String(v || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[-—–_>＞→]/g, '')
    .replace(/[，,。.;；:：、]/g, '')
    .replace(/南昌市/g, '')
    .toLowerCase()

const resolvePythonMissionIdByText = (task?: any) => {
  const { startFields, endFields, allText } = collectPlaceTexts(task)
  if (!allText) return 0

  // 秋水广场→地铁大厦：与 mission 4 地理锚点极近，文本命中时强制 mission 2
  if (allText.includes('秋水') && (allText.includes('地铁大厦') || allText.includes('地铁'))) {
    return 2
  }

  for (const rule of PY_MISSION_RULES) {
    const kws = rule.keywords.map(normalizePlaceText)
    if (kws.every((kw) => allText.includes(kw))) return rule.missionId
  }

  for (const rule of PY_MISSION_RULES) {
    const startAliases = rule.startAliases.map(normalizePlaceText)
    const endAliases = rule.endAliases.map(normalizePlaceText)
    const startHit = startFields.some((s) => startAliases.some((a) => s.includes(a)))
    const endHit = endFields.some((e) => endAliases.some((a) => e.includes(a)))
    if (startHit && endHit) return rule.missionId
  }
  return 0
}

const resolvePythonMissionIdByGeo = (
  start?: { lat: number; lng: number } | null,
  end?: { lat: number; lng: number } | null
) => {
  if (!start || !end) return 0
  const ranked = PY_MISSION_GEO.map((m) => {
    const dForward =
      getDistanceFromLatLonInMeters(start.lat, start.lng, m.start.lat, m.start.lng) +
      getDistanceFromLatLonInMeters(end.lat, end.lng, m.end.lat, m.end.lng)
    const dReverse =
      getDistanceFromLatLonInMeters(start.lat, start.lng, m.end.lat, m.end.lng) +
      getDistanceFromLatLonInMeters(end.lat, end.lng, m.start.lat, m.start.lng)
    return { id: m.missionId, score: Math.min(dForward, dReverse) }
  }).sort((a, b) => a.score - b.score)

  const best = ranked[0]
  if (!best || best.score > 5000) return 0

  const second = ranked[1]
  const { allText } = collectPlaceTexts()
  // mission 2/4 锚点相距很近，地理相近时优先文本线索
  if (best.id === 4 && second?.id === 2 && second.score - best.score < 1500) {
    if (allText.includes('秋水') || allText.includes('地铁')) return 2
  }
  if (best.id === 2 && second?.id === 4 && second.score - best.score < 1500) {
    if (allText.includes('航空') || allText.includes('南航') || allText.includes('人民政府')) return 4
  }
  return best.id
}

const resolveMissionIdForRl = () => {
  const byText = resolvePythonMissionIdByText()
  if (byText > 0) return byText

  const byGeo = resolvePythonMissionIdByGeo(missionAnchorStart.value, missionAnchorEnd.value)
  if (byGeo > 0) return byGeo

  for (const t of taskList.value || []) {
    const mid = resolvePythonMissionIdByText(t)
    if (mid > 0) return mid
  }
  return 0
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
  note = ''
) => {
  const geo = normalizeGeoPathPoints(rawPath)
  const enriched = enrichPathWithAltitude(geo, { cruiseAlt: cruiseAltitudeM.value })
  const stats = calculatePathStats(enriched)
  return {
    algorithm: algorithmName,
    pathPoints: enriched,
    totalDistance: stats.totalDistance,
    estimatedTime: Math.max(1, Math.round(stats.estimatedTime)),
    pointCount: enriched.length,
    computationTime,
    note
  }
}

const callRlSegment = async (
  segStart: { lat: number; lng: number },
  segEnd: { lat: number; lng: number },
  cruiseAlt: number,
  opts?: {
    qOnly?: boolean
    stochasticInference?: boolean
    inferenceNoiseSigma?: number
    disableAutoFallbackRetry?: boolean
  }
) => {
  const mid = resolveMissionIdForRl()
  const qOnly = typeof opts?.qOnly === 'boolean' ? opts.qOnly : false
  const stochasticInference = typeof opts?.stochasticInference === 'boolean'
    ? opts.stochasticInference
    : false
  const noiseSigma = typeof opts?.inferenceNoiseSigma === 'number'
    ? Number(opts.inferenceNoiseSigma || 0)
    : 0
  const startWgs = gcj02ToWgs84({ lng: segStart.lng, lat: segStart.lat })
  const endWgs = gcj02ToWgs84({ lng: segEnd.lng, lat: segEnd.lat })
  const rlResp = await apiPlanRlPath({
    startPoint: [startWgs.lat, startWgs.lng, cruiseAlt],
    endPoint: [endWgs.lat, endWgs.lng, cruiseAlt],
    qOnly,
    stochasticInference,
    inferenceNoiseSigma: noiseSigma,
    disableAutoFallbackRetry: Boolean(opts?.disableAutoFallbackRetry),
    missionId: mid > 0 ? mid : undefined
  })
  if (rlResp?.code !== 200 || !rlResp?.data?.path) {
    throw new Error(rlResp?.msg || '强化学习路径规划失败')
  }
  const rawWgs = normalizeGeoPathPoints(rlResp.data.path as any[]).map((p) => ({
    lat: p.lat,
    lng: p.lng,
    alt: Number(p.alt ?? cruiseAlt)
  }))
  const raw = convertPathWgs84ToGcj02(rawWgs as any).map((p) => ({
    lat: p.lat,
    lng: p.lng,
    alt: Number(p.alt ?? cruiseAlt)
  }))
  return { raw, rawWgs, rlMeta: rlResp.data }
}

const runRlAlongCorridor = async (
  base2d: Array<{ lng: number; lat: number }>,
  start: { lng: number; lat: number },
  end: { lng: number; lat: number },
  cruiseAlt: number,
  corridorLabel: string
) => {
  const t0 = performance.now()
  if (!base2d || base2d.length < 2) {
    throw new Error('路网走廊为空')
  }
  const verts = subsamplePolylineForSegments(base2d, 8)
  verts[0] = { lng: start.lng, lat: start.lat }
  verts[verts.length - 1] = { lng: end.lng, lat: end.lat }

  const merged: Array<{ lat: number; lng: number; alt: number }> = []
  let rlMeta: any = null
  let segFail = 0

  for (let i = 0; i < verts.length - 1; i++) {
    const s = verts[i]
    const e = verts[i + 1]
    try {
      const { raw, rlMeta: meta } = await callRlSegment(
        { lat: s.lat, lng: s.lng },
        { lat: e.lat, lng: e.lng },
        cruiseAlt
      )
      rlMeta = meta
      if (Array.isArray(meta?.obstacles) && meta.obstacles.length) {
        planObstacles.value = [...meta.obstacles]
      }
      const chunk = i > 0 && raw.length ? raw.slice(1) : raw
      merged.push(...chunk)
    } catch {
      segFail++
      const fallback = slicePolylineBetween(base2d, s, e).map((p) => ({
        lat: p.lat,
        lng: p.lng,
        alt: cruiseAlt
      }))
      const chunk = i > 0 && fallback.length ? fallback.slice(1) : fallback
      merged.push(...chunk)
    }
  }

  if (merged.length < 2) {
    merged.length = 0
    merged.push(
      { lat: start.lat, lng: start.lng, alt: cruiseAlt },
      ...base2d.map((p) => ({ lat: p.lat, lng: p.lng, alt: cruiseAlt })),
      { lat: end.lat, lng: end.lng, alt: cruiseAlt }
    )
  }

  const note =
    segFail > 0
      ? `沿${corridorLabel}分段 RL（${segFail} 段降级为走廊折线）`
      : `沿${corridorLabel}分段 RL`
  return {
    result: buildAlgoResult(merged, '强化学习', Math.round(performance.now() - t0), note),
    rlMeta
  }
}

const runRlPlanning = async (start: any, end: any, mode: 'offline' | 'online' = 'online') => {
  const cruiseAlt = Number(cruiseAltitudeM.value || 0) || 0
  const startSimple = { lng: start.lng, lat: start.lat }
  const endSimple = { lng: end.lng, lat: end.lat }

  if (mode === 'offline') {
    // 离线Q表：Python 在训练锚点栅格推理；前端将轨迹配准到地图起终点以便与 A*/GA 叠合。
    const t0 = performance.now()
    const mid = resolveMissionIdForRl()
    const trainAnchor = mid > 0 ? getMissionTrainAnchor(mid) : null
    const { raw, rawWgs, rlMeta } = await callRlSegment(start, end, cruiseAlt, {
      qOnly: true,
      stochasticInference: false,
      inferenceNoiseSigma: 0,
      disableAutoFallbackRetry: true
    })
    planObstacles.value = Array.isArray(rlMeta?.obstacles) ? [...rlMeta.obstacles] : []

    let displayPath = raw
    let note = rlMeta?.rlSuccess === false
      ? '离线Q表直推未到达终点（未启用在线回退）'
      : '离线Q表直推（训练栅格）'

    if (trainAnchor && rawWgs.length >= 2) {
      const startWgs = gcj02ToWgs84({ lng: start.lng, lat: start.lat })
      const endWgs = gcj02ToWgs84({ lng: end.lng, lat: end.lat })
      const warpedWgs = warpOfflineRlPathToUserAnchors(
        rawWgs,
        trainAnchor.start,
        trainAnchor.goal,
        { lat: startWgs.lat, lng: startWgs.lng, alt: cruiseAlt },
        { lat: endWgs.lat, lng: endWgs.lng, alt: cruiseAlt }
      )
      displayPath = convertPathWgs84ToGcj02(warpedWgs as any).map((p) => ({
        lat: p.lat,
        lng: p.lng,
        alt: Number(p.alt ?? cruiseAlt)
      }))
      note = rlMeta?.rlSuccess === false
        ? `${note}；已尝试对齐地图起终点`
        : '离线Q表直推（WGS84→GCJ02 后已对齐高德地图起终点）'
    }

    return {
      result: buildAlgoResult(displayPath, '强化学习', Math.round(performance.now() - t0), note),
      rlMeta: { ...rlMeta, mapWarpApplied: Boolean(trainAnchor) }
    }
  }

  let directError = ''
  try {
    // 在线模式先执行同起终点直连 RL，失败后再按道路/水域走廊分段回退。
    const t0 = performance.now()
    const { raw, rlMeta } = await callRlSegment(start, end, cruiseAlt)
    planObstacles.value = Array.isArray(rlMeta?.obstacles) ? [...rlMeta.obstacles] : []
    const directResult = buildAlgoResult(
      raw,
      '强化学习',
      Math.round(performance.now() - t0),
      rlMeta?.rlSuccess === false ? '直连 RL 未到达终点（已展示推理轨迹）' : '直连 RL 推理'
    )
    if (rlMeta?.rlSuccess !== false) {
      return { result: directResult, rlMeta }
    }
    if (selectedPathType.value !== WATER_PATH_TYPE && !ROAD_PATH_TYPES.has(selectedPathType.value)) {
      return { result: directResult, rlMeta }
    }
    directError = '直连 RL 未到达终点'
  } catch (e: any) {
    directError = e?.message || String(e)
  }

  if (selectedPathType.value === WATER_PATH_TYPE) {
    const water = await resolveWaterBaseRoute(startSimple, endSimple)
    const base2d = (water.pathPoints || []).map((p) => ({ lng: p.lng, lat: p.lat }))
    const corridor = await runRlAlongCorridor(base2d, startSimple, endSimple, cruiseAlt, water.algorithm || '水域路网')
    if (directError) {
      corridor.result.note = `${corridor.result.note}（直连失败：${directError}）`
    }
    return corridor
  }

  if (ROAD_PATH_TYPES.has(selectedPathType.value)) {
    try {
      const road = await planRoadInspectionRoute(
        { map: map.value, targetAltitudeM: cruiseAltitudeM.value },
        startSimple,
        endSimple,
        cruiseAlt
      )
      const base2d = (road.pathPoints || []).map((p) => ({ lng: p.lng, lat: p.lat }))
      const corridor = await runRlAlongCorridor(base2d, startSimple, endSimple, cruiseAlt, road.algorithm || '驾车路网')
      if (directError) {
        corridor.result.note = `${corridor.result.note}（直连失败：${directError}）`
      }
      return corridor
    } catch (e: any) {
      if (directError) {
        throw new Error(`${directError}；道路走廊分段失败：${e?.message || e}`)
      }
      console.warn('道路走廊 RL 失败，回退直连 RL 结果', e)
    }
  }

  throw new Error(directError || '强化学习路径规划失败')
}

const runAstarPlanning = async (start: any, end: any, polygons: any[]) => {
  const t0 = performance.now()
  const startSimple = { lng: start.lng, lat: start.lat }
  const endSimple = { lng: end.lng, lat: end.lat }
  const useAvoid = !DISABLE_NOFLY_ON_DRIVING_PLAN && polygons.length > 0
  let raw2d: Array<{ lng: number; lat: number }>
  let note = ''

  if (selectedPathType.value === WATER_PATH_TYPE) {
    try {
      const water = await resolveWaterBaseRoute(startSimple, endSimple)
      raw2d = (water.pathPoints || []).map((p) => ({ lng: p.lng, lat: p.lat }))
      note = water.algorithm || '水域步行/覆盖路网'
    } catch (e: any) {
      raw2d = useAvoid
        ? planPathAStarGridAvoidPolygons(startSimple, endSimple, polygons)
        : planPathAStarGrid(startSimple, endSimple)
      note = `水域路网规划失败，已降级网格 A*：${e?.message || e}`
    }
  } else if (ROAD_PATH_TYPES.has(selectedPathType.value)) {
    try {
      const road = await planRoadInspectionRoute(
        { map: map.value, targetAltitudeM: cruiseAltitudeM.value },
        startSimple,
        endSimple,
        Number(cruiseAltitudeM.value || 0) || 0
      )
      raw2d = (road.pathPoints || []).map((p) => ({ lng: p.lng, lat: p.lat }))
      note = road.algorithm || '沿真实道路'
    } catch (e: any) {
      raw2d = useAvoid
        ? planPathAStarGridAvoidPolygons(startSimple, endSimple, polygons)
        : planPathAStarGrid(startSimple, endSimple)
      note = `道路规划失败，已降级网格 A*：${e?.message || e}`
    }
  } else {
    raw2d = useAvoid
      ? planPathAStarGridAvoidPolygons(startSimple, endSimple, polygons)
      : planPathAStarGrid(startSimple, endSimple)
    note = '网格 A*（高空避障）'
  }

  const astarResult = buildAlgoResult(raw2d, 'A*算法', Math.round(performance.now() - t0), note)
  return astarResult
}

const runGaPlanning = async (start: any, end: any, polygons: any[]) => {
  const t0 = performance.now()
  const startSimple = { lng: start.lng, lat: start.lat }
  const endSimple = { lng: end.lng, lat: end.lat }
  const useAvoid = !DISABLE_NOFLY_ON_DRIVING_PLAN && polygons.length > 0
  const finishGa = (raw2d: Array<{ lng: number; lat: number }>, note: string) => {
    const gaResult = buildAlgoResult(raw2d, '遗传算法', Math.round(performance.now() - t0), note)
    return gaResult
  }

  if (selectedPathType.value === WATER_PATH_TYPE) {
    try {
      const water = await resolveWaterBaseRoute(startSimple, endSimple)
      const base2d = (water.pathPoints || []).map((p) => ({ lng: p.lng, lat: p.lat }))
      if (base2d.length < 2) {
        throw new Error('水域基准路径过短')
      }
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
      const road = await planRoadInspectionRoute(
        { map: map.value, targetAltitudeM: cruiseAltitudeM.value },
        startSimple,
        endSimple,
        Number(cruiseAltitudeM.value || 0) || 0
      )
      const base2d = (road.pathPoints || []).map((p) => ({ lng: p.lng, lat: p.lat }))
      if (base2d.length >= 2) {
        const raw2d = planPathGeneticAlongPolyline(base2d, {
          maxLateralM: 16,
          controlCount: Math.min(12, Math.max(6, Math.round(base2d.length / 12))),
          riverBankSide: 'left'
        })
        return finishGa(raw2d, '沿真实道路遗传优化')
      }
    } catch (e: any) {
      const raw2d = useAvoid
        ? planPathGeneticGridAvoidPolygons(startSimple, endSimple, polygons)
        : planPathGeneticGrid(startSimple, endSimple)
      return finishGa(raw2d, `道路路网 GA 失败，已降级网格：${e?.message || e}`)
    }
  }

  const raw2d = useAvoid
    ? planPathGeneticGridAvoidPolygons(startSimple, endSimple, polygons)
    : planPathGeneticGrid(startSimple, endSimple)
  return finishGa(raw2d, '遗传算法网格搜索')
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
    window.dispatchEvent(new CustomEvent('uav-reload-rl-plots', { detail: { t: Date.now() } }))
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
    const zones = await loadNoFlyZones()
    const polygons = (zones || [])
      .filter((z: any) => Array.isArray(z?.path) && z.path.length >= 3)
      .map((z: any) => z.path)

    let one: (typeof tripleAlgoResults.value)[0] | null = null
    let rlMeta: any = null
    const algo = singleAlgorithm.value

    if (algo === '强化学习') {
      const pack = await runRlPlanning(start, end, 'online')
      one = pack.result
      rlMeta = pack.rlMeta
      if (rlMeta?.rlSuccess === false) {
        ElMessage.warning('强化学习未到达终点，仍展示推理轨迹')
      }
    } else if (algo === 'A*算法') {
      one = await runAstarPlanning(start, end, polygons)
      void exportPathForOfflineTrain('A*算法', one.pathPoints || [])
    } else {
      one = await runGaPlanning(start, end, polygons)
      void exportPathForOfflineTrain('遗传算法', one.pathPoints || [])
    }

    await applyPlanningResults([one], rlMeta)
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
    if (pyMission <= 0) {
      throw new Error('未能自动匹配 Python 离线 mission 编号，请选择已训练任务或填写匹配的起终点名称')
    }
    ElMessage.info(
      `离线Q表在训练栅格推理（mission=${pyMission}），返回后将从 WGS84 转为高德 GCJ-02 并对齐地图起终点。`
    )
    latestGoalPoint.value = { lng: end.lng, lat: end.lat }
    isRlFailureDisplayMode.value = false
    planObstacles.value = []
    tripleAlgoResults.value = []
    clearComparePolylines()

    const zones = await loadNoFlyZones()
    const polygons = (zones || [])
      .filter((z: any) => Array.isArray(z?.path) && z.path.length >= 3)
      .map((z: any) => z.path)

    const [rlPack, astarResult, gaResult] = await Promise.all([
      runRlPlanning(start, end, 'offline').catch((e: any) => ({ error: e?.message || String(e) })),
      Promise.resolve().then(() => runAstarPlanning(start, end, polygons)).catch((e: any) => ({ error: e?.message || String(e) })),
      Promise.resolve().then(() => runGaPlanning(start, end, polygons)).catch((e: any) => ({ error: e?.message || String(e) }))
    ])

    const results: typeof tripleAlgoResults.value = []
    let rlMeta: any = null

    if (rlPack && !(rlPack as any).error && (rlPack as any).result) {
      results.push((rlPack as any).result)
      rlMeta = (rlPack as any).rlMeta
      if (rlMeta?.rlSuccess === false) {
        isRlFailureDisplayMode.value = true
        ElMessage.warning(
          '离线Q表直推未到达终点，已保留轨迹用于对比。'
        )
      }
    } else {
      const rlErr = (rlPack as any)?.error || '未知错误'
      ElMessage.warning(`离线Q表 RL 失败（未启用在线回退）：${rlErr}`)
      ElMessage.error(`强化学习失败：${rlErr}`)
    }

    if (astarResult && !(astarResult as any).error) {
      results.push(astarResult as any)
      void exportPathForOfflineTrain('A*算法', (astarResult as any).pathPoints || [])
    } else {
      ElMessage.warning(`A* 失败：${(astarResult as any)?.error || '未知错误'}`)
    }

    if (gaResult && !(gaResult as any).error) {
      results.push(gaResult as any)
      void exportPathForOfflineTrain('遗传算法', (gaResult as any).pathPoints || [])
    } else {
      ElMessage.warning(`遗传算法失败：${(gaResult as any)?.error || '未知错误'}`)
    }

    if (!results.length) {
      throw new Error('三种算法均未生成有效路径')
    }

    await applyPlanningResults(results, rlMeta)
    runUavEnvPlot(start, end)
    const pyMissionId = resolveMissionIdForRl()
    ElMessage.success(
      `三算法对比完成（${selectedPathType.value}，RL=离线Q表，mission=${pyMissionId || '-'}）：已绘制 RL / A* / GA 路径`
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
    flatPathCoords.value = result.flatPathCoords
    pathStats.value = result.pathStats
    showPathInfo.value = true
    setTimeout(() => initPathChart(), 100)
  }
}

const initPathChart = () => {
  if (!chartContainer.value || flatPathCoords.value.length === 0) return
  distanceChart = initDistanceChart(chartContainer.value, flatPathCoords.value, distanceChart)
}

const initEnhancedFeatures = async () => {
  if (enhancedManager.value) {
    enhancedManager.value.destroy()
    enhancedManager.value = null
  }
  enhancedManager.value = createPathPlanningEnhanced({
    enableDraggableMarkers: ENABLE_DRAGGABLE_PATH_MARKERS,
    autoLoadWeather: true,
    autoLoadNoFlyZones: true,
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
  flatPathCoords.value = []
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
  if (distanceChart) {
    disposeChart(distanceChart)
    distanceChart = null
  }
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

const onMapContainerResize = () => {}

onMounted(async () => {
  restorePlanningForm()
  window.addEventListener('resize', onMapContainerResize)
  setTimeout(() => {
    initMap()
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
    <h1 class="art-text">路径规划</h1>
    
    <!-- 路径规划表单 -->
    <div class="card fade-in">
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
    <!-- 地图展示：3D 模式下左侧地图 + 右侧独立三维仿真，避免 WebGL 与底图同一区域重叠 -->
    <div class="card fade-in" style="margin-top: 20px;">
      <div class="map-container">
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
    </div>
    
    <!-- 路径信息可视化面板 -->
    <div v-if="showPathInfo" class="card fade-in" style="margin-top: 20px;">
      <div class="path-info-panel">
        <div class="panel-header">
          <div class="panel-title">
            <el-icon><TrendCharts /></el-icon>
            路径参数可视化
          </div>
        </div>
        
        <!-- 统计卡片 -->
        <div class="stats-grid">
          <div class="stat-card stat-gradient-1">
            <div class="stat-icon"><el-icon><Location /></el-icon></div>
            <div class="stat-content">
              <div class="stat-label">总距离</div>
              <div class="stat-value">{{ pathStats.totalDistance }}<span class="stat-unit">米</span></div>
            </div>
          </div>
          <div class="stat-card stat-gradient-2">
            <div class="stat-icon"><el-icon><Clock /></el-icon></div>
            <div class="stat-content">
              <div class="stat-label">预计时间</div>
              <div class="stat-value">{{ pathStats.estimatedTime }}<span class="stat-unit">秒</span></div>
            </div>
          </div>
          <div class="stat-card stat-gradient-3">
            <div class="stat-icon"><el-icon><Loading /></el-icon></div>
            <div class="stat-content">
              <div class="stat-label">路径点数</div>
              <div class="stat-value">{{ pathStats.pointCount }}<span class="stat-unit">个</span></div>
            </div>
          </div>
          <div class="stat-card stat-gradient-4">
            <div class="stat-icon"><el-icon><VideoCamera /></el-icon></div>
            <div class="stat-content">
              <div class="stat-label">平均速度</div>
              <div class="stat-value">{{ pathStats.avgSpeed }}<span class="stat-unit">m/s</span></div>
            </div>
          </div>
        </div>
        
        <!-- 坐标信息 -->
        <div class="coord-cards">
          <div class="coord-card coord-start">
            <div class="coord-label">
              <el-icon><Location /></el-icon>
              起点坐标
            </div>
            <div class="coord-value">{{ pathStats.startCoord || '暂无' }}</div>
          </div>
          <div class="coord-card coord-end">
            <div class="coord-label">
              <el-icon><MapLocation /></el-icon>
              终点坐标
            </div>
            <div class="coord-value">{{ pathStats.endCoord || '暂无' }}</div>
          </div>
        </div>
        
        <!-- 图表容器 -->
        <div ref="chartContainer" class="chart-container"></div>
      </div>
    </div>
    
    <!-- 三算法对比（RL / A* / GA） -->
    <div v-if="tripleAlgoResults.length" class="card fade-in" style="margin-top: 20px;">
      <div class="compare-panel">
        <div class="panel-header">
          <div class="panel-title gradient-text">
            <el-icon><TrendCharts /></el-icon>
            三算法路径对比（{{ selectedPathType }}）
          </div>
        </div>
        <div class="comparison-table-wrapper">
          <table class="comparison-table">
            <thead>
              <tr>
                <th width="18%">算法</th>
                <th width="18%">总距离</th>
                <th width="14%">预计时间</th>
                <th width="12%">路径点数</th>
                <th width="12%">耗时(ms)</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tripleAlgoResults" :key="row.algorithm">
                <td class="label-cell">
                  <span class="legend-dot-inline" :style="{ background: getAlgorithmColor(row.algorithm) }"></span>
                  {{ row.algorithm }}
                </td>
                <td class="value-cell">{{ row.totalDistance }} m</td>
                <td class="value-cell">{{ row.estimatedTime }} s</td>
                <td class="value-cell">{{ row.pointCount }}</td>
                <td class="value-cell">{{ row.computationTime ?? '-' }}</td>
                <td class="value-cell">{{ row.note || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="path-compare-hint" style="margin-top: 10px;">
          道路巡检：A* 走高德驾车路网。水域巡检：三算法均沿步行/河道走廊（河流）或湖泊覆盖线；RL 按走廊分段推理，GA 在走廊内遗传优化。其他类型为网格 A*/GA + RL。三色路径已叠加在高德地图上。
        </p>
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