<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
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

const targetAltitudeM = computed(() => Number(session.value?.targetAltitudeM) || 120)
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
const routePlanSteps = computed(() => [
  {
    title: '读取任务起终点',
    desc: `${session.value?.startLocation || '起点'} → ${session.value?.endLocation || '终点'}`
  },
  {
    title: '匹配 Python Q-table',
    desc: missionId.value > 0 ? getMissionLabel(missionId.value) : '未命中训练任务时使用已规划路径'
  },
  {
    title: '统一到 WGS84',
    desc: '高德 GCJ-02 路线会先转换为 Cesium / GeoJSON 使用的 WGS84'
  },
  {
    title: '生成轻量三维路线',
    desc: `抽样渲染 ${Math.min(pathPoints.value.length, 240)} / ${pathPoints.value.length || 0} 个路径点，降低 Cesium 重绘压力`
  },
  {
    title: '按需播放演算',
    desc: '默认先展示路线图，点击播放后再启动无人机动画'
  }
])

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

  const existing = getExistingCesiumPath(session.value)
  if (!forceRl && existing.length >= 2) {
    pathPoints.value = existing.map((p) => ({
      lng: p.lng,
      lat: p.lat,
      alt: Number(p.alt ?? targetAltitudeM.value)
    }))
    rlMeta.value = null
    return
  }

  const preferRl = forceRl || session.value?.preferRl === true
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
    pathColor: '#38bdf8',
    pathWidth: 4,
    showEndpoints: true
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
    session.value = { ...session.value, startWgs: start, endWgs: end, cesiumCoordinateSystem: 'WGS84' }
    session.value.preferRl = true
    await loadPathWithRl(start, end, true)
    renderRoutePreview()
    ElMessage.success('已使用 Q-table 重新生成路线图')
  } catch (e: any) {
    ElMessage.error(e?.message || String(e))
  } finally {
    loading.value = false
  }
}

async function bootstrap() {
  session.value = loadSession()
  if (!session.value) {
    ElMessage.warning('暂无飞行任务数据，请从「任务规划」页规划后进入飞行模拟')
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
    <header class="flight-sim-header">
      <div>
        <h1 class="flight-sim-title">飞行模拟 · Cesium</h1>
        <p class="flight-sim-sub">{{ taskTitle }} · {{ session?.taskType || '任务' }} · {{ pathStatsText }}</p>
      </div>
    </header>

    <div class="flight-sim-card">
      <div class="flight-sim-toolbar">
        <span class="flight-mission-chip">{{ missionLabel }}</span>
        <div class="flight-side-actions" style="flex-direction: row; flex-wrap: wrap;">
          <el-button size="small" :type="isPlaying ? 'warning' : 'primary'" :loading="loading" @click="togglePlay">
            {{ isPlaying ? '暂停演算' : '播放演算' }}
          </el-button>
          <el-button size="small" :loading="planning || loading" @click="replanAndPlay">重算路线图</el-button>
          <el-switch v-model="showImagery" active-text="影像" inactive-text="纯色" />
        </div>
      </div>

      <div class="flight-sim-body">
        <aside class="flight-sim-side">
          <div class="flight-side-block">
            <div class="flight-side-label">任务</div>
            <div class="flight-stat-row"><span>起点</span><strong>{{ session?.startLocation || '—' }}</strong></div>
            <div class="flight-stat-row"><span>终点</span><strong>{{ session?.endLocation || '—' }}</strong></div>
            <div class="flight-stat-row"><span>巡航高度</span><strong>{{ targetAltitudeM }} m</strong></div>
            <div class="flight-stat-row">
              <span>算法</span>
              <strong>{{ session?.algorithm || (missionId > 0 ? 'RL Q-table' : '—') }}</strong>
            </div>
          </div>

          <div class="flight-side-block">
            <div class="flight-side-label">路线图</div>
            <div class="flight-route-plan">
              <div v-for="(step, idx) in routePlanSteps" :key="step.title" class="flight-route-step">
                <span class="flight-route-dot">{{ idx + 1 }}</span>
                <div>
                  <div class="flight-route-main">{{ step.title }}</div>
                  <div class="flight-route-sub">{{ step.desc }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="flight-side-block">
            <div class="flight-side-label">演算</div>
            <div class="flight-stat-row"><span>进度</span><strong>{{ progressIndex }} / {{ progressTotal }}</strong></div>
            <div class="flight-stat-row"><span>已飞距离</span><strong>{{ progressDistanceM }} m</strong></div>
            <div v-if="rlMeta?.plannerMode" class="flight-stat-row">
              <span>推理模式</span><strong>{{ rlMeta.plannerMode }}</strong>
            </div>
          </div>

          <div class="flight-side-block">
            <div class="flight-side-label">播放速度</div>
            <el-slider v-model="speedMultiplier" :min="0.5" :max="4" :step="0.5" />
          </div>

          <div class="flight-side-block">
            <div class="flight-side-label">性能</div>
            <div class="flight-stat-row">
              <span>建筑体块</span>
              <el-switch v-model="showBuildings" :loading="buildingsLoading" active-text="开" inactive-text="关" />
            </div>
          </div>
        </aside>

        <div ref="mapRef" class="flight-sim-map" v-loading="loading || planning">
          <div class="flight-sim-overlay">
            Python Q-table · mission {{ missionId > 0 ? missionId : 'auto' }}
            <br />
            轻量路线图 · 按需播放三维演算
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
