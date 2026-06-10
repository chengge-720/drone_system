<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { selectTaskByTaskId, selectTaskList } from '@/api/system/task.js'
import { loadPlanningSession } from '@/utils/taskExecutionStorage'
import {
  mountCesiumFlightMap,
  type CesiumCityBuildingsHandle
} from '@/utils/cesiumFlightViewer'
import {
  clearFlightEntities,
  drawFlightPathOnViewer,
  startFlightPlayback,
  type FlightPlaybackHandle,
  type FlightSceneEntities
} from '@/utils/cesiumFlightPlayback'
import {
  FLIGHT_SIM_SESSION_KEY,
  getMissionLabel,
  resolvePythonMissionId
} from '@/utils/missionRlResolver'
import { fetchRlPath } from '@/utils/rlPathService'
import { normalizeGeoPathPoints } from '@/utils/geoPathNormalize'
import { convertPathGcj02ToWgs84, gcj02ToWgs84 } from '@/utils/coordTransform'
import { create2DMap, getGeoPoint } from '@/utils/mapInitializer'
import { calculatePathStats, flattenPathCoordinates } from '@/utils/pathCalculator'
import '@/assets/styles/flightSimulation.css'

interface FlightSimSession {
  taskId?: number
  taskName?: string
  taskType?: string
  startLocation?: string
  endLocation?: string
  start?: { lat: number; lng: number }
  end?: { lat: number; lng: number }
  startWgs?: { lat: number; lng: number }
  endWgs?: { lat: number; lng: number }
  pathPoints?: Array<{ lng: number; lat: number; alt?: number }>
  pathPointsWgs?: Array<{ lng: number; lat: number; alt?: number }>
  coordinateSystem?: 'GCJ02' | 'WGS84'
  cesiumCoordinateSystem?: 'WGS84'
  targetAltitudeM?: number
  algorithm?: string
  missionId?: number
  preferRl?: boolean
}

const route = useRoute()
const ionToken = (import.meta.env.VITE_CESIUM_ION_TOKEN || '') as string

const mapRef = ref<HTMLElement | null>(null)
const viewerHandle = shallowRef<CesiumCityBuildingsHandle | null>(null)
const playback = shallowRef<FlightPlaybackHandle | null>(null)
const entities = ref<FlightSceneEntities>({
  pathEntity: null,
  pathGlowEntity: null,
  startEntity: null,
  endEntity: null,
  droneEntity: null
})

const loading = ref(false)
const planning = ref(false)
const showImagery = ref(true)
const showBuildings = ref(false)
const buildingsLoading = ref(false)
const speedMultiplier = ref(1)
const isPlaying = ref(false)

const session = ref<FlightSimSession | null>(null)
const missionId = ref(0)
const pathPoints = ref<Array<{ lng: number; lat: number; alt: number }>>([])
const rlMeta = ref<Record<string, unknown> | null>(null)

const progressIndex = ref(0)
const progressTotal = ref(0)
const progressDistanceM = ref(0)
const sampleMaxPoints = ref(240)
const switchingTask = ref(false)
const inferMode = ref<'auto' | 'rl' | 'planned'>('auto')
const taskQueue = ref<any[]>([])
const activeTaskId = ref<number | null>(null)
const editAltitudeM = ref(120)

const algorithmOptions = [
  { label: '自动（规划优先）', value: 'auto' },
  { label: 'RL Q-table', value: 'rl' },
  { label: '仅规划路径', value: 'planned' }
]

const taskStatusMap: Record<number, string> = {
  1: '待执行',
  2: '执行中',
  3: '已完成',
  4: '已取消'
}

const progressPercent = computed(() => {
  if (!progressTotal.value) return 0
  return Math.min(100, Math.round((progressIndex.value / progressTotal.value) * 100))
})

const sampledPointText = computed(() => {
  const total = pathPoints.value.length
  if (!total) return '—'
  const shown = Math.min(total, sampleMaxPoints.value)
  return `${shown} / ${total}`
})

const targetAltitudeM = computed(
  () => Number(editAltitudeM.value) || Number(session.value?.targetAltitudeM) || 120
)

function taskStatusLabel(status?: number) {
  if (status == null) return '—'
  return taskStatusMap[status] || '未知'
}

const taskTitle = computed(() => session.value?.taskName || `任务 #${session.value?.taskId ?? '—'}`)
const missionLabel = computed(() =>
  missionId.value > 0 ? getMissionLabel(missionId.value) : '未匹配训练任务（将使用已有路径或默认推理）'
)
const pathStatsText = computed(() => {
  if (!pathPoints.value.length) return '—'
  const flat = flattenPathCoordinates(pathPoints.value)
  const s = calculatePathStats(flat)
  return `${s.totalDistance} m · 约 ${s.estimatedTime} s · ${pathPoints.value.length} 点`
})
let geoMap: any = null
let geoMapEl: HTMLDivElement | null = null

async function ensureGeoMap() {
  if (geoMap) return geoMap
  geoMapEl = document.createElement('div')
  geoMapEl.style.cssText = 'width:1px;height:1px;position:absolute;left:-9999px;top:0;overflow:hidden'
  document.body.appendChild(geoMapEl)
  geoMap = create2DMap(geoMapEl)
  return geoMap
}

function loadSession(): FlightSimSession | null {
  try {
    const raw = localStorage.getItem(FLIGHT_SIM_SESSION_KEY)
    if (raw) return JSON.parse(raw) as FlightSimSession
  } catch {}
  try {
    const routeRaw = localStorage.getItem('uav_route_data')
    if (routeRaw) {
      const d = JSON.parse(routeRaw)
      const qTaskId = route.query.taskId
      return {
        taskId: qTaskId != null ? Number(qTaskId) : undefined,
        pathPoints: d.waypoints || [],
        targetAltitudeM: 120,
        algorithm: d.algorithm,
        pathPointsWgs: convertPathGcj02ToWgs84(normalizeGeoPathPoints(d.waypoints || []) as any),
        coordinateSystem: 'GCJ02',
        cesiumCoordinateSystem: 'WGS84'
      }
    }
  } catch {}
  return null
}

function toWgsPoint(point?: { lat: number; lng: number } | null, coordSys?: string) {
  if (!point) return null
  if (coordSys === 'WGS84') return point
  return gcj02ToWgs84(point)
}

function getExistingCesiumPath(s: FlightSimSession | null) {
  if (!s) return []
  const wgs = normalizeGeoPathPoints(s.pathPointsWgs || [])
  if (wgs.length >= 2) return wgs

  const raw = normalizeGeoPathPoints(s.pathPoints || [])
  if (raw.length < 2) return []
  if (s.coordinateSystem === 'WGS84') return raw
  return convertPathGcj02ToWgs84(raw as any)
}

async function resolveEndpoints(s: FlightSimSession) {
  let start = s.startWgs || toWgsPoint(s.start, s.coordinateSystem)
  let end = s.endWgs || toWgsPoint(s.end, s.coordinateSystem)
  if (start && end) return { start, end }

  const mapInst = await ensureGeoMap()
  const city = '南昌市'
  if (!start && s.startLocation) {
    const p = await getGeoPoint(s.startLocation, mapInst, city)
    start = gcj02ToWgs84({ lat: p.lat, lng: p.lng })
  }
  if (!end && s.endLocation) {
    const p = await getGeoPoint(s.endLocation, mapInst, city)
    end = gcj02ToWgs84({ lat: p.lat, lng: p.lng })
  }
  if (!start || !end) throw new Error('无法解析任务起终点，请先在任务规划页执行路径规划')
  return { start, end }
}

function buildSessionFromTask(task: any, planning: ReturnType<typeof loadPlanningSession>): FlightSimSession {
  const pts = planning?.pathPoints || []
  const normalized = normalizeGeoPathPoints(pts)
  const pathPointsWgs =
    normalized.length >= 2 ? convertPathGcj02ToWgs84(normalized as any) : undefined
  return {
    taskId: task.taskId,
    taskName: task.taskName,
    taskType: task.taskType,
    startLocation: task.startLocation,
    endLocation: task.endLocation,
    pathPoints: normalized.length >= 2 ? normalized : undefined,
    pathPointsWgs,
    coordinateSystem: 'GCJ02',
    cesiumCoordinateSystem: 'WGS84',
    targetAltitudeM: planning?.targetAltitudeM ?? 120,
    algorithm: planning?.lastAlgorithm || task.taskType,
    preferRl: false
  }
}

async function loadTaskQueue() {
  try {
    const resp = await selectTaskList({ pageNum: 1, pageSize: 200 })
    taskQueue.value = (resp?.rows || []).filter((t: any) => t.status !== 4)
  } catch {
    taskQueue.value = []
  }
}

async function switchQueueTask(taskId: number) {
  if (switchingTask.value) return
  if (activeTaskId.value === taskId && pathPoints.value.length >= 2) return

  switchingTask.value = true
  loading.value = true
  stopPlayback()
  try {
    const resp = await selectTaskByTaskId(taskId)
    if (resp?.code !== 200) throw new Error(resp?.msg || '加载任务失败')
    const task = resp.data
    const planning = loadPlanningSession(taskId)
    activeTaskId.value = taskId
    session.value = buildSessionFromTask(task, planning)
    editAltitudeM.value = session.value.targetAltitudeM ?? 120
    inferMode.value = 'auto'

    try {
      localStorage.setItem(FLIGHT_SIM_SESSION_KEY, JSON.stringify(session.value))
    } catch {}

    const { start, end } = await resolveEndpoints(session.value)
    session.value = { ...session.value, startWgs: start, endWgs: end, cesiumCoordinateSystem: 'WGS84' }
    await loadPathWithRl(start, end)
    renderRoutePreview()
  } catch (e: any) {
    ElMessage.error(e?.message || String(e))
  } finally {
    switchingTask.value = false
    loading.value = false
  }
}

async function loadPathWithRl(start: { lat: number; lng: number }, end: { lat: number; lng: number }, forceRl = false) {
  const mid =
    Number(session.value?.missionId) ||
    resolvePythonMissionId({
      task: session.value as any,
      startPointText: session.value?.startLocation,
      endPointText: session.value?.endLocation,
      startGeo: start,
      endGeo: end
    })
  missionId.value = mid

  const mode = inferMode.value
  const useForceRl = forceRl || mode === 'rl'
  const existing = getExistingCesiumPath(session.value)

  if (mode === 'planned') {
    if (existing.length < 2) {
      throw new Error('该任务暂无规划路径，请先在任务规划页生成路径')
    }
    pathPoints.value = existing.map((p) => ({
      lng: p.lng,
      lat: p.lat,
      alt: Number(p.alt ?? targetAltitudeM.value)
    }))
    rlMeta.value = null
    return
  }

  if (!useForceRl && existing.length >= 2) {
    pathPoints.value = existing.map((p) => ({
      lng: p.lng,
      lat: p.lat,
      alt: Number(p.alt ?? targetAltitudeM.value)
    }))
    rlMeta.value = null
    return
  }

  const preferRl = useForceRl || session.value?.preferRl === true
  if (preferRl && mid > 0) {
    planning.value = true
    try {
      const { pathPoints: pts, rlMeta: meta } = await fetchRlPath({
        start,
        end,
        cruiseAlt: targetAltitudeM.value,
        missionId: mid,
        qOnly: true
      })
      pathPoints.value = pts
      rlMeta.value = meta
      return
    } catch (e: any) {
      ElMessage.warning(`Q-table 推理失败，将使用任务规划路径：${e?.message || String(e)}`)
    } finally {
      planning.value = false
    }
  }

  if (mid > 0) {
    const { pathPoints: pts, rlMeta: meta } = await fetchRlPath({
      start,
      end,
      cruiseAlt: targetAltitudeM.value,
      missionId: mid
    })
    pathPoints.value = pts
    rlMeta.value = meta
    return
  }

  throw new Error('未匹配到 Python 训练任务，且无可用的规划路径')
}

function stopPlayback() {
  playback.value?.stop()
  playback.value = null
  isPlaying.value = false
}

function runPlayback() {
  const viewer = viewerHandle.value?.viewer
  if (!viewer || pathPoints.value.length < 2) return
  stopPlayback()
  playback.value = startFlightPlayback(viewer, pathPoints.value, entities.value, {
    speedMps: 16,
    followDrone: true,
    trailSeconds: 120,
    onProgress: ({ index, total, distanceM }) => {
      progressIndex.value = index
      progressTotal.value = total
      progressDistanceM.value = Math.round(distanceM)
    },
    onComplete: () => {
      isPlaying.value = false
    }
  })
  playback.value?.setSpeedMultiplier(speedMultiplier.value)
  isPlaying.value = true
}

function renderRoutePreview() {
  const viewer = viewerHandle.value?.viewer
  if (!viewer || pathPoints.value.length < 2) return
  stopPlayback()
  progressIndex.value = 0
  progressTotal.value = Math.max(pathPoints.value.length - 1, 0)
  progressDistanceM.value = 0
  drawFlightPathOnViewer(viewer, pathPoints.value, entities.value, {
    pathColor: '#22d3ee',
    pathWidth: 4,
    showEndpoints: true,
    glow: true,
    maxRenderPoints: sampleMaxPoints.value
  })
}

function togglePlay() {
  if (!playback.value) {
    runPlayback()
    return
  }
  if (playback.value.isPaused()) {
    playback.value.resume()
    isPlaying.value = true
  } else {
    playback.value.pause()
    isPlaying.value = false
  }
}

async function replanAndPlay() {
  if (!session.value) return
  loading.value = true
  stopPlayback()
  try {
    const { start, end } = await resolveEndpoints(session.value)
    session.value = {
      ...session.value,
      startWgs: start,
      endWgs: end,
      cesiumCoordinateSystem: 'WGS84',
      targetAltitudeM: targetAltitudeM.value,
      preferRl: inferMode.value === 'rl'
    }
    const forceRl = inferMode.value !== 'planned'
    await loadPathWithRl(start, end, forceRl)
    renderRoutePreview()
    const msg =
      inferMode.value === 'planned'
        ? '已加载任务规划路径'
        : inferMode.value === 'rl'
          ? '已使用 RL Q-table 重新演算路径'
          : '路径演算完成'
    ElMessage.success(msg)
  } catch (e: any) {
    ElMessage.error(e?.message || String(e))
  } finally {
    loading.value = false
  }
}

async function bootstrap() {
  await loadTaskQueue()
  session.value = loadSession()

  if (!session.value) {
    if (taskQueue.value.length) {
      await switchQueueTask(taskQueue.value[0].taskId)
      return
    }
    ElMessage.warning('暂无飞行任务数据，请从「任务规划」页规划后进入飞行模拟')
    return
  }

  activeTaskId.value = session.value.taskId ?? null
  editAltitudeM.value = session.value.targetAltitudeM ?? 120

  const qTaskId = route.query.taskId
  if (qTaskId != null && Number(qTaskId) !== activeTaskId.value) {
    await switchQueueTask(Number(qTaskId))
    return
  }

  loading.value = true
  try {
    const { start, end } = await resolveEndpoints(session.value)
    session.value = { ...session.value, startWgs: start, endWgs: end, cesiumCoordinateSystem: 'WGS84' }
    await loadPathWithRl(start, end)
    renderRoutePreview()
  } catch (e: any) {
    ElMessage.error(e?.message || String(e))
  } finally {
    loading.value = false
  }
}

watch(showImagery, (v) => viewerHandle.value?.setBaseImageryVisible(v))
watch(speedMultiplier, (v) => playback.value?.setSpeedMultiplier(v))
watch(sampleMaxPoints, () => {
  if (pathPoints.value.length >= 2) renderRoutePreview()
})
watch(showBuildings, async (v) => {
  const handle = viewerHandle.value
  if (!handle) return
  buildingsLoading.value = true
  try {
    handle.setBuildingLoadParams({
      buildingsGeoJsonUrl: v ? '/geo/nanchang/nanchang_building_baidu.geojson' : ''
    })
    await handle.reloadBuildings()
    handle.viewer.scene.requestRender()
  } finally {
    buildingsLoading.value = false
  }
})

onMounted(async () => {
  if (!mapRef.value) return
  loading.value = true
  try {
    viewerHandle.value = await mountCesiumFlightMap(mapRef.value, {
      ionToken,
      showBaseImagery: showImagery.value,
      globeNoImageryColor: '#1e293b',
      buildingsGeoJsonUrl: showBuildings.value ? '/geo/nanchang/nanchang_building_baidu.geojson' : '',
      defaultBuildingHeightM: 28,
      heightExaggeration: 1,
      lowPowerMode: true
    })
    if (showBuildings.value) await viewerHandle.value.reloadBuildings()
    await bootstrap()
  } catch (e: any) {
    ElMessage.error(`场景初始化失败：${e?.message || String(e)}`)
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  stopPlayback()
  const viewer = viewerHandle.value?.viewer
  if (viewer) clearFlightEntities(viewer, entities.value)
  try {
    viewerHandle.value?.destroy()
  } catch {}
  viewerHandle.value = null
  if (geoMapEl) {
    try {
      document.body.removeChild(geoMapEl)
    } catch {}
    geoMapEl = null
    geoMap = null
  }
})
</script>

<template>
  <div class="app-container flight-sim-page">
    <div ref="mapRef" class="flight-sim-stage" v-loading="loading || planning" />

    <div class="fs-hud">
      <div class="fs-hud__title">{{ taskTitle }}</div>
      <div class="fs-hud__sub">
        {{ session?.taskType || '任务' }} · {{ pathStatsText }}
        <br />
        {{ missionLabel }}
      </div>
    </div>

    <aside class="fs-panel--left">
      <div class="fs-panel__head">
        <h2 class="fs-panel__title">飞行监控</h2>
        <span class="fs-panel__badge">{{ isPlaying ? 'PLAY' : 'STBY' }}</span>
      </div>

      <div class="fs-panel__scroll">
        <div class="fs-block">
          <div class="fs-block__label">航路参数</div>
          <dl class="fs-kv">
            <dt>起点</dt>
            <dd>{{ session?.startLocation || '—' }}</dd>
            <dt>终点</dt>
            <dd>{{ session?.endLocation || '—' }}</dd>
            <dt>算法</dt>
            <dd>{{ session?.algorithm || (missionId > 0 ? 'RL Q-table' : '—') }}</dd>
          </dl>
          <div class="fs-field" style="margin-top: 8px">
            <span class="fs-field__label">巡航高度 (m)</span>
            <el-input-number v-model="editAltitudeM" :min="30" :max="500" :step="10" size="small" />
          </div>
          <div class="fs-field" style="margin-top: 8px">
            <span class="fs-field__label">路径算法</span>
            <el-select v-model="inferMode" size="small" style="width: 100%">
              <el-option
                v-for="opt in algorithmOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
        </div>

        <div class="fs-block">
          <div class="fs-block__label">演算遥测</div>
          <div class="fs-telemetry">
            <div class="fs-telemetry__cell">
              <span class="fs-telemetry__label">进度</span>
              <span class="fs-telemetry__value">{{ progressIndex }}/{{ progressTotal }}</span>
            </div>
            <div class="fs-telemetry__cell">
              <span class="fs-telemetry__label">已飞距离</span>
              <span class="fs-telemetry__value">{{ progressDistanceM }} m</span>
            </div>
            <div class="fs-telemetry__cell">
              <span class="fs-telemetry__label">巡航高度</span>
              <span class="fs-telemetry__value">{{ targetAltitudeM }} m</span>
            </div>
            <div class="fs-telemetry__cell">
              <span class="fs-telemetry__label">Mission</span>
              <span class="fs-telemetry__value">{{ missionId > 0 ? missionId : '—' }}</span>
            </div>
          </div>
          <p v-if="rlMeta?.plannerMode" class="fs-hud__sub" style="margin: 8px 0 0">
            推理模式 · {{ rlMeta.plannerMode }}
          </p>
        </div>

        <div class="fs-block">
          <div class="fs-queue__head">
            <div class="fs-block__label" style="margin-bottom: 0">任务队列</div>
            <span class="fs-queue__count">{{ taskQueue.length }} 项</span>
          </div>
          <div class="fs-queue__track">
            <button
              v-for="t in taskQueue"
              :key="t.taskId"
              type="button"
              class="fs-queue__item"
              :class="{ 'is-active': activeTaskId === t.taskId }"
              @click="switchQueueTask(t.taskId)"
            >
              <span class="fs-queue__name">{{ t.taskName || `任务 #${t.taskId}` }}</span>
              <span class="fs-queue__meta">{{ taskStatusLabel(t.status) }} · {{ t.taskType || '—' }}</span>
            </button>
          </div>
        </div>
      </div>
    </aside>

    <footer class="fs-dock">
      <div class="fs-dock__group">
        <button
          type="button"
          class="fs-dock__btn fs-dock__btn--primary"
          :disabled="!session || loading || planning"
          @click="replanAndPlay"
        >
          {{ planning ? '演算中…' : '路径演算' }}
        </button>
      </div>

      <div class="fs-dock__divider" />

      <div class="fs-dock__group">
        <button
          type="button"
          class="fs-dock__btn fs-dock__btn--play"
          :disabled="pathPoints.length < 2 || loading"
          @click="togglePlay"
        >
          {{ isPlaying ? '暂停' : '播放' }}
        </button>
      </div>

      <div class="fs-dock__divider" />

      <div class="fs-dock__group fs-dock__group--grow">
        <span class="fs-dock__label">抽样渲染 {{ sampledPointText }}</span>
        <el-slider v-model="sampleMaxPoints" :min="60" :max="800" :step="20" style="flex: 1; min-width: 100px" />
      </div>

      <div class="fs-dock__divider" />

      <div class="fs-dock__group">
        <span class="fs-dock__label">倍速 ×{{ speedMultiplier }}</span>
        <el-slider v-model="speedMultiplier" :min="0.5" :max="4" :step="0.5" style="width: 96px" />
      </div>

      <div class="fs-dock__divider" />

      <div class="fs-dock__group">
        <el-switch v-model="showImagery" active-text="影像" inactive-text="底图" />
        <el-switch v-model="showBuildings" :loading="buildingsLoading" active-text="建筑" inactive-text="建筑" />
      </div>

      <div class="fs-dock__group fs-dock__progress">
        <span class="fs-dock__label">演算进度 {{ progressPercent }}%</span>
        <div class="fs-dock__progress-bar">
          <div class="fs-dock__progress-fill" :style="{ width: `${progressPercent}%` }" />
        </div>
      </div>
    </footer>
  </div>
</template>
