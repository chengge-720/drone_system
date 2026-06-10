<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { RefreshRight, Position } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import {
  loadTripleFromStorage,
  recommendTripleAlgorithm,
  buildCumulativeDistanceSeries,
  buildDashboardAlgoCards,
  ROUTE_STORAGE_KEY,
  type TripleAlgoRow,
  type TripleRecommendation,
  type TripleStoragePack
} from '@/utils/tripleAlgoAnalysis'
import {
  clearDashboardComparePaths,
  drawDashboardComparePaths
} from '@/utils/algorithmCompareMapVisual'
import { createSatelliteMap, safeFitMapView } from '@/utils/mapInitializer'
import { normalizeGeoPathPoints } from '@/utils/geoPathNormalize'
import '@/assets/styles/algorithmCompare.css'

const router = useRouter()
const tripleRows = ref<TripleAlgoRow[]>([])
const packMeta = ref<Omit<TripleStoragePack, 'tripleAlgoResults'>>({
  pathType: '',
  missionId: 0,
  uavModel: ''
})
const recommendation = ref<TripleRecommendation | null>(null)
const filterAlgorithm = ref('全部')

const mapContainer = ref<HTMLElement | null>(null)
const map = ref<any>(null)
const lineRef = ref<HTMLElement | null>(null)
let lineChart: echarts.ECharts | null = null

const hasData = computed(() => tripleRows.value.length > 0)

const algorithmFilterOptions = computed(() => [
  { label: '全部算法', value: '全部' },
  ...tripleRows.value.map((r) => ({ label: r.algorithm, value: r.algorithm }))
])

const dashboardCards = computed(() =>
  buildDashboardAlgoCards(tripleRows.value, packMeta.value.uavMaxFlightTime)
)

const filteredRows = computed(() => {
  if (filterAlgorithm.value === '全部') return tripleRows.value
  return tripleRows.value.filter((r) => r.algorithm === filterAlgorithm.value)
})

const savedAtText = computed(() => {
  const ts = packMeta.value.savedAt
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
})

const minDistance = computed(() => {
  if (!tripleRows.value.length) return 0
  return Math.min(...tripleRows.value.map((r) => r.totalDistance || 0))
})

const recommendedCard = computed(() => {
  if (!recommendation.value) return null
  return dashboardCards.value.find((c) => c.algorithm === recommendation.value?.algorithm) || null
})

const formatDuration = (sec: number) => {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m} 分 ${r} 秒` : `${r} 秒`
}

const loadData = () => {
  const pack = loadTripleFromStorage()
  if (!pack) {
    tripleRows.value = []
    recommendation.value = null
    packMeta.value = { pathType: '', missionId: 0, uavModel: '' }
    return false
  }
  tripleRows.value = pack.tripleAlgoResults
  packMeta.value = {
    pathType: pack.pathType,
    missionId: pack.missionId,
    uavModel: pack.uavModel,
    uavMaxFlightTime: pack.uavMaxFlightTime,
    cruiseAltitudeM: pack.cruiseAltitudeM,
    startPoint: pack.startPoint,
    endPoint: pack.endPoint,
    savedAt: pack.savedAt
  }
  recommendation.value = recommendTripleAlgorithm(pack.tripleAlgoResults, pack.pathType)
  return true
}

const getAllPathPoints = () =>
  tripleRows.value.flatMap((r) => normalizeGeoPathPoints(r.pathPoints || []))

const ensureMap = async () => {
  await nextTick()
  if (!mapContainer.value) return false
  if (!map.value) {
    map.value = createSatelliteMap(mapContainer.value)
    if (!map.value) return false
  }
  map.value?.resize?.()
  return true
}

const initMap = async () => {
  const ready = await ensureMap()
  if (!ready) return
  setTimeout(() => {
    map.value?.resize?.()
    renderMapPaths()
  }, 120)
}

const renderMapPaths = async () => {
  if (!tripleRows.value.length) return
  const ready = await ensureMap()
  if (!ready || !map.value) return

  const visible =
    filterAlgorithm.value === '全部'
      ? tripleRows.value.map((r) => r.algorithm)
      : [filterAlgorithm.value]
  const overlays = drawDashboardComparePaths(map.value, tripleRows.value, {
    visibleAlgorithms: visible
  })
  safeFitMapView(map.value, overlays, getAllPathPoints())
  map.value?.resize?.()
}

const renderLine = () => {
  if (!lineRef.value || !filteredRows.value.length) return
  if (!lineChart) lineChart = echarts.init(lineRef.value)

  const seriesList = buildCumulativeDistanceSeries(filteredRows.value)
  const maxLen = Math.max(...seriesList.map((s) => s.distances.length), 0)

  lineChart.setOption({
    animationDuration: 600,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e2e8f0',
      textStyle: { color: '#334155', fontSize: 11 },
      formatter: (params: any) => {
        const lines = params.map(
          (p: any) => `<span style="color:${p.color}">●</span> ${p.seriesName}: ${Number(p.value).toFixed(0)} m`
        )
        return `航点 #${params[0]?.dataIndex ?? 0}<br/>${lines.join('<br/>')}`
      }
    },
    legend: {
      top: 0,
      itemWidth: 12,
      itemHeight: 3,
      textStyle: { color: '#64748b', fontSize: 10 }
    },
    grid: { left: 42, right: 12, top: 32, bottom: 28 },
    xAxis: {
      type: 'category',
      name: '点序',
      nameTextStyle: { color: '#94a3b8', fontSize: 10 },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      data: Array.from({ length: maxLen }, (_, i) => i)
    },
    yAxis: {
      type: 'value',
      name: 'm',
      nameTextStyle: { color: '#94a3b8', fontSize: 10 },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(226,232,240,0.95)', type: 'dashed' } }
    },
    series: seriesList.map((s) => ({
      name: s.algorithm,
      type: 'line',
      smooth: false,
      showSymbol: false,
      lineStyle: { width: 2, color: s.color },
      itemStyle: { color: s.color },
      data: s.distances
    }))
  })
}

const renderAll = async () => {
  renderLine()
  renderMapPaths()
}

const refresh = async () => {
  if (!loadData()) {
    ElMessage.warning('请先在路径规划页执行三算法对比')
    return
  }
  await nextTick()
  await ensureMap()
  requestAnimationFrame(() => {
    renderAll()
  })
  ElMessage.success('数据已刷新')
}

const goPlanning = () => {
  router.push({ path: '/uavNavigation/pathPlanning' }).catch(() => {})
}

const handleResize = () => {
  lineChart?.resize()
  map.value?.resize?.()
}

const handleStorage = (e: StorageEvent) => {
  if (e.key !== ROUTE_STORAGE_KEY) return
  loadData()
  nextTick(async () => {
    await ensureMap()
    requestAnimationFrame(renderAll)
  })
}

watch(filterAlgorithm, () => {
  renderAll()
})

onMounted(async () => {
  if (loadData()) {
    await nextTick()
    await initMap()
    await nextTick()
    requestAnimationFrame(renderAll)
  }
  window.addEventListener('resize', handleResize)
  window.addEventListener('storage', handleStorage)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('storage', handleStorage)
  clearDashboardComparePaths()
  try {
    map.value?.destroy?.()
  } catch {}
  lineChart?.dispose()
  map.value = null
})
</script>

<template>
  <div class="algorithm-compare-page">
    <div class="ac-page__bg" aria-hidden="true" />
    <div class="ac-page__decor" aria-hidden="true">
      <svg class="ac-page__lines" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <path class="ac-line" d="M-20 180 Q 320 120, 580 240 T 1100 160" />
        <path class="ac-line" d="M180 880 Q 460 640, 720 760 T 1300 520" />
      </svg>
    </div>

    <header class="ac-page-header">
      <div>
        <h1 class="ac-page-header__title">算法对比看板</h1>
        <p class="ac-page-header__sub">RL · A* · 遗传算法 · 路径指标与电量预估</p>
        <div class="ac-header-toolbar">
          <el-select v-model="filterAlgorithm" size="small" :disabled="!hasData">
            <el-option
              v-for="opt in algorithmFilterOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <span v-if="packMeta.pathType" class="ac-meta-chip">{{ packMeta.pathType }}</span>
          <span v-if="packMeta.uavModel" class="ac-meta-chip">{{ packMeta.uavModel }}</span>
          <span v-if="packMeta.savedAt" class="ac-meta-chip">对比 {{ savedAtText }}</span>
        </div>
      </div>
      <div class="ac-page-header__actions">
        <el-button class="ac-btn-ghost" :icon="RefreshRight" @click="refresh">刷新</el-button>
        <el-button type="primary" class="ac-btn-primary" :icon="Position" @click="goPlanning">
          返回规划
        </el-button>
      </div>
    </header>

    <div v-if="!hasData" class="ac-panel ac-empty">
      <p>暂无三算法对比数据，请先在路径规划页执行「三算法对比（离线Q表）」。</p>
      <el-button type="primary" class="ac-btn-primary" @click="goPlanning">去路径规划页</el-button>
    </div>

    <template v-else>
      <div class="ac-kpi-strip">
        <div class="ac-kpi">
          <span class="ac-kpi__label">推荐算法</span>
          <span class="ac-kpi__value">{{ recommendation?.algorithm || '—' }}</span>
        </div>
        <div class="ac-kpi">
          <span class="ac-kpi__label">最短航程</span>
          <span class="ac-kpi__value">{{ minDistance }} m</span>
        </div>
        <div class="ac-kpi">
          <span class="ac-kpi__label">推荐路径耗电</span>
          <span class="ac-kpi__value">
            {{ recommendedCard ? `${recommendedCard.powerPercent}%` : '—' }}
          </span>
        </div>
        <div class="ac-kpi">
          <span class="ac-kpi__label">无人机续航</span>
          <span class="ac-kpi__value">
            {{ packMeta.uavMaxFlightTime ? `${packMeta.uavMaxFlightTime} min` : '未配置' }}
          </span>
        </div>
      </div>

      <div class="ac-dashboard">
        <aside class="ac-algo-col">
          <div
            v-for="card in dashboardCards"
            :key="card.algorithm"
            class="ac-algo-card"
            :class="{ 'is-recommended': recommendation?.algorithm === card.algorithm }"
          >
            <div class="ac-algo-card__head">
              <div class="ac-algo-card__name">
                <span class="ac-algo-card__dot" :style="{ background: card.color }" />
                {{ card.algorithm }}
              </div>
              <span v-if="recommendation?.algorithm === card.algorithm" class="ac-algo-card__badge">
                推荐
              </span>
            </div>

            <div class="ac-metric-bar">
              <div class="ac-metric-bar__head">
                <span>航程</span>
                <strong>{{ card.totalDistance }} m</strong>
              </div>
              <div class="ac-metric-bar__track">
                <div
                  class="ac-metric-bar__fill"
                  :style="{ width: `${card.distancePct}%`, background: card.color }"
                />
              </div>
            </div>

            <div class="ac-metric-bar">
              <div class="ac-metric-bar__head">
                <span>预计耗时</span>
                <strong>{{ formatDuration(card.estimatedTime) }}</strong>
              </div>
              <div class="ac-metric-bar__track">
                <div
                  class="ac-metric-bar__fill"
                  :style="{ width: `${card.timePct}%`, background: card.color }"
                />
              </div>
            </div>

            <div class="ac-metric-bar">
              <div class="ac-metric-bar__head">
                <span>航点数</span>
                <strong>{{ card.pointCount }}</strong>
              </div>
              <div class="ac-metric-bar__track">
                <div
                  class="ac-metric-bar__fill"
                  :style="{ width: `${card.pointsPct}%`, background: card.color }"
                />
              </div>
            </div>

            <div class="ac-metric-bar">
              <div class="ac-metric-bar__head">
                <span>预计耗电</span>
                <strong>
                  {{
                    packMeta.uavMaxFlightTime
                      ? `${card.powerPercent}% · 剩 ${card.remainMinutes ?? '—'} min`
                      : '需配置续航'
                  }}
                </strong>
              </div>
              <div class="ac-metric-bar__track">
                <div
                  class="ac-metric-bar__fill"
                  :style="{
                    width: `${packMeta.uavMaxFlightTime ? card.powerPercent : 0}%`,
                    background: 'linear-gradient(90deg, #94a3b8, #3b82f6)'
                  }"
                />
              </div>
            </div>
          </div>
        </aside>

        <div class="ac-panel ac-map-col">
          <div class="ac-panel__title">
            <span>三算法路线叠加</span>
            <span class="ac-panel__meta">
              {{ packMeta.startPoint || '起点' }} → {{ packMeta.endPoint || '终点' }}
            </span>
          </div>
          <div ref="mapContainer" class="ac-map" />
          <div class="ac-map-legend">
            <span v-for="card in dashboardCards" :key="card.algorithm" class="ac-map-legend__item">
              <span class="ac-map-legend__dot" :style="{ background: card.color }" />
              {{ card.algorithm }}
            </span>
          </div>
        </div>

        <aside class="ac-side-col">
          <div class="ac-panel">
            <div class="ac-panel__title">
              <span>累计距离</span>
              <span class="ac-panel__meta">折线 · 米</span>
            </div>
            <div ref="lineRef" class="ac-line-chart" />
          </div>

          <div v-if="recommendation" class="ac-panel ac-recommend">
            <div class="ac-panel__title">综合推荐</div>
            <div class="ac-recommend__algo">{{ recommendation.algorithm }}</div>
            <p class="ac-recommend__score">综合得分 {{ recommendation.score }} / 100</p>
            <ul class="ac-recommend__reasons">
              <li v-for="(r, i) in recommendation.reasons" :key="i">{{ r }}</li>
            </ul>
            <div v-if="recommendedCard" class="ac-recommend__power">
              预计消耗电量
              <strong>{{ recommendedCard.powerPercent }}%</strong>
              · 剩余续航约
              <strong>{{ recommendedCard.remainMinutes ?? '—' }} min</strong>
            </div>
          </div>
        </aside>
      </div>

      <div class="ac-panel ac-table-wrap">
        <div class="ac-panel__title">对比明细</div>
        <el-table :data="dashboardCards" stripe>
          <el-table-column prop="algorithm" label="算法" width="108">
            <template #default="{ row }">
              <span class="ac-algo-card__dot" :style="{ background: row.color, display: 'inline-block', marginRight: '6px' }" />
              {{ row.algorithm }}
            </template>
          </el-table-column>
          <el-table-column prop="totalDistance" label="距离(m)" width="96" />
          <el-table-column label="耗时" width="108">
            <template #default="{ row }">{{ formatDuration(row.estimatedTime) }}</template>
          </el-table-column>
          <el-table-column prop="pointCount" label="点数" width="72" />
          <el-table-column label="预计耗电" width="120">
            <template #default="{ row }">
              <div class="ac-power-cell">
                <span>{{ packMeta.uavMaxFlightTime ? `${row.powerPercent}%` : '—' }}</span>
                <div v-if="packMeta.uavMaxFlightTime" class="ac-power-cell__bar">
                  <div class="ac-power-cell__fill" :style="{ width: `${row.powerPercent}%` }" />
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="剩余续航" width="96">
            <template #default="{ row }">
              {{ packMeta.uavMaxFlightTime && row.remainMinutes != null ? `${row.remainMinutes} min` : '—' }}
            </template>
          </el-table-column>
          <el-table-column prop="computationTime" label="计算(ms)" width="96">
            <template #default="{ row }">{{ row.computationTime ?? '—' }}</template>
          </el-table-column>
          <el-table-column prop="note" label="说明" min-width="180" show-overflow-tooltip />
        </el-table>
      </div>
    </template>
  </div>
</template>
