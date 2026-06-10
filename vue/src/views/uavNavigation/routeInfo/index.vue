<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { RefreshRight, Download, Picture } from '@element-plus/icons-vue'
import { getRlPlot, regenerateRlPlots } from '@/api/system/pathPlanning'
import { loadTripleFromStorage } from '@/utils/tripleAlgoAnalysis'
import {
  PY_MISSION_OPTIONS,
  getMissionLabel,
  resolvePythonMissionIdFromRouteCache
} from '@/utils/missionRlResolver'
import {
  buildSessionPlotsFromTriple,
  PATH_LEVEL_PLOT_DEFS,
  OFFLINE_DEEP_PLOT_DEFS,
  type SessionPlotPack
} from '@/utils/layeredAlgoPlots'
import '@/assets/styles/routeInfo.css'

type PlotItem = { id: string; title: string; src: string; tier: string; note?: string }

const plotMissionId = ref<number>(0)
const plotTaskKey = ref('')
const pathLevelPlots = ref<PlotItem[]>([])
const rlCorePlots = ref<PlotItem[]>([])
const offlinePlots = ref<PlotItem[]>([])
const loading = ref(false)
const regenerating = ref(false)
const errorText = ref('')
const preview = ref<{ title: string; src: string } | null>(null)
const hasTripleData = ref(false)
const hasSessionRl = ref(false)

const routeInfo = ref<any>({
  uavModel: '',
  algorithm: '',
  totalDistance: 0,
  estimatedTime: 0,
  pointCount: 0,
  waypoints: [],
  startCoord: '',
  endCoord: ''
})

const previewVisible = computed({
  get: () => preview.value != null,
  set: (v: boolean) => {
    if (!v) preview.value = null
  }
})

const stats = computed(() => {
  const data = routeInfo.value || {}
  const waypoints = Array.isArray(data.waypoints) ? data.waypoints : []
  return {
    distanceKm: (Number(data.totalDistance || 0) / 1000).toFixed(2),
    etaSec: Number(data.estimatedTime || 0),
    points: waypoints.length || Number(data.pointCount || 0),
    algo: data.algorithm || '—'
  }
})

const missionLabel = computed(() => {
  if (plotTaskKey.value) return `任务 Q 表 ${plotTaskKey.value}`
  return plotMissionId.value > 0 ? getMissionLabel(plotMissionId.value) : '会话级图表'
})

const displayMode = computed(() => {
  if (plotTaskKey.value && offlinePlots.value.some((p) => p.src)) return 'task-trained'
  if (plotMissionId.value > 0 && offlinePlots.value.some((p) => p.src)) return 'offline'
  if (hasTripleData.value || hasSessionRl.value) return 'session'
  return 'empty'
})

const missionHint = computed(() => {
  if (displayMode.value === 'task-trained') {
    return `任务 ${plotTaskKey.value} 已在线训练 Q 表，深度分析图来自当前起终点栅格。`
  }
  if (displayMode.value === 'offline') {
    return `Mission ${plotMissionId.value} 离线 Q 表深度分析已加载；路径级与 RL 核心图优先展示当前任务结果。`
  }
  if (displayMode.value === 'session') {
    return '当前展示基于路径规划/三算法对比生成的会话级图表；全局训练图为离线训练汇总。'
  }
  const start = routeInfo.value?.startPoint || routeInfo.value?.startCoord || '—'
  const end = routeInfo.value?.endPoint || routeInfo.value?.endCoord || '—'
  return `起终点「${start} → ${end}」。请先在路径规划页执行规划或三算法对比；全局训练图仍可从离线训练资源加载。`
})

const hasMatchedMission = computed(() => plotMissionId.value > 0)

const fetchPlotSafe = async (name: string, missionId = 0, ext = 'png', taskKey = '') => {
  try {
    const resp = await getRlPlot(name, missionId, ext, taskKey)
    if (resp?.code !== 200 || !resp?.data?.dataBase64) return ''
    const mime = resp.data?.mime || (ext === 'gif' ? 'image/gif' : 'image/png')
    return `data:${mime};base64,${resp.data.dataBase64}`
  } catch {
    return ''
  }
}

const syncMissionFromRoute = () => {
  plotTaskKey.value = String(routeInfo.value?.rlTaskKey || '').trim()
  const resolved = resolvePythonMissionIdFromRouteCache(routeInfo.value || {})
  if (resolved > 0) plotMissionId.value = resolved
}

const loadRouteInfo = () => {
  try {
    const raw = localStorage.getItem('uav_route_data')
    if (raw) {
      routeInfo.value = JSON.parse(raw)
      syncMissionFromRoute()
    }
  } catch {}
}

const buildSessionLayer = (): SessionPlotPack | null => {
  const triple = loadTripleFromStorage()
  if (triple?.tripleAlgoResults?.length) {
    hasTripleData.value = true
    return buildSessionPlotsFromTriple(triple.tripleAlgoResults)
  }

  hasTripleData.value = false
  const wps = routeInfo.value?.waypoints
  if (Array.isArray(wps) && wps.length >= 2) {
    hasSessionRl.value = true
    return null
  }
  hasSessionRl.value = false
  return null
}

const loadPlots = async () => {
  loading.value = true
  errorText.value = ''
  pathLevelPlots.value = []
  rlCorePlots.value = []
  offlinePlots.value = []

  try {
    const session = buildSessionLayer()
    const mid = Number(plotMissionId.value || 0)
    const taskKey = plotTaskKey.value

    // 路径级对比（会话）
    if (session) {
      pathLevelPlots.value = PATH_LEVEL_PLOT_DEFS.map((def) => ({
        id: def.id,
        title: def.title,
        src: session[def.key] || '',
        tier: 'path',
        note: session[def.key] ? '当前任务' : undefined
      })).filter((p) => p.src)
    }

    // RL 核心：训练进度图
    const trainingSrc = taskKey
      ? await fetchPlotSafe('training_progress', 0, 'png', taskKey)
      : await fetchPlotSafe('training_progress', 0, 'png')
    rlCorePlots.value = [
      {
        id: 'training_progress',
        title: taskKey ? '任务训练进度' : '全局训练进度',
        src: trainingSrc,
        tier: 'rl',
        note: trainingSrc ? (taskKey ? '当前任务 Q 表训练' : '离线训练汇总') : undefined
      }
    ]

    const deepPlotDefs = OFFLINE_DEEP_PLOT_DEFS.filter(
      (p) => p.name !== 'current_trajectory' && p.name !== 'path_evolution'
    )
    if (taskKey) {
      const list: PlotItem[] = []
      for (const p of deepPlotDefs) {
        const src = await fetchPlotSafe(p.name, 0, p.ext, taskKey)
        if (src) list.push({ id: p.name, title: p.title, src, tier: 'offline' })
      }
      offlinePlots.value = list
    } else if (mid > 0) {
      const list: PlotItem[] = []
      for (const p of deepPlotDefs) {
        const src = await fetchPlotSafe(p.name, mid, p.ext)
        if (src) list.push({ id: p.name, title: p.title, src, tier: 'offline' })
      }
      offlinePlots.value = list
    }
  } catch (e: any) {
    errorText.value = e?.message || '图表加载失败'
  } finally {
    loading.value = false
  }
}

const openPreview = (title: string, src: string) => {
  if (!src) return
  preview.value = { title, src }
}

const regenerateAndReload = async () => {
  const mid = Number(plotMissionId.value || 0)
  if (mid <= 0) {
    ElMessage.warning('请先选择或匹配 Python Mission 编号（1–4）以重生成离线对比图')
    return
  }
  regenerating.value = true
  try {
    const resp = await regenerateRlPlots({ missionId: mid })
    if (resp?.code !== 200) {
      throw new Error(resp?.msg || '重新生成对比图失败')
    }
    await loadPlots()
    ElMessage.success('离线对比图已更新')
  } catch (e: any) {
    ElMessage.error(e?.message || '重新生成对比图失败')
  } finally {
    regenerating.value = false
  }
}

const exportRouteData = () => {
  const blob = new Blob([JSON.stringify(routeInfo.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `uav_route_${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('航路数据已导出')
}

const onReloadPlotsEvent = (evt: Event) => {
  loadRouteInfo()
  const detail = (evt as CustomEvent)?.detail || {}
  const mid = Number(detail.missionId || 0)
  if (mid > 0) plotMissionId.value = mid
  else syncMissionFromRoute()
  void loadPlots()
}

const onStorageChange = (e: StorageEvent) => {
  if (e.key !== 'uav_route_data') return
  loadRouteInfo()
  void loadPlots()
}

watch(plotMissionId, () => {
  void loadPlots()
})

onMounted(async () => {
  loadRouteInfo()
  const cache = loadTripleFromStorage()
  if (!plotMissionId.value && cache?.missionId) {
    plotMissionId.value = Number(cache.missionId)
  }
  await loadPlots()
  window.addEventListener('uav-reload-rl-plots', onReloadPlotsEvent)
  window.addEventListener('storage', onStorageChange)
})

onUnmounted(() => {
  window.removeEventListener('uav-reload-rl-plots', onReloadPlotsEvent)
  window.removeEventListener('storage', onStorageChange)
})
</script>

<template>
  <div class="app-container route-info-page">
    <div class="ri-page__bg" aria-hidden="true" />
    <div class="ri-page__decor" aria-hidden="true">
      <svg class="ri-page__lines" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <path class="ri-line" d="M-20 180 Q 320 120, 580 240 T 1100 160" />
        <path class="ri-line" d="M180 880 Q 460 640, 720 760 T 1300 520" />
      </svg>
    </div>

    <header class="ri-page-header">
      <div>
        <h1 class="ri-page-header__title">路径信息</h1>
        <p class="ri-page-header__sub">分层展示 · 路径对比 / RL 核心 / 离线深度分析</p>
        <div class="ri-header-toolbar">
          <el-select
            v-model="plotMissionId"
            size="small"
            filterable
            clearable
            placeholder="离线 Mission（可选）"
          >
            <el-option v-for="m in PY_MISSION_OPTIONS" :key="m.id" :label="m.label" :value="m.id" />
          </el-select>
          <span v-if="routeInfo.uavModel" class="ri-meta-chip">{{ routeInfo.uavModel }}</span>
          <span v-if="routeInfo.pathType" class="ri-meta-chip">{{ routeInfo.pathType }}</span>
          <span class="ri-meta-chip" :class="{ 'is-warn': displayMode === 'empty' }">
            {{ missionLabel }}
          </span>
          <span v-if="displayMode === 'session'" class="ri-meta-chip is-session">会话级</span>
        </div>
      </div>
      <div class="ri-page-header__actions">
        <el-button class="ri-btn-ghost" size="small" :icon="RefreshRight" :loading="loading" @click="loadPlots">
          刷新图表
        </el-button>
        <el-button
          class="ri-btn-ghost"
          size="small"
          :icon="Picture"
          :loading="regenerating"
          :disabled="!hasMatchedMission"
          @click="regenerateAndReload"
        >
          重生成离线图
        </el-button>
        <el-button type="primary" class="ri-btn-primary" size="small" :icon="Download" @click="exportRouteData">
          导出航路
        </el-button>
      </div>
    </header>

    <el-alert v-if="errorText" type="warning" :title="errorText" :closable="false" show-icon />
    <el-alert v-else type="info" :title="missionHint" :closable="false" show-icon />

    <div class="ri-kpi-strip">
      <div class="ri-kpi">
        <span class="ri-kpi__label">总航程</span>
        <span class="ri-kpi__value">{{ stats.distanceKm }} km</span>
      </div>
      <div class="ri-kpi">
        <span class="ri-kpi__label">预计时间</span>
        <span class="ri-kpi__value">{{ stats.etaSec }} s</span>
      </div>
      <div class="ri-kpi">
        <span class="ri-kpi__label">路径点数</span>
        <span class="ri-kpi__value">{{ stats.points }}</span>
      </div>
      <div class="ri-kpi">
        <span class="ri-kpi__label">当前算法</span>
        <span class="ri-kpi__value is-compact">{{ stats.algo }}</span>
      </div>
    </div>

    <!-- RL 核心（优先展示） -->
    <div class="ri-panel ri-panel--highlight" v-loading="loading">
      <div class="ri-panel__title">
        <span>强化学习核心图表</span>
        <span class="ri-tier-badge ri-tier-badge--rl">必选</span>
      </div>
      <p class="ri-panel__hint">Q 表离线/在线训练收敛曲线（reward、步数、成功率）</p>
      <div class="ri-plot-grid ri-plot-grid--core">
        <div v-for="p in rlCorePlots" :key="p.id" class="ri-plot-card">
          <div class="ri-plot-card__head">
            {{ p.title }}
            <span v-if="p.note" class="ri-plot-card__tag">{{ p.note }}</span>
          </div>
          <div class="ri-plot-card__body">
            <img
              v-if="p.src"
              :src="p.src"
              class="ri-plot-img is-clickable"
              :alt="p.title"
              @click="openPreview(p.title, p.src)"
            />
            <div v-else class="ri-plot-empty">
              暂无 training_progress.png，请先执行任务 Q 表训练或重生成图表
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 路径级对比（会话） -->
    <div class="ri-panel" v-loading="loading">
      <div class="ri-panel__title">
        <span>路径级算法对比</span>
        <span class="ri-tier-badge">会话级 · 无需 Q 表</span>
      </div>
      <p class="ri-panel__hint">基于当前任务三算法结果实时生成，切换任务后自动更新</p>
      <div v-if="pathLevelPlots.length" class="ri-plot-grid">
        <div v-for="p in pathLevelPlots" :key="p.id" class="ri-plot-card">
          <div class="ri-plot-card__head">{{ p.title }}</div>
          <div class="ri-plot-card__body">
            <img
              :src="p.src"
              class="ri-plot-img is-clickable"
              :alt="p.title"
              @click="openPreview(p.title, p.src)"
            />
          </div>
        </div>
      </div>
      <div v-else class="ri-plot-empty ri-plot-empty--block">
        暂无路径级对比图。请在路径规划页执行「三算法对比」后刷新本页。
      </div>
    </div>

    <!-- 离线深度分析 -->
    <div class="ri-panel" v-loading="loading">
      <div class="ri-panel__title">
        <span>离线 Q 表深度分析</span>
        <span class="ri-tier-badge ri-tier-badge--offline">{{ plotTaskKey ? '任务 Q 表' : '需 Mission 1–4' }}</span>
      </div>
      <p class="ri-panel__hint">状态价值热力图、策略箭头等（任务 Q 表或 Mission 1–4 离线 Q 表）</p>
      <div v-if="offlinePlots.length && (hasMatchedMission || plotTaskKey)" class="ri-plot-grid">
        <div v-for="p in offlinePlots" :key="p.id" class="ri-plot-card">
          <div class="ri-plot-card__head">{{ p.title }}</div>
          <div class="ri-plot-card__body">
            <img
              v-if="p.src"
              :src="p.src"
              class="ri-plot-img is-clickable"
              :alt="p.title"
              @click="openPreview(p.title, p.src)"
            />
            <div v-else class="ri-plot-empty">暂无 {{ p.title }}</div>
          </div>
        </div>
      </div>
      <div v-else class="ri-plot-empty ri-plot-empty--block">
        未匹配离线 Mission 或 Q 表未训练。可选择页头 Mission 下拉框查看已有 mission 的深度分析图。
      </div>
    </div>

    <el-dialog
      v-model="previewVisible"
      :title="preview?.title || '图表预览'"
      width="92%"
      top="4vh"
      class="plot-preview-dialog"
      destroy-on-close
    >
      <div class="plot-preview-body">
        <img v-if="preview?.src" :src="preview.src" class="plot-preview-full" :alt="preview?.title" />
      </div>
    </el-dialog>
  </div>
</template>
