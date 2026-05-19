<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getRlPlot } from '@/api/system/pathPlanning'
import { loadTaskList as apiLoadTaskList } from '@/utils/taskSelector'
import { loadTripleFromStorage } from '@/utils/tripleAlgoAnalysis'
import '@/assets/styles/routeInfo.css'

const MISSION_PLOT_CATALOG = [
  { name: 'path_compare_rl_astar_ga', title: '三算法路径对比图', ext: 'png' },
  { name: 'metrics_bar', title: 'RL / A* / GA 指标柱状对比', ext: 'png' },
  { name: 'path_curvature_compare', title: 'RL / A* / GA 路径曲率对比', ext: 'png' },
  { name: 'path_evolution', title: '路径演化（四阶段）', ext: 'gif' },
  { name: 'state_value_heatmap', title: '状态价值热力图', ext: 'png' },
  { name: 'policy_quiver', title: '策略箭头图', ext: 'png' },
  { name: 'current_trajectory', title: '当前轨迹图', ext: 'png' }
]

const taskList = ref<any[]>([])
const selectedMissionId = ref<number>(0)
const missionPlots = ref<Array<{ name: string; title: string; src: string; ext: string }>>([])
const globalPlots = ref<{ trainingProgress: string }>({
  trainingProgress: ''
})
const loading = ref(false)
const errorText = ref('')

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

const stats = computed(() => {
  const data = routeInfo.value || {}
  const waypoints = Array.isArray(data.waypoints) ? data.waypoints : []
  return {
    distanceKm: (Number(data.totalDistance || 0) / 1000).toFixed(2),
    etaSec: Number(data.estimatedTime || 0),
    points: waypoints.length || Number(data.pointCount || 0),
    algo: data.algorithm || '-'
  }
})

const fetchPlotSafe = async (name: string, missionId = 0, ext = 'png') => {
  try {
    const resp = await getRlPlot(name, missionId, ext)
    if (resp?.code !== 200 || !resp?.data?.dataBase64) return ''
    const mime = resp.data?.mime || (ext === 'gif' ? 'image/gif' : 'image/png')
    return `data:${mime};base64,${resp.data.dataBase64}`
  } catch {
    return ''
  }
}

const loadRouteInfo = () => {
  try {
    const raw = localStorage.getItem('uav_route_data')
    if (raw) {
      routeInfo.value = JSON.parse(raw)
    }
  } catch {}
}

const loadTaskList = async () => {
  try {
    taskList.value = await apiLoadTaskList()
  } catch {
    taskList.value = []
  }
  if (!selectedMissionId.value && taskList.value.length) {
    selectedMissionId.value = Number(taskList.value[0].taskId || 0)
  }
}

const loadPlots = async () => {
  loading.value = true
  errorText.value = ''
  try {
    const mid = Number(selectedMissionId.value || 0)
    const list: Array<{ name: string; title: string; src: string; ext: string }> = []
    for (const p of MISSION_PLOT_CATALOG) {
      const src = await fetchPlotSafe(p.name, mid, p.ext)
      list.push({ ...p, src })
    }
    missionPlots.value = list
    globalPlots.value.trainingProgress = await fetchPlotSafe('training_progress', 0, 'png')
  } catch (e: any) {
    errorText.value = e?.message || '图表加载失败'
  } finally {
    loading.value = false
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

watch(selectedMissionId, () => {
  if (selectedMissionId.value > 0) loadPlots()
})

onMounted(async () => {
  loadRouteInfo()
  const cache = loadTripleFromStorage()
  if (cache?.missionId) selectedMissionId.value = cache.missionId
  await loadTaskList()
  await loadPlots()
})
</script>

<template>
  <div class="route-info-page">
    <div class="hero">
      <div>
        <h1 class="hero-title">路径信息</h1>
        <p style="margin:0;color:#64748b;font-size:13px;">
          Python 算法对比图（按任务 mission 子目录展示，包含 RL / A* / GA）
        </p>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <el-select v-model="selectedMissionId" style="width:220px;" filterable placeholder="选择任务">
          <el-option
            v-for="t in taskList"
            :key="t.taskId"
            :label="`${t.taskName || '任务'} (#${t.taskId})`"
            :value="Number(t.taskId)"
          />
        </el-select>
        <el-button :loading="loading" @click="loadPlots">刷新图表</el-button>
        <el-button type="primary" @click="exportRouteData">导出航路</el-button>
      </div>
    </div>

    <el-alert
      v-if="errorText"
      type="warning"
      :title="errorText"
      :closable="false"
      style="margin-bottom:12px;"
    />

    <div class="glass">
      <div class="stat-row">
        <div class="stat-box">
          <div class="stat-label">总航程</div>
          <div class="stat-val">{{ stats.distanceKm }} km</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">预计时间</div>
          <div class="stat-val">{{ stats.etaSec }} s</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">路径点数</div>
          <div class="stat-val">{{ stats.points }}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">当前算法</div>
          <div class="stat-val" style="font-size:15px;">{{ stats.algo }}</div>
        </div>
      </div>
    </div>

    <div class="glass" v-loading="loading">
      <div style="font-weight:600;margin-bottom:10px;">任务 #{{ selectedMissionId || '-' }} 算法图</div>
      <div class="plot-grid">
        <div v-for="p in missionPlots" :key="p.name" class="plot-card">
          <div class="plot-card-head">{{ p.title }}</div>
          <div class="plot-img-wrap">
            <img v-if="p.src" :src="p.src" class="plot-img" :alt="p.title" />
            <div v-else class="plot-empty">暂无 {{ p.title }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="glass" v-loading="loading">
      <div style="font-weight:600;margin-bottom:10px;">全局图（images）</div>
      <div class="plot-grid">
        <div class="plot-card">
          <div class="plot-card-head">training_progress</div>
          <div class="plot-img-wrap">
            <img v-if="globalPlots.trainingProgress" :src="globalPlots.trainingProgress" class="plot-img" />
            <div v-else class="plot-empty">暂无 training_progress</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>