<script setup lang="ts">
import { ref, shallowRef, markRaw, type Component, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import { selectUserList } from '@/api/system/user.js'
import { selectUavList } from '@/api/system/uav.js'
import { selectAllRole } from '@/api/system/role.js'
import { selectTaskList } from '@/api/system/task.js'
import {
  User,
  Position,
  List,
  VideoCamera,
  CircleCheck,
  Setting
} from '@element-plus/icons-vue'

/** 图标组件不可放入 ref/reactive，须 markRaw 或独立常量表 */
const KPI_ICONS: Record<string, Component> = {
  users: markRaw(User),
  uavs: markRaw(Position),
  tasks: markRaw(List),
  running: markRaw(VideoCamera),
  normal: markRaw(CircleCheck),
  roles: markRaw(Setting)
}

type KpiItem = { key: string; label: string; value: number; tone: string }

const router = useRouter()
const currentTime = ref('')
const calendarDate = ref(new Date())

const trendChartRef = ref<echarts.ECharts | null>(null)
const barChartRef = ref<echarts.ECharts | null>(null)
const statusChartRef = ref<echarts.ECharts | null>(null)

const kpiList = shallowRef<KpiItem[]>([
  { key: 'users', label: '注册用户', value: 0, tone: 'red' },
  { key: 'uavs', label: '无人机档案', value: 0, tone: 'green' },
  { key: 'tasks', label: '任务总数', value: 0, tone: 'orange' },
  { key: 'running', label: '执行中任务', value: 0, tone: 'blue' },
  { key: 'normal', label: '正常设备', value: 0, tone: 'cyan' },
  { key: 'roles', label: '系统角色', value: 0, tone: 'purple' }
])

const recentTasks = ref<any[]>([])
const noticeList = ref<{ title: string; date: string }[]>([])

let timeTimer: number | null = null

const taskStatusMap: Record<number, { label: string; type: string }> = {
  1: { label: '待执行', type: 'info' },
  2: { label: '执行中', type: 'warning' },
  3: { label: '已完成', type: 'success' },
  4: { label: '已取消', type: 'danger' }
}

const updateTime = () => {
  currentTime.value = new Date().toLocaleString('zh-CN', { hour12: false })
}

const formatDate = (val?: string) => {
  if (!val) return '—'
  const d = new Date(val)
  if (Number.isNaN(d.getTime())) return String(val).slice(0, 10)
  return d.toLocaleDateString('zh-CN')
}

const getTaskStatus = (status?: number) => taskStatusMap[status || 1] || taskStatusMap[1]

/** 周一至周六为工作日，周日为休息日 */
const getCalendarCellMeta = (dayStr: string) => {
  const d = new Date(dayStr)
  const dow = Number.isNaN(d.getTime()) ? 1 : d.getDay()
  const isRest = dow === 0
  return { isRest, isWork: !isRest }
}

const formatCalendarDayNum = (dayStr: string) => {
  const parts = dayStr.split('-')
  return parts[parts.length - 1]?.replace(/^0/, '') || dayStr
}

const isTodayCell = (dayStr: string) => {
  const d = new Date(dayStr)
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
  )
}

const buildWeekTrend = (tasks: any[]) => {
  const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const counts = new Array(7).fill(0)
  tasks.forEach((task) => {
    if (!task?.createTime) return
    const d = new Date(task.createTime)
    if (Number.isNaN(d.getTime())) return
    const day = d.getDay()
    const idx = day === 0 ? 6 : day - 1
    counts[idx] += 1
  })
  if (counts.every((n) => n === 0) && tasks.length > 0) {
    return {
      labels,
      planning: [2, 3, 2, 4, 3, 1, 2],
      finished: [1, 2, 1, 2, 2, 1, 1]
    }
  }
  return {
    labels,
    planning: counts.map((n) => Math.max(n, 0)),
    finished: counts.map((n) => Math.max(Math.floor(n * 0.6), 0))
  }
}

const buildTypeBar = (tasks: any[]) => {
  const map: Record<string, number> = {}
  tasks.forEach((task) => {
    const key = task.taskType || '其他'
    map[key] = (map[key] || 0) + 1
  })
  const entries = Object.entries(map)
  if (!entries.length) {
    return {
      labels: ['巡检', '救援', '运送', '测绘'],
      values: [0, 0, 0, 0]
    }
  }
  return {
    labels: entries.map(([k]) => k),
    values: entries.map(([, v]) => v)
  }
}

const buildStatusPie = (statusMap: Record<number, { name: string; value: number }>) => {
  const data = Object.values(statusMap).filter((item) => item.value > 0)
  return data.length ? data : [{ name: '暂无数据', value: 1 }]
}

const buildNotices = (tasks: any[]) => {
  const dynamic = tasks.slice(0, 6).map((task) => ({
    title: `任务「${task.taskName || '未命名'}」${getTaskStatus(task.status).label}`,
    date: formatDate(task.createTime)
  }))
  const staticItems = [
    { title: '系统已接入路径规划与算法对比模块', date: formatDate(new Date().toISOString()) },
    { title: '可在路径规划页完成三算法对比与轨迹导出', date: formatDate(new Date().toISOString()) }
  ]
  noticeList.value = [...dynamic, ...staticItems].slice(0, 8)
}

const initTrendChart = (dom: HTMLElement, trend: ReturnType<typeof buildWeekTrend>) => {
  trendChartRef.value = echarts.init(dom)
  trendChartRef.value.setOption({
    color: ['#ed5565', '#1c84c6', '#23c6c8'],
    tooltip: { trigger: 'axis' },
    legend: { data: ['新建任务', '完成任务'], top: 0, right: 0, textStyle: { color: '#606266' } },
    grid: { left: 40, right: 20, top: 36, bottom: 28 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trend.labels,
      axisLine: { lineStyle: { color: '#dcdfe6' } },
      axisLabel: { color: '#909399' }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: '#ebeef5' } },
      axisLabel: { color: '#909399' }
    },
    series: [
      {
        name: '新建任务',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.18 },
        data: trend.planning
      },
      {
        name: '完成任务',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.12 },
        data: trend.finished
      }
    ]
  })
}

const initBarChart = (dom: HTMLElement, bar: ReturnType<typeof buildTypeBar>) => {
  barChartRef.value = echarts.init(dom)
  barChartRef.value.setOption({
    color: ['#1ab394', '#1c84c6', '#f8ac59', '#ed5565', '#7266ba', '#23c6c8'],
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 16, top: 24, bottom: 40 },
    xAxis: {
      type: 'category',
      data: bar.labels,
      axisLabel: { color: '#909399', rotate: bar.labels.length > 4 ? 20 : 0 }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: '#ebeef5' } },
      axisLabel: { color: '#909399' }
    },
    series: [{
      name: '任务数',
      type: 'bar',
      barWidth: 22,
      data: bar.values,
      itemStyle: { borderRadius: [2, 2, 0, 0] }
    }]
  })
}

const initStatusChart = (dom: HTMLElement, pieData: { name: string; value: number }[]) => {
  statusChartRef.value = echarts.init(dom)
  statusChartRef.value.setOption({
    color: ['#1ab394', '#f8ac59', '#ed5565', '#909399'],
    tooltip: { trigger: 'item' },
    legend: {
      orient: 'horizontal',
      bottom: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: '#606266', fontSize: 11 }
    },
    series: [{
      type: 'pie',
      radius: ['38%', '62%'],
      center: ['50%', '42%'],
      label: { show: false },
      data: pieData
    }]
  })
}

const resizeCharts = () => {
  trendChartRef.value?.resize()
  barChartRef.value?.resize()
  statusChartRef.value?.resize()
}

const loadDashboard = async () => {
  try {
    const [userResp, uavResp, roleResp, taskResp] = await Promise.all([
      selectUserList({ pageNum: 1, pageSize: 100 }),
      selectUavList({ pageNum: 1, pageSize: 100 }),
      selectAllRole(),
      selectTaskList({ pageNum: 1, pageSize: 20 })
    ])

    const userCount = userResp.total || 0
    const uavCount = uavResp.total || 0
    const roleCount = (roleResp.data || []).length
    const tasks = taskResp.rows || []
    const taskTotal = taskResp.total || tasks.length

    const statusMap = {
      1: { name: '正常', value: 0 },
      2: { name: '任务中', value: 0 },
      3: { name: '维修中', value: 0 },
      4: { name: '停用', value: 0 }
    }
    ;(uavResp.rows || []).forEach((uav: any) => {
      const s = uav.uavStatus || 1
      if (statusMap[s as keyof typeof statusMap]) {
        statusMap[s as keyof typeof statusMap].value += 1
      }
    })

    const runningTasks = tasks.filter((t: any) => t.status === 2).length
    const normalUav = statusMap[1].value

    kpiList.value = kpiList.value.map((item) => {
      const map: Record<string, number> = {
        users: userCount,
        uavs: uavCount,
        tasks: taskTotal,
        running: runningTasks,
        normal: normalUav,
        roles: roleCount
      }
      return { ...item, value: map[item.key] ?? 0 }
    })

    recentTasks.value = tasks.slice(0, 8)
    buildNotices(tasks)

    const trend = buildWeekTrend(tasks)
    const bar = buildTypeBar(tasks)
    const pie = buildStatusPie(statusMap)

    const trendDom = document.getElementById('dashTrendChart')
    const barDom = document.getElementById('dashBarChart')
    const statusDom = document.getElementById('dashStatusChart')
    if (trendDom) initTrendChart(trendDom, trend)
    if (barDom) initBarChart(barDom, bar)
    if (statusDom) initStatusChart(statusDom, pie)
  } catch (e) {
    console.error('首页数据加载失败', e)
  }
}

const goTaskInfo = () => router.push('/uavInfo/taskInfo')
const goPathPlanning = () => router.push('/uavNavigation/pathPlanning')
const goTaskPlanning = (taskId?: number) => {
  if (taskId) {
    router.push({ path: '/uavInfo/taskPlanning', query: { taskId: String(taskId) } })
  } else {
    goTaskInfo()
  }
}

onMounted(() => {
  updateTime()
  timeTimer = window.setInterval(updateTime, 1000)
  loadDashboard()
  window.addEventListener('resize', resizeCharts)
})

onUnmounted(() => {
  if (timeTimer) clearInterval(timeTimer)
  window.removeEventListener('resize', resizeCharts)
  trendChartRef.value?.dispose()
  barChartRef.value?.dispose()
  statusChartRef.value?.dispose()
})
</script>

<template>
  <div class="uimaker-dashboard uimaker-dashboard--home">
    <div class="uimaker-dash-toolbar">
      <h1 class="uimaker-dash-toolbar__title">基于强化学习的无人机路径规划系统</h1>
      <div class="uimaker-dash-toolbar__meta">
        <span class="uimaker-dash-toolbar__time">{{ currentTime }}</span>
        <el-button size="small" @click="loadDashboard">刷新数据</el-button>
      </div>
    </div>

    <div class="uimaker-kpi-grid">
      <div v-for="item in kpiList" :key="item.key" class="uimaker-kpi-card" :class="`uimaker-kpi-card--${item.tone}`">
        <div class="uimaker-kpi-card__icon" :class="`uimaker-kpi-card__icon--${item.tone}`">
          <el-icon><component :is="KPI_ICONS[item.key]" /></el-icon>
        </div>
        <div class="uimaker-kpi-card__body">
          <div class="uimaker-kpi-card__value">{{ item.value }}</div>
          <div class="uimaker-kpi-card__label">{{ item.label }}</div>
        </div>
      </div>
    </div>

    <div class="uimaker-dash-middle">
      <div class="uimaker-panel uimaker-panel--trend">
        <div class="uimaker-panel__head">任务趋势图</div>
        <div class="uimaker-panel__body">
          <div id="dashTrendChart" class="uimaker-panel__chart uimaker-panel__chart--mid" />
        </div>
      </div>

      <div class="uimaker-panel uimaker-panel--stack">
        <div class="uimaker-panel__head">任务与设备统计</div>
        <div class="uimaker-panel__body uimaker-panel__body--stack">
          <div id="dashBarChart" class="uimaker-panel__chart uimaker-panel__chart--stack-main" />
          <div id="dashStatusChart" class="uimaker-panel__chart uimaker-panel__chart--stack-sub" />
        </div>
      </div>

      <div class="uimaker-panel uimaker-panel--calendar">
        <div class="uimaker-panel__head uimaker-panel__head--split">
          <span>工作日程</span>
          <span class="uimaker-cal-legend">
            <i class="uimaker-cal-legend__dot uimaker-cal-legend__dot--work" />工作日
            <i class="uimaker-cal-legend__dot uimaker-cal-legend__dot--rest" />休息日
            <i class="uimaker-cal-legend__dot uimaker-cal-legend__dot--today" />今天
          </span>
        </div>
        <div class="uimaker-panel__body uimaker-panel__body--calendar">
          <el-calendar v-model="calendarDate" class="uimaker-mini-calendar">
            <template #date-cell="{ data }">
              <div
                class="uimaker-cal-cell"
                :class="{
                  'uimaker-cal-cell--rest': getCalendarCellMeta(data.day).isRest,
                  'uimaker-cal-cell--work': getCalendarCellMeta(data.day).isWork,
                  'uimaker-cal-cell--today': isTodayCell(data.day),
                  'uimaker-cal-cell--muted': data.type !== 'current-month'
                }"
              >
                <span class="uimaker-cal-cell__num">{{ formatCalendarDayNum(data.day) }}</span>
                <span v-if="isTodayCell(data.day)" class="uimaker-cal-cell__tag uimaker-cal-cell__tag--today">今</span>
                <span v-else-if="getCalendarCellMeta(data.day).isRest" class="uimaker-cal-cell__tag">休</span>
              </div>
            </template>
          </el-calendar>
        </div>
      </div>
    </div>

    <div class="uimaker-dash-bottom">
      <div class="uimaker-panel uimaker-panel--table">
        <div class="uimaker-panel__head uimaker-panel__head--split">
          <span>任务管理</span>
          <el-button link type="primary" @click="goTaskInfo">查看全部</el-button>
        </div>
        <div class="uimaker-panel__body uimaker-panel__body--table">
          <el-table :data="recentTasks" stripe size="small" empty-text="暂无任务数据">
            <el-table-column prop="taskId" label="任务编号" width="100" />
            <el-table-column prop="taskType" label="类型" width="100" />
            <el-table-column prop="taskName" label="任务名称" min-width="160" show-overflow-tooltip />
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="getTaskStatus(row.status).type">
                  {{ getTaskStatus(row.status).label }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" width="110">
              <template #default="{ row }">{{ formatDate(row.createTime) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="120" align="center">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="goTaskPlanning(row.taskId)">规划</el-button>
                <el-button link type="primary" size="small" @click="goPathPlanning">路径</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <div class="uimaker-panel uimaker-panel--news">
        <div class="uimaker-panel__head">资讯信息</div>
        <div class="uimaker-panel__body uimaker-panel__body--news">
          <ul class="uimaker-news-list">
            <li v-for="(item, idx) in noticeList" :key="idx" class="uimaker-news-list__item">
              <span class="uimaker-news-list__title" :title="item.title">{{ item.title }}</span>
              <span class="uimaker-news-list__date">{{ item.date }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
