<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { selectTaskByTaskId, selectTaskList, updateTask } from '@/api/system/task.js'
import { selectUavList } from '@/api/system/uav.js'

import { planTaskRoute } from '@/utils/taskPathPlanner'

import {
  create2DMap,
  getGeoPoint,
  createGeoMarker,
  adjustMapViewport,
  clearMapOverlays
} from '@/utils/mapInitializer'
import { flattenPathCoordinates, calculatePathStats } from '@/utils/pathCalculator'
import { enrichPathWithAltitude } from '@/utils/pathAltitude'
import {
  clearPathWaypointMarkers,
  clearStaticTaskPath,
  drawPathWaypointMarkers,
  drawStaticTaskPath
} from '@/utils/taskPlanningMapVisual'
import {
  FLIGHT_SIM_SESSION_KEY,
  resolvePythonMissionId
} from '@/utils/missionRlResolver'
import { convertPathGcj02ToWgs84, gcj02ToWgs84 } from '@/utils/coordTransform'
import {
  clearExecutionRecord,
  clearPlanningSession,
  getExecutionRemainSeconds,
  loadExecutionRecord,
  loadPlanningSession,
  saveExecutionRecord,
  savePlanningSession
} from '@/utils/taskExecutionStorage'
import '@/assets/styles/task-planning.css'

const route = useRoute()
const router = useRouter()

const taskIdFromRoute = computed(() => {
  const raw = route.query.taskId
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
})

// ===== Task data =====
const task = ref<any>(null)
const taskOptions = ref<any[]>([])
const selectedTaskId = ref<number | null>(null)
const switchingTask = ref(false)
const taskStartLocation = ref('')
const taskEndLocation = ref('')
const taskName = computed(() => task.value?.taskName || '')
const taskType = computed(() => task.value?.taskType || '')

// 水域近似参数（第一版无真实流向/边界数据）
const waterSubType = ref<'河流' | '湖泊'>('河流')
const riverDirection = ref<'顺流' | '逆流'>('顺流')
/** 步行路网法向偏移（米），近似从岸向河心 */
const riverCenterOffsetM = ref(50)
/** 相对路径飞行方向：左/右为「向河」一侧（无河矢量时需目视地图切换） */
const riverBankSide = ref<'left' | 'right'>('left')

// 默认高度（按策略调整也可以由用户手动覆盖）
const targetAltitudeM = ref(180)

// ===== UAV =====
const uavList = ref<any[]>([])
const selectedUavId = ref<number | null>(null)
const selectedUavModel = computed(() => {
  const byList = uavList.value.find((u) => u.uavId === selectedUavId.value)
  return byList?.uavModel || task.value?.uavModel || ''
})

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
  uavList.value.find((u) => u.uavId === selectedUavId.value) || null
)

const flightTelemetry = computed(() => {
  const uav = currentUav.value as any
  const stats = pathStats.value
  const speed = Number(executionSpeedMps.value || stats.avgSpeed || 10) || 10
  const altitude = Number(targetAltitudeM.value || 0) || 0
  const estSeconds = showResult.value
    ? Math.max(1, Math.ceil(Number(stats.totalDistance || 0) / speed))
    : Number(stats.estimatedTime || 0) || 0
  const maxMinutes = Number(uav?.uavMaxFlightTime || 0) || 0
  const maxSeconds = maxMinutes * 60
  const powerPercent =
    maxSeconds > 0 && estSeconds > 0
      ? Math.min(100, Math.round((estSeconds / maxSeconds) * 100))
      : 0
  const remainPercent =
    maxSeconds > 0 && estSeconds > 0 ? Math.max(0, 100 - powerPercent) : 100

  return {
    model: selectedUavModel.value || uav?.uavModel || uav?.uavCode || '未选择无人机',
    code: uav?.uavCode || '—',
    type: uav?.uavType || taskType.value || '—',
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
    remainMinutes:
      maxMinutes > 0 && estSeconds > 0
        ? Math.max(0, Math.round(maxMinutes - estSeconds / 60))
        : maxMinutes || null,
    batteryType: uav?.uavBatteryType || '—',
    batteryCapacity: uav?.uavBatteryCapacity ?? '—',
    maxFlightTime: maxMinutes || null,
    hasPath: Boolean(showResult.value && stats.totalDistance > 0),
    algorithm: lastAlgorithm.value || strategyLabel.value,
    startText: taskStartLocation.value || '—',
    endText: taskEndLocation.value || '—',
    executing: executing.value,
    countdown: executionCountdownText.value
  }
})

const getUavStatusTagType = (code?: number) => {
  const types: Record<number, string> = { 1: 'success', 2: 'warning', 3: 'danger', 4: 'info' }
  return types[code || 0] || 'info'
}

const onMapContainerResize = () => {
  try {
    map.value?.resize?.()
  } catch {}
}

// ===== Map & flight state =====
const map = ref<any>(null)
const mapContainer = ref<any>(null)

// 2D 路径线
const pathPolyline = ref<any>(null)
const pathWaypointMarkers = ref<any[]>([])

// 结果
const pathPoints = ref<any[]>([])
const pathStats = ref({
  totalDistance: 0,
  estimatedTime: 0,
  pointCount: 0,
  avgSpeed: 10,
  startCoord: '',
  endCoord: ''
})
const showResult = ref(false)
const lastGeoStart = ref<{ lat: number; lng: number } | null>(null)
const lastGeoEnd = ref<{ lat: number; lng: number } | null>(null)
const lastAlgorithm = ref('')
const executionSpeedMps = ref(10)
const executing = ref(false)
const executionCountdown = ref(0)
let executionTimer: number | null = null

const executionCountdownText = computed(() => {
  const s = Math.max(0, Math.ceil(executionCountdown.value))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
})

const strategyLabel = computed(() => {
  if (taskType.value === '航拍') return '航拍：高空直线'
  if (taskType.value === '水域巡检') {
    const riverExtra =
      waterSubType.value === '河流'
        ? `(${riverDirection.value}，法向${riverCenterOffsetM.value}m/${riverBankSide.value === 'left' ? '左' : '右'}侧)`
        : ''
    return `水域巡检：${waterSubType.value}${riverExtra}`
  }
  if (taskType.value === '巡检' || taskType.value === '道路巡检') return '沿道路/道路巡检'
  return '其他任务：高空避障规划'
})

const setAltitudeByTaskType = () => {
  // 第一版给出合理默认值，同时允许用户手动修改
  if (taskType.value === '航拍') targetAltitudeM.value = 220
  else if (taskType.value === '水域巡检') targetAltitudeM.value = 140
  else if (taskType.value === '巡检' || taskType.value === '道路巡检') targetAltitudeM.value = 120
  else targetAltitudeM.value = 180
}

const runPathVisuals = () => {
  if (!map.value || !pathPoints.value.length) return

  clearPathWaypointMarkers(pathWaypointMarkers)
  clearStaticTaskPath(pathPolyline)

  const flat = flattenPathCoordinates(pathPoints.value)
  pathStats.value = calculatePathStats(flat)
  drawStaticTaskPath(map.value, flat, pathPolyline)
  drawPathWaypointMarkers(map.value, flat, pathWaypointMarkers, {
    speedMps: executionSpeedMps.value,
    altitudeM: targetAltitudeM.value
  })
}

/** 仅清理地图覆盖物，保留路径/执行等业务状态 */
const clearMapVisualsOnly = () => {
  clearStaticTaskPath(pathPolyline)
  clearPathWaypointMarkers(pathWaypointMarkers)

  try {
    if (map.value) clearMapOverlays(map.value)
  } catch {}
}

const initMap = async (options?: { resetPath?: boolean }) => {
  if (!mapContainer.value) return

  if (options?.resetPath) {
    clearPathInternal()
  } else {
    clearMapVisualsOnly()
  }

  map.value = create2DMap(mapContainer.value, { lightSatellite: true })
}

const clearPathInternal = () => {
  clearMapVisualsOnly()
  pathPoints.value = []
  showResult.value = false
  lastGeoStart.value = null
  lastGeoEnd.value = null
  lastAlgorithm.value = ''
  if (task.value?.taskId) {
    clearPlanningSession(task.value.taskId)
  }
}

const clearPath = () => {
  if (executing.value && task.value?.taskId) {
    ElMessage.warning('任务执行中，请先等待完成或在任务列表终止任务')
    return
  }
  clearPathInternal()
}

const persistPlanningSession = () => {
  const taskId = task.value?.taskId
  if (!taskId || !pathPoints.value.length) return
  savePlanningSession({
    taskId,
    pathPoints: pathPoints.value,
    pathStats: { ...pathStats.value },
    lastGeoStart: lastGeoStart.value,
    lastGeoEnd: lastGeoEnd.value,
    lastAlgorithm: lastAlgorithm.value,
    showResult: showResult.value,
    targetAltitudeM: targetAltitudeM.value,
    executionSpeedMps: executionSpeedMps.value,
    waterSubType: waterSubType.value,
    riverDirection: riverDirection.value,
    riverCenterOffsetM: riverCenterOffsetM.value,
    riverBankSide: riverBankSide.value,
    savedAt: Date.now()
  })
}

const redrawPlannedPath = async () => {
  if (!map.value || !pathPoints.value.length) return

  if (lastGeoStart.value && lastGeoEnd.value) {
    try {
      createGeoMarker(map.value, lastGeoStart.value, false)
      createGeoMarker(map.value, lastGeoEnd.value, false)
    } catch {}
  }

  maybeAutoFit(lastGeoStart.value, lastGeoEnd.value, pathPoints.value)
  await runPathVisuals()
}

const resumeExecutionFromStorage = () => {
  const taskId = task.value?.taskId
  if (!taskId) return

  const remain = getExecutionRemainSeconds(taskId)
  const rec = loadExecutionRecord(taskId)
  if (!rec || remain <= 0) {
    executing.value = false
    executionCountdown.value = 0
    if (rec && remain <= 0 && task.value?.status === 2) {
      void finishTaskExecution()
    }
    return
  }

  if (rec.speed) executionSpeedMps.value = rec.speed
  executing.value = true
  executionCountdown.value = remain

  if (executionTimer) window.clearInterval(executionTimer)
  executionTimer = window.setInterval(async () => {
    const left = getExecutionRemainSeconds(taskId)
    executionCountdown.value = left
    if (left <= 0) {
      if (executionTimer) window.clearInterval(executionTimer)
      executionTimer = null
      await finishTaskExecution()
    }
  }, 1000)
}

const terminateTaskExecution = async () => {
  if (!task.value?.taskId) return
  try {
    if (executionTimer) {
      window.clearInterval(executionTimer)
      executionTimer = null
    }
    clearExecutionRecord(task.value.taskId)
    executing.value = false
    executionCountdown.value = 0
    await updateCurrentTaskStatus(1)
    persistPlanningSession()
    ElMessage.success('任务已终止，状态已恢复为待执行')
  } catch (e: any) {
    ElMessage.error(e?.message || String(e))
  }
}

const finishTaskExecution = async () => {
  executing.value = false
  executionCountdown.value = 0
  const taskId = task.value?.taskId
  if (!taskId) return
  clearExecutionRecord(taskId)
  try {
    if (task.value?.status === 2) {
      await updateCurrentTaskStatus(3)
      ElMessage.success('任务已完成')
    }
    persistPlanningSession()
  } catch (e: any) {
    ElMessage.error(e?.message || String(e))
  }
}

const restorePlanningSession = async () => {
  const taskId = task.value?.taskId
  if (!taskId) return

  const session = loadPlanningSession(taskId)
  if (!session?.pathPoints?.length) {
    resumeExecutionFromStorage()
    return
  }

  pathPoints.value = session.pathPoints
  pathStats.value = { ...pathStats.value, ...session.pathStats }
  lastGeoStart.value = session.lastGeoStart
  lastGeoEnd.value = session.lastGeoEnd
  lastAlgorithm.value = session.lastAlgorithm || ''
  showResult.value = Boolean(session.showResult)
  if (session.targetAltitudeM) targetAltitudeM.value = session.targetAltitudeM
  if (session.executionSpeedMps) executionSpeedMps.value = session.executionSpeedMps
  if (session.waterSubType) waterSubType.value = session.waterSubType
  if (session.riverDirection) riverDirection.value = session.riverDirection
  if (typeof session.riverCenterOffsetM === 'number') riverCenterOffsetM.value = session.riverCenterOffsetM
  if (session.riverBankSide) riverBankSide.value = session.riverBankSide

  if (showResult.value && map.value) {
    await redrawPlannedPath()
  }
  resumeExecutionFromStorage()
}

const updateCurrentTaskStatus = async (status: number) => {
  if (!task.value?.taskId) throw new Error('任务信息不完整')
  const payload = { ...task.value, status }
  const resp = await updateTask(payload)
  if (resp?.code !== 200) {
    throw new Error(resp?.msg || '任务状态更新失败')
  }
  task.value = { ...task.value, status }
}

const startTaskExecution = async () => {
  if (!showResult.value || !pathPoints.value.length) {
    ElMessage.warning('请先完成路径规划')
    return
  }
  if (executing.value) {
    ElMessage.warning('任务正在执行中')
    return
  }

  const distanceM = Number(pathStats.value.totalDistance || calculatePathStats(flattenPathCoordinates(pathPoints.value)).totalDistance || 0)
  const speed = Math.max(1, Number(executionSpeedMps.value || 10))
  const durationSec = Math.max(1, Math.ceil(distanceM / speed))

  try {
    await updateCurrentTaskStatus(2)
    executing.value = true
    executionCountdown.value = durationSec
    const endAt = Date.now() + durationSec * 1000
    saveExecutionRecord({
      taskId: task.value.taskId,
      endAt,
      speed,
      distanceM
    })
    persistPlanningSession()
    ElMessage.success('该任务已开始执行')

    if (executionTimer) window.clearInterval(executionTimer)
    executionTimer = window.setInterval(async () => {
      executionCountdown.value = getExecutionRemainSeconds(task.value.taskId)
      if (executionCountdown.value <= 0) {
        if (executionTimer) window.clearInterval(executionTimer)
        executionTimer = null
        await finishTaskExecution()
      }
    }, 1000)
  } catch (e: any) {
    executing.value = false
    ElMessage.error(e?.message || String(e))
  }
}

const loadTaskOptions = async () => {
  const resp = await selectTaskList({ pageNum: 1, pageSize: 200 })
  taskOptions.value = (resp?.rows || []).filter((t: any) => t.status !== 4)
}

const switchTask = async (taskId: number | null) => {
  if (!taskId || switchingTask.value) return
  if (executing.value) {
    ElMessage.warning('任务执行中，无法切换任务')
    selectedTaskId.value = task.value?.taskId ?? null
    return
  }
  switchingTask.value = true
  try {
    if (task.value?.taskId && task.value.taskId !== taskId) {
      clearPathInternal()
    }
    await loadTask(taskId)
    selectedTaskId.value = taskId
    router.replace({ path: route.path, query: { taskId: String(taskId) } })
    await restorePlanningSession()
  } catch (e: any) {
    ElMessage.error(e?.message || '切换任务失败')
  } finally {
    switchingTask.value = false
  }
}

const loadTask = async (id: number) => {
  const resp = await selectTaskByTaskId(id)
  if (resp?.code !== 200) {
    throw new Error(resp?.msg || '加载任务失败')
  }
  task.value = resp.data
  selectedTaskId.value = id

  taskStartLocation.value = task.value?.startLocation || ''
  taskEndLocation.value = task.value?.endLocation || ''

  // 任务发布时通常会绑定 uavId，这里优先采用
  selectedUavId.value = task.value?.uavId ?? null

  setAltitudeByTaskType()

  // 兜底：如果任务没有 uavId，则让用户手动选择
  if (selectedUavId.value == null) {
    await loadUavs()
  }
}

const loadUavs = async () => {
  const resp = await selectUavList({ pageNum: 1, pageSize: 100 })
  uavList.value = resp?.rows || []
  if (selectedUavId.value == null && uavList.value.length) {
    selectedUavId.value = uavList.value[0].uavId
  }
}

const startPlanning = async () => {
  if (!task.value) {
    ElMessage.warning('请先加载任务')
    return
  }
  if (!taskStartLocation.value || !taskEndLocation.value) {
    ElMessage.error('任务缺少起点/终点')
    return
  }
  if (!map.value) {
    ElMessage.error('地图未初始化完成')
    return
  }

  clearPathInternal()

  // 地址 -> 经纬度点
  let startPointObj: any
  let endPointObj: any
  try {
    startPointObj = await getGeoPoint(taskStartLocation.value, map.value, '南昌市')
    endPointObj = await getGeoPoint(taskEndLocation.value, map.value, '南昌市')
  } catch (e: any) {
    ElMessage.error('地址解析失败：' + (e?.message || String(e)))
    return
  }

  // 标记起点/终点
  try {
    createGeoMarker(map.value, startPointObj, false)
    createGeoMarker(map.value, endPointObj, false)
  } catch {}

  const start = { lng: startPointObj.lng, lat: startPointObj.lat }
  const end = { lng: endPointObj.lng, lat: endPointObj.lat }
  lastGeoStart.value = start
  lastGeoEnd.value = end

  // 统一策略入口
  try {
    const { pathPoints: plannedPoints, algorithm } = await planTaskRoute(task.value, {
      map: map.value,
      start,
      end,
      uavId: selectedUavId.value,
      targetAltitudeM: targetAltitudeM.value,
      waterSubType: waterSubType.value,
      riverDirection: riverDirection.value,
      riverCenterOffsetM: riverCenterOffsetM.value,
      riverBankSide: riverBankSide.value
    })

    if (!plannedPoints?.length) {
      ElMessage.error('生成的路径为空')
      return
    }

    // 为了让 3D / 统计都一致：确保每个点都有 alt
    // 默认生成器会给出 alt，但防御性地统一补齐
    const normalizedWithAlt = plannedPoints.map((p) => ({
      lng: Number(p.lng),
      lat: Number(p.lat),
      alt: Number(p.alt ?? targetAltitudeM.value)
    }))
    pathPoints.value = enrichPathWithAltitude(normalizedWithAlt, { cruiseAlt: targetAltitudeM.value, preserveExistingAlt: true })

    maybeAutoFit(start, end, pathPoints.value)
    await runPathVisuals()

    lastAlgorithm.value = algorithm || ''
    persistRouteInfo(algorithm)
    showResult.value = true
    persistPlanningSession()
  } catch (e: any) {
    ElMessage.error('规划失败：' + (e?.message || String(e)))
  }
}

const maybeAutoFit = (start: any, end: any, points: any[]) => {
  try {
    if (map.value && points?.length) adjustMapViewport(map.value, points)
  } catch {}
}

const persistRouteInfo = (algorithmLabel: string) => {
  try {
    const pyMissionId = resolvePythonMissionId({
      task: task.value,
      startPointText: taskStartLocation.value,
      endPointText: taskEndLocation.value,
      startGeo: lastGeoStart.value,
      endGeo: lastGeoEnd.value
    })

    const flat = flattenPathCoordinates(pathPoints.value)
    const first = flat[0]
    const last = flat[flat.length - 1]

    const payload = {
      uavModel: selectedUavModel.value || '未知无人机',
      algorithm: algorithmLabel || taskType.value,
      pathType: taskType.value,
      businessTaskId: task.value?.taskId,
      pyMissionId: pyMissionId > 0 ? pyMissionId : undefined,
      missionId: pyMissionId > 0 ? pyMissionId : undefined,
      startPoint: taskStartLocation.value,
      endPoint: taskEndLocation.value,
      totalDistance: pathStats.value.totalDistance ?? 0,
      estimatedTime: pathStats.value.estimatedTime ?? 0,
      pointCount: pathStats.value.pointCount ?? pathPoints.value.length,
      startCoord: first ? `${first.lat.toFixed(6)},${first.lng.toFixed(6)}` : '',
      endCoord: last ? `${last.lat.toFixed(6)},${last.lng.toFixed(6)}` : '',
      waypoints: pathPoints.value,
      savedAt: Date.now(),
      compareResults: null,
      obstacles: [],
      rlMeta: null,
      source: 'taskPlanning'
    }
    localStorage.setItem('uav_route_data', JSON.stringify(payload))
  } catch (e) {
    console.warn('保存路线信息失败:', e)
  }
}

const openRouteInfo = () => {
  if (!showResult.value) {
    ElMessage.warning('请先规划生成路径')
    return
  }
  router.push({ path: '/uavNavigation/routeInfo' })
}

const openCesiumFlightSim = () => {
  if (!showResult.value || !pathPoints.value?.length) {
    ElMessage.warning('请先执行智能规划生成路径')
    return
  }
  if (!task.value?.taskId) {
    ElMessage.warning('任务信息不完整')
    return
  }

  const startWgs = lastGeoStart.value ? gcj02ToWgs84(lastGeoStart.value) : undefined
  const endWgs = lastGeoEnd.value ? gcj02ToWgs84(lastGeoEnd.value) : undefined
  const pathPointsWgs = convertPathGcj02ToWgs84(pathPoints.value || [])

  const missionId = resolvePythonMissionId({
    task: task.value,
    startPointText: taskStartLocation.value,
    endPointText: taskEndLocation.value,
    startGeo: startWgs,
    endGeo: endWgs
  })

  const payload = {
    taskId: task.value.taskId,
    taskName: task.value.taskName,
    taskType: task.value.taskType,
    startLocation: taskStartLocation.value,
    endLocation: taskEndLocation.value,
    start: lastGeoStart.value || undefined,
    end: lastGeoEnd.value || undefined,
    startWgs,
    endWgs,
    pathPoints: pathPoints.value,
    pathPointsWgs,
    coordinateSystem: 'GCJ02',
    cesiumCoordinateSystem: 'WGS84',
    targetAltitudeM: targetAltitudeM.value,
    algorithm: lastAlgorithm.value || taskType.value,
    missionId: missionId > 0 ? missionId : undefined,
    preferRl: false,
    createdAt: Date.now()
  }

  try {
    localStorage.setItem(FLIGHT_SIM_SESSION_KEY, JSON.stringify(payload))
  } catch (e) {
    console.warn('保存飞行模拟会话失败', e)
  }

  router.push({
    path: '/uavInfo/flightInfo',
    query: { taskId: String(task.value.taskId) }
  })
}

watch(
  taskType,
  () => {
    if (task.value) setAltitudeByTaskType()
  },
  { immediate: false }
)

watch(executionSpeedMps, () => {
  if (!showResult.value || !pathPoints.value.length || !map.value) return
  const flat = flattenPathCoordinates(pathPoints.value)
  drawPathWaypointMarkers(map.value, flat, pathWaypointMarkers, {
    speedMps: executionSpeedMps.value,
    altitudeM: targetAltitudeM.value
  })
})

const bootstrapPage = async () => {
  await loadTaskOptions()
  if (taskIdFromRoute.value != null) {
    selectedTaskId.value = taskIdFromRoute.value
    await initMap({ resetPath: false })
    await loadTask(taskIdFromRoute.value)
    await restorePlanningSession()
  } else if (taskOptions.value.length) {
    selectedTaskId.value = taskOptions.value[0].taskId
    await initMap({ resetPath: true })
    await loadTask(taskOptions.value[0].taskId)
  } else {
    await initMap({ resetPath: true })
  }
  await loadUavs().catch(() => {})
}

onMounted(async () => {
  await bootstrapPage()
  setTimeout(onMapContainerResize, 150)
  window.addEventListener('resize', onMapContainerResize)
})

onActivated(async () => {
  if (taskIdFromRoute.value != null && map.value) {
    selectedTaskId.value = taskIdFromRoute.value
    await restorePlanningSession()
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', onMapContainerResize)
  persistPlanningSession()
  if (executionTimer) {
    window.clearInterval(executionTimer)
    executionTimer = null
  }
  clearMapVisualsOnly()
})
</script>

<template>
  <div class="app-container task-planning-page">
    <div class="tp-page__bg" aria-hidden="true" />
    <div class="tp-page__decor" aria-hidden="true">
      <svg class="tp-page__lines" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <path class="tp-line" d="M-20 180 Q 320 120, 580 240 T 1100 160" />
        <path class="tp-line" d="M180 880 Q 460 640, 720 760 T 1300 520" />
      </svg>
    </div>

    <header class="tp-page-header">
      <div>
        <h1 class="tp-page-header__title">任务规划</h1>
        <p class="tp-page-header__desc">左侧配置与执行，中间预览 2D 航线，右侧查看无人机飞行参数</p>
      </div>
      <span class="tp-page-header__badge">{{ taskType || '待加载任务' }}</span>
    </header>

    <div class="card tp-card">
      <div class="tp-workspace">
        <div class="tp-map-stage">
          <div class="tp-map-head">
            <span class="tp-map-head__title">航线地图</span>
            <span class="tp-map-head__meta">
              2D · {{ showResult ? '已规划 · 悬停航点查看信息' : '待规划' }}
            </span>
          </div>
          <div ref="mapContainer" class="tp-map" />
        </div>

        <aside class="tp-sidebar tp-glass-panel">
          <div class="tp-sidebar__head">
            <div class="tp-control-item tp-control-item--span2">
              <span class="tp-control-label">选择任务</span>
              <el-select
                v-model="selectedTaskId"
                placeholder="请选择待规划任务"
                size="small"
                filterable
                :loading="switchingTask"
                @change="switchTask"
              >
                <el-option
                  v-for="item in taskOptions"
                  :key="item.taskId"
                  :label="item.taskName"
                  :value="item.taskId"
                >
                  <span>{{ item.taskName }}</span>
                  <span class="tp-task-option-meta">{{ item.taskType }}</span>
                </el-option>
              </el-select>
              <span v-if="!taskOptions.length" class="tp-hint">暂无可用任务，请先在任务池创建</span>
            </div>
            <div class="tp-sidebar__title">{{ taskName || '未加载任务' }}</div>
            <div class="tp-sidebar__sub">
              {{ taskStartLocation || '起点未设置' }} → {{ taskEndLocation || '终点未设置' }}
            </div>
            <span class="tp-sidebar__chip">{{ strategyLabel }}</span>
          </div>

          <div class="tp-control-grid">
            <div class="tp-control-item">
              <span class="tp-control-label">飞行高度(m)</span>
              <el-input-number v-model="targetAltitudeM" :min="20" :max="500" :step="5" controls-position="right" size="small" />
            </div>
            <div class="tp-control-item">
              <span class="tp-control-label">执行速度(m/s)</span>
              <el-input-number v-model="executionSpeedMps" :min="1" :max="40" :step="1" controls-position="right" size="small" />
            </div>
            <div class="tp-control-item tp-control-item--span2">
              <span class="tp-control-label">执行无人机</span>
              <el-select v-model="selectedUavId" placeholder="选择无人机" size="small">
                <el-option v-for="uav in uavList" :key="uav.uavId" :label="uav.uavModel" :value="uav.uavId" />
              </el-select>
              <span v-if="uavList.length === 0" class="tp-hint">无可用无人机，请先在任务池发布任务</span>
            </div>
          </div>

          <div v-if="taskType === '水域巡检'" class="tp-water-block">
            <div class="tp-control-grid">
              <div class="tp-control-item">
                <span class="tp-control-label">水域类型</span>
                <el-select v-model="waterSubType" size="small">
                  <el-option label="河流" value="河流" />
                  <el-option label="湖泊" value="湖泊" />
                </el-select>
              </div>
              <div v-if="waterSubType === '河流'" class="tp-control-item">
                <span class="tp-control-label">顺/逆流</span>
                <el-select v-model="riverDirection" size="small">
                  <el-option label="顺流" value="顺流" />
                  <el-option label="逆流" value="逆流" />
                </el-select>
              </div>
              <div v-if="waterSubType === '河流'" class="tp-control-item">
                <span class="tp-control-label">法向偏移(m)</span>
                <el-input-number v-model="riverCenterOffsetM" :min="0" :max="300" :step="5" controls-position="right" size="small" />
              </div>
              <div v-if="waterSubType === '河流'" class="tp-control-item">
                <span class="tp-control-label">偏移侧</span>
                <el-select v-model="riverBankSide" size="small">
                  <el-option label="左侧" value="left" />
                  <el-option label="右侧" value="right" />
                </el-select>
              </div>
            </div>
          </div>

          <div class="tp-actions">
            <button type="button" class="tp-action-btn tp-action-btn--primary" @click="startPlanning">智能规划</button>
            <button
              type="button"
              class="tp-action-btn tp-action-btn--accent"
              :disabled="!showResult || executing"
              @click="startTaskExecution"
            >
              执行任务
            </button>
            <button type="button" class="tp-action-btn tp-action-btn--ghost" @click="clearPath">清除路径</button>
            <button type="button" class="tp-action-btn tp-action-btn--ghost" :disabled="!showResult" @click="openRouteInfo">
              路线信息
            </button>
            <button
              type="button"
              class="tp-action-btn tp-action-btn--ghost tp-action-btn--wide"
              :disabled="!showResult"
              @click="openCesiumFlightSim"
            >
              Cesium 模拟
            </button>
          </div>

          <div v-if="executing" class="tp-execution-alert">
            执行中，剩余 <strong>{{ executionCountdownText }}</strong>
            <el-button type="warning" size="small" @click="terminateTaskExecution">终止任务</el-button>
          </div>
        </aside>

        <aside class="tp-flight-panel tp-glass-panel">
          <div class="tp-flight-panel__head">
            <div>
              <div class="tp-flight-panel__label">当前无人机</div>
              <div class="tp-flight-panel__model">{{ flightTelemetry.model }}</div>
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

          <div v-if="!currentUav" class="tp-flight-panel__empty">
            请选择执行无人机，完成智能规划后在此查看飞行参数
          </div>

          <template v-else>
            <div class="tp-flight-panel__meta">
              <span>{{ flightTelemetry.code }}</span>
              <span>{{ flightTelemetry.type }}</span>
              <span v-if="flightTelemetry.executing">执行中 {{ flightTelemetry.countdown }}</span>
            </div>

            <div class="tp-route-preview">
              {{ flightTelemetry.startText }} → {{ flightTelemetry.endText }}
            </div>

            <div class="tp-flight-metrics">
              <div class="tp-flight-metric">
                <span class="tp-flight-metric__label">飞行速度</span>
                <span class="tp-flight-metric__value">{{ flightTelemetry.speed }}<small>m/s</small></span>
                <span class="tp-flight-metric__sub">≈ {{ flightTelemetry.speedKmh }} km/h</span>
              </div>
              <div class="tp-flight-metric">
                <span class="tp-flight-metric__label">飞行高度</span>
                <span class="tp-flight-metric__value">{{ flightTelemetry.altitude }}<small>m</small></span>
                <span class="tp-flight-metric__sub">目标高度</span>
              </div>
              <div class="tp-flight-metric">
                <span class="tp-flight-metric__label">剩余电量</span>
                <span class="tp-flight-metric__value">{{ flightTelemetry.remainPercent }}<small>%</small></span>
                <span class="tp-flight-metric__sub">{{ flightTelemetry.hasPath ? '规划后预估' : '满电待命' }}</span>
              </div>
              <div class="tp-flight-metric">
                <span class="tp-flight-metric__label">预计耗时</span>
                <span class="tp-flight-metric__value tp-flight-metric__value--sm">
                  {{ flightTelemetry.hasPath ? flightTelemetry.estTimeText : '—' }}
                </span>
                <span class="tp-flight-metric__sub">
                  {{ flightTelemetry.maxFlightTime ? `续航 ${flightTelemetry.maxFlightTime} min` : '未设续航' }}
                </span>
              </div>
            </div>

            <div class="tp-flight-battery">
              <div class="tp-flight-battery__row">
                <span>电量消耗预估</span>
                <span>{{ flightTelemetry.hasPath ? flightTelemetry.powerPercent : 0 }}%</span>
              </div>
              <div class="tp-flight-battery__track">
                <div class="tp-flight-battery__bar" :style="{ width: flightTelemetry.remainPercent + '%' }" />
              </div>
            </div>

            <ul class="tp-flight-details">
              <li><span>航程</span><strong>{{ flightTelemetry.hasPath ? flightTelemetry.totalDistance + ' m' : '—' }}</strong></li>
              <li><span>航点数</span><strong>{{ flightTelemetry.hasPath ? flightTelemetry.pointCount : '—' }}</strong></li>
              <li><span>规划算法</span><strong>{{ flightTelemetry.hasPath ? flightTelemetry.algorithm : '—' }}</strong></li>
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
              <li><span>电池</span><strong>{{ flightTelemetry.batteryType }} · {{ flightTelemetry.batteryCapacity }} mAh</strong></li>
            </ul>
          </template>
        </aside>
      </div>
    </div>
  </div>
</template>

