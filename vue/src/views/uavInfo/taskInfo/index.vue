<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue"
import { useRouter } from 'vue-router'
import { selectTaskList, insertTask, updateTask, deleteTaskByTaskIds, getAvailableUavs, recommendUavs } from '@/api/system/task.js'
import { selectUavList } from '@/api/system/uav.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, Edit, Delete, ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import {
  clearExecutionRecord,
  clearPlanningSession,
  getExecutionRemainSeconds,
  loadExecutionRecord
} from '@/utils/taskExecutionStorage'
import { getDistanceFromLatLonInM, loadNoFlyZones, drawNoFlyZones } from '@/utils/noFlyZoneService.js'
import { getGeoPoint } from '@/utils/mapInitializer'

const router = useRouter()

const goToTaskPlanning = (taskId: number) => {
  router.push({ path: '/uavInfo/taskPlanning', query: { taskId } })
}

// 任务列表数据
const taskList = ref([])
const total = ref(0)
const executionCountdowns = ref<Record<number, number>>({})
let executionCountdownTimer: number | null = null
const query = ref({
  pageNum: 1,
  pageSize: 12,
  taskName: '',
  taskType: ''
})

const activeTab = ref<'pool' | 'history' | 'status'>('pool')
const carouselRef = ref<HTMLElement | null>(null)
const carouselIndex = ref(0)

const filteredTasks = computed(() => {
  const list = taskList.value || []
  if (activeTab.value === 'history') {
    return list.filter((t: any) => t.status === 3)
  }
  if (activeTab.value === 'pool') {
    return list.filter((t: any) => t.status !== 3 && t.status !== 4)
  }
  return list
})

const systemStats = computed(() => {
  const list = taskList.value || []
  return {
    total: list.length,
    pending: list.filter((t: any) => t.status === 1).length,
    running: list.filter((t: any) => t.status === 2).length,
    completed: list.filter((t: any) => t.status === 3).length,
    cancelled: list.filter((t: any) => t.status === 4).length
  }
})

const activeTask = computed(() => {
  const list = filteredTasks.value
  if (!list.length) return null
  return list[carouselIndex.value] ?? list[0]
})

const typeDistribution = computed(() => {
  const source =
    activeTab.value === 'history'
      ? (taskList.value || []).filter((t: any) => t.status === 3)
      : (taskList.value || []).filter((t: any) => t.status !== 3 && t.status !== 4)
  const map: Record<string, number> = {}
  for (const t of source) {
    const key = t.taskType || '其他'
    map[key] = (map[key] || 0) + 1
  }
  const max = Math.max(...Object.values(map), 1)
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count, percent: Math.round((count / max) * 100) }))
})

const runningTasks = computed(() =>
  (taskList.value || []).filter(
    (t: any) => t.status === 2 || Boolean(executionCountdowns.value[t.taskId])
  )
)

const completionRate = computed(() => {
  const { total, completed } = systemStats.value
  if (!total) return 0
  return Math.round((completed / total) * 100)
})

const pageTime = ref('')

const updatePageTime = () => {
  pageTime.value = new Date().toLocaleString('zh-CN', { hour12: false })
}

const estimateWaypoints = (task: any) => {
  const km = Number(task?.maxDistance || 0)
  return Math.max(2, Math.round(km * 4 + 2))
}

const estimatePowerPercent = (task: any) => {
  const km = Number(task?.maxDistance || 0)
  const min = Number(task?.estimatedTime || 0)
  return Math.min(98, Math.round(km * 10 + min * 1.2 + 8))
}

const scrollCarouselTo = (index: number) => {
  const list = filteredTasks.value
  if (!list.length) return
  const next = Math.max(0, Math.min(index, list.length - 1))
  carouselIndex.value = next
  const el = carouselRef.value
  if (!el) return
  const card = el.children[next] as HTMLElement | undefined
  card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
}

const prevCarousel = () => scrollCarouselTo(carouselIndex.value - 1)
const nextCarousel = () => scrollCarouselTo(carouselIndex.value + 1)

const onCarouselScroll = () => {
  const el = carouselRef.value
  if (!el || !el.children.length) return
  const center = el.scrollLeft + el.clientWidth / 2
  let nearest = 0
  let minDist = Infinity
  Array.from(el.children).forEach((child, i) => {
    const node = child as HTMLElement
    const cardCenter = node.offsetLeft + node.offsetWidth / 2
    const dist = Math.abs(cardCenter - center)
    if (dist < minDist) {
      minDist = dist
      nearest = i
    }
  })
  carouselIndex.value = nearest
}

const publishTask = (task: any) => {
  if (isTaskExecuting(task)) {
    ElMessage.warning('任务执行中，请先终止后再操作')
    return
  }
  goToTaskPlanning(task.taskId)
}

watch([filteredTasks, activeTab], () => {
  carouselIndex.value = 0
  nextTick(() => scrollCarouselTo(0))
})

// 任务表单数据
const taskForm = ref({
  taskId: null,
  taskName: '',
  taskType: '',
  startLocation: '',
  endLocation: '',
  description: '',
  uavId: null,
  status: 1, // 1-待执行，2-执行中，3-已完成，4-已取消
  maxDistance: 0, // 最大飞行距离（公里）
  estimatedTime: 0, // 预计飞行时间（分钟）
  requiredLoad: 0, // 所需载重（kg）
  urgency: 1 // 紧急程度：1-普通，2-紧急，3-非常紧急
})

// 任务状态选项
const taskStatusOptions = [
  { label: '待执行', value: 1 },
  { label: '执行中', value: 2 },
  { label: '已完成', value: 3 },
  { label: '已取消', value: 4 }
]

// 任务类型选项
const taskTypeOptions = [
  { label: '救援', value: '救援' },
  { label: '运送', value: '运送' },
  { label: '测绘', value: '测绘' },
  { label: '航拍', value: '航拍' },
  { label: '巡检', value: '巡检' },
  { label: '道路巡检', value: '道路巡检' },
  { label: '水域巡检', value: '水域巡检' },
  { label: '其他', value: '其他' }
]

// 可用无人机列表
const availableUavs = ref([])

// 对话框状态
const taskDialogVisible = ref(false)
const title = ref('发布任务')

// 地图相关
const map = ref(null)
const mapContainer = ref(null)
const startPoint = ref(null)
const endPoint = ref(null)
const pathLine = ref(null)

// 加载任务列表
const getTaskList = async () => {
  try {
    console.log('📋 请求任务列表，参数:', query.value)
    const response = await selectTaskList(query.value)
    console.log('📋 响应数据:', response)
    
    // 关键修复：确保正确获取 rows 数组
    taskList.value = Array.isArray(response.rows) ? response.rows : []
    total.value = response.total || 0
    
    console.log('✅ 任务列表加载完成，数量:', taskList.value.length)
    console.log('📊 taskList 数据:', taskList.value)
    
    // 如果数据存在但不显示，检查是否是响应式问题
    if (taskList.value.length > 0) {
      console.log('🎉 有数据，应该显示卡片了!')
    }
    await refreshExecutionCountdowns()
  } catch (error) {
    console.error('❌ 获取任务列表失败:', error)
    ElMessage.error('获取任务列表失败：' + (error as Error).message)
  }
}

const formatCountdown = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds || 0))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const refreshExecutionCountdowns = async () => {
  const next: Record<number, number> = {}
  let changed = false
  for (const task of taskList.value || []) {
    const remain = getExecutionRemainSeconds(task.taskId)
    const rec = loadExecutionRecord(task.taskId)
    if (!rec) continue
    if (remain > 0) {
      next[task.taskId] = remain
      if (task.status !== 2) {
        task.status = 2
      }
    } else {
      clearExecutionRecord(task.taskId)
      if (task.status === 2) {
        await updateTask({ ...task, status: 3 })
        task.status = 3
        changed = true
      }
    }
  }
  executionCountdowns.value = next
  if (changed) getTaskList()
}

const terminateTask = (row: any) => {
  ElMessageBox.confirm(
    '确定要终止该任务吗？终止后状态将恢复为「待执行」，可重新规划并执行。',
    '终止任务',
    {
      confirmButtonText: '终止',
      cancelButtonText: '取消',
      type: 'warning'
    }
  )
    .then(async () => {
      try {
        clearExecutionRecord(row.taskId)
        clearPlanningSession(row.taskId)
        const resp = await updateTask({ ...row, status: 1 })
        if (resp?.code === 200) {
          ElMessage.success('任务已终止，状态已恢复为待执行')
          const copy = { ...executionCountdowns.value }
          delete copy[row.taskId]
          executionCountdowns.value = copy
          getTaskList()
        } else {
          ElMessage.error(resp?.msg || '终止任务失败')
        }
      } catch (e: any) {
        ElMessage.error(e?.message || '终止任务失败')
      }
    })
    .catch(() => {})
}

const isTaskExecuting = (task: any) =>
  task?.status === 2 || Boolean(executionCountdowns.value[task?.taskId])

// 搜索任务
const searchTask = () => {
  query.value.pageNum = 1
  getTaskList()
}

// 重置搜索
const resetSearch = () => {
  query.value.taskName = ''
  query.value.taskType = ''
  searchTask()
}

// 打开发布任务对话框
const openTaskDialog = () => {
  taskForm.value = {
    taskId: null,
    taskName: '',
    taskType: '',
    startLocation: '',
    endLocation: '',
    description: '无',
    uavId: null,
    maxDistance: 0,
    estimatedTime: 0,
    requiredLoad: 0,
    urgency: 1
  }
  title.value = '发布任务'
  taskDialogVisible.value = true
  // 初始化地图
  setTimeout(() => {
    initMap()
  }, 100)
}

// 初始化地图
const initMap = () => {
  if (typeof AMap !== 'undefined' && mapContainer.value) {
    map.value = new AMap.Map(mapContainer.value, {
      viewMode: '2D',
      center: [115.892151, 28.676493], // 南昌
      zoom: 13,
      resizeEnable: true
    })
    // Scale 在部分 JSAPI 版本里可能不可用/不可 new，做保护避免阻断页面
    try {
      const ScaleCtor = AMap.Scale || AMap.ScaleControl
      if (typeof ScaleCtor === 'function') {
        map.value.addControl(new ScaleCtor())
      }
    } catch {}
    void renderNoFlyZones()
  }
}

const renderNoFlyZones = async () => {
  if (!map.value) return
  try {
    const zones = await loadNoFlyZones()
    drawNoFlyZones(map.value, zones)
  } catch (e) {
    console.warn('禁飞区加载失败:', e)
  }
}

// 搜索地点
const searchLocation = (location, callback) => {
  if (!map.value) return
  getGeoPoint(location, map.value, '南昌市')
    .then((pt) => callback(pt))
    .catch(() => callback(null))
}

// 计算路径并获取可用无人机
const calculatePathAndGetUavs = async () => {
  if (!taskForm.value.startLocation || !taskForm.value.endLocation) {
    ElMessage.warning('请输入起始地点和终点')
    return
  }

  // 清除之前的标记和路径
  clearMapMarkers()

  try {
    // 搜索起点
    await new Promise<void>((resolve, reject) => {
      searchLocation(taskForm.value.startLocation, (startPointObj) => {
        if (startPointObj) {
          startPoint.value = startPointObj
          const startMarker = new AMap.Marker({
            position: [startPointObj.lng, startPointObj.lat],
            map: map.value
          })
          resolve()
        } else {
          reject(new Error('起点地址解析失败'))
        }
      })
    })

    // 搜索终点
    await new Promise<void>((resolve, reject) => {
      searchLocation(taskForm.value.endLocation, (endPointObj) => {
        if (endPointObj) {
          endPoint.value = endPointObj
          const endMarker = new AMap.Marker({
            position: [endPointObj.lng, endPointObj.lat],
            map: map.value
          })
          resolve()
        } else {
          reject(new Error('终点地址解析失败'))
        }
      })
    })

    // 先绘制直线路径（用于快速预览）
    pathLine.value = new AMap.Polyline({
      path: [
        [startPoint.value.lng, startPoint.value.lat],
        [endPoint.value.lng, endPoint.value.lat]
      ],
      strokeColor: '#4D4FC3',
      strokeWeight: 5,
      strokeOpacity: 0.8,
      map: map.value
    })

    // 计算直线距离
    const straightDistance = getDistanceFromLatLonInM(
      startPoint.value.lat,
      startPoint.value.lng,
      endPoint.value.lat,
      endPoint.value.lng
    )
    
    // 方案 2：增加安全系数来估算实际飞行距离
    // 考虑因素：建筑物绕行、禁飞区规避、气象影响、地形障碍等
    const SAFETY_FACTOR = 1.8 // 80% 的额外距离余量
    const actualDistance = straightDistance * SAFETY_FACTOR
    
    // 更新任务表单的距离和时间
    taskForm.value.maxDistance = (actualDistance / 1000).toFixed(2) // 转换为公里
    
    // 假设平均速度 10m/s，估算时间（分钟）- 同样考虑安全系数
    const estimatedTimeSeconds = (actualDistance / 10) * SAFETY_FACTOR
    taskForm.value.estimatedTime = Math.round(estimatedTimeSeconds / 60)

    console.log('📏 直线距离:', (straightDistance / 1000).toFixed(2), 'km')
    console.log('🛡️ 安全系数:', SAFETY_FACTOR)
    console.log('✈️ 预估实际距离:', taskForm.value.maxDistance, 'km')
    console.log('⏱️ 预估时间:', taskForm.value.estimatedTime, 'min')

    // 【新增】尝试调用后端路径规划 API 获取真实路径（简化版预览）
    try {
      await planDetailedPath(startPoint.value, endPoint.value)
    } catch (pathError) {
      console.warn('⚠️ 详细路径规划失败，使用直线距离估算:', pathError)
      // 如果路径规划失败，继续使用直线距离 + 安全系数
    }

    // 调用智能推荐 API 获取最佳匹配无人机
    getBestMatchUavs(actualDistance / 1000)
    
    ElMessage.success('路径计算完成，正在匹配无人机...')
  } catch (error) {
    console.error('❌ 路径计算失败:', error)
    ElMessage.error('路径计算失败：' + (error as Error).message)
  }
}

// 规划真实路径（优先 AMap Driving；不可用时保持直线预览）
const planDetailedPath = async (start, end) => {
  try {
    console.log('🗺️ 开始简化版路径规划（AMap Driving）...')
    if (!map.value || typeof AMap === 'undefined') {
      throw new Error('AMap 未加载，无法规划真实路径')
    }

    const ensureDriving = () =>
      new Promise<void>((r) => {
        if (!AMap || typeof AMap.plugin !== 'function') return r()
        AMap.plugin(['AMap.Driving'], () => r())
      })

    await ensureDriving()
    if (typeof AMap.Driving !== 'function') {
      throw new Error('AMap.Driving 未就绪')
    }

    const driving = new AMap.Driving({ map: null })
    const { coords, distanceM } = await new Promise<any>((resolve, reject) => {
      driving.search([start.lng, start.lat], [end.lng, end.lat], {}, (status, result) => {
        const ok = status === 'complete' || result?.info === 'OK' || result?.info === 'OK.'
        if (!ok) {
          reject(new Error('高德地图路线规划失败'))
          return
        }
        const steps = result.routes?.[0]?.steps || []
        const raw: number[][] = []
        for (const step of steps) {
          const path = step?.path || []
          for (const p of path) {
            const lng = Array.isArray(p) ? p[0] : typeof p?.getLng === 'function' ? p.getLng() : p?.lng
            const lat = Array.isArray(p) ? p[1] : typeof p?.getLat === 'function' ? p.getLat() : p?.lat
            if (lng != null && lat != null && !Number.isNaN(Number(lng)) && !Number.isNaN(Number(lat))) {
              raw.push([Number(lng), Number(lat)])
            }
          }
        }
        const d = Number(result.routes?.[0]?.distance || 0) || 0
        resolve({ coords: raw, distanceM: d })
      })
    })

    if (!Array.isArray(coords) || coords.length < 2) {
      throw new Error('高德地图返回空路径')
    }

    if (pathLine.value) {
      pathLine.value.setMap?.(null)
    }
    pathLine.value = new AMap.Polyline({
      path: coords,
      strokeColor: '#F59E0B',
      strokeWeight: 6,
      strokeOpacity: 0.9,
      map: map.value
    })

    // 使用 Driving 的 distance 更新表单（米）
    if (distanceM > 0) {
      taskForm.value.maxDistance = (distanceM / 1000).toFixed(2)
      const estimatedTimeSeconds = (distanceM / 10) * 1.2
      taskForm.value.estimatedTime = Math.round(estimatedTimeSeconds / 60)
      ElMessage.success(`已获取真实飞行路径（${taskForm.value.maxDistance} km）`)
    }
  } catch (error) {
    console.error('❌ 简化版路径规划失败:', error)
    throw error // 向上抛出错误，让上层继续处理
  }
}

// 获取最佳匹配的无人机（智能推荐）
const getBestMatchUavs = async (distance) => {
  try {
    // 构建任务对象用于智能推荐
    const taskData = {
      taskType: taskForm.value.taskType,
      maxDistance: distance,
      estimatedTime: taskForm.value.estimatedTime,
      requiredLoad: taskForm.value.requiredLoad || 0,
      urgency: taskForm.value.urgency || 1
    }
    
    console.log('🤖 调用智能推荐 API，参数:', taskData)
    
    const response = await recommendUavs(taskData)
    availableUavs.value = response.data || []
    
    if (availableUavs.value.length === 0) {
      ElMessage.warning('没有剩余电量足以覆盖该任务（含110%安全余量）的无人机')
      taskForm.value.uavId = null
    } else {
      ElMessage.success(`智能推荐 ${availableUavs.value.length} 架最合适的无人机`)
      // 自动选择排名第一的无人机
      if (availableUavs.value.length > 0) {
        taskForm.value.uavId = availableUavs.value[0].uavId
        const battery = availableUavs.value[0].uavRemainingBattery ?? 100
        ElMessage.success(`已自动匹配：${availableUavs.value[0].uavModel}（剩余电量 ${battery}%）`)
      }
    }
  } catch (error) {
    console.error('❌ 智能推荐失败:', error)
    availableUavs.value = []
    taskForm.value.uavId = null
    ElMessage.error('无人机匹配失败，请稍后重试')
  }
}

// 获取可用无人机列表
const getAvailableUavList = async (distance) => {
  try {
    const response = await getAvailableUavs({
      taskType: taskForm.value.taskType,
      distance: distance
    })
    availableUavs.value = response.data || []
    if (availableUavs.value.length === 0) {
      ElMessage.info('没有找到符合条件的无人机')
    } else {
      ElMessage.success(`找到 ${availableUavs.value.length} 架符合条件的无人机`)
    }
  } catch (error) {
    console.error('获取可用无人机失败:', error)
    //  fallback: 直接获取所有无人机
    const uavResponse = await selectUavList({ pageNum: 1, pageSize: 100 })
    availableUavs.value = uavResponse.rows || []
  }
}

// 清除地图标记
const clearMapMarkers = () => {
  if (map.value) {
    map.value.clearMap?.()
    void renderNoFlyZones()
    startPoint.value = null
    endPoint.value = null
    pathLine.value = null
  }
}

// 提交任务
const submitTask = async () => {
  if (!taskForm.value.taskName || !taskForm.value.taskType || !taskForm.value.startLocation || !taskForm.value.endLocation || !taskForm.value.uavId) {
    ElMessage.warning('请填写完整任务信息')
    return
  }

  try {
    let response
    if (taskForm.value.taskId) {
      if (isTaskExecuting(taskForm.value)) {
        ElMessage.warning('任务执行中，请先在列表中终止任务后再编辑')
        return
      }
      // 已完成任务重新发布后重置为待执行，并清除本地规划缓存
      if (taskForm.value.status === 3) {
        taskForm.value.status = 1
        clearPlanningSession(taskForm.value.taskId)
        clearExecutionRecord(taskForm.value.taskId)
      }
      response = await updateTask(taskForm.value)
    } else {
      // 新增任务
      response = await insertTask(taskForm.value)
    }
    
    if (response.code === 200) {
      ElMessage.success(taskForm.value.taskId ? '任务修改成功' : '任务发布成功')
      taskDialogVisible.value = false
      getTaskList()
    } else {
      ElMessage.error(taskForm.value.taskId ? '任务修改失败' : '任务发布失败')
    }
  } catch (error) {
    console.error('操作任务失败:', error)
    ElMessage.error('操作任务失败')
  }
}

// 编辑任务
const handleUpdate = (row) => {
  if (isTaskExecuting(row)) {
    ElMessage.warning('任务执行中，请先终止任务后再编辑')
    return
  }
  // 填充表单数据
  taskForm.value = {
    taskId: row.taskId,
    taskName: row.taskName,
    taskType: row.taskType,
    startLocation: row.startLocation,
    endLocation: row.endLocation,
    description: row.description,
    uavId: row.uavId,
    status: row.status || 1,
    maxDistance: row.maxDistance || 0,
    estimatedTime: row.estimatedTime || 0,
    requiredLoad: row.requiredLoad || 0,
    urgency: row.urgency || 1
  }
  title.value = '编辑任务'
  taskDialogVisible.value = true
  // 初始化地图
  setTimeout(() => {
    initMap()
  }, 100)
}

// 删除任务
const handleDelete = (row) => {
  ElMessageBox.confirm(
    '确定要删除该任务吗？',
    '删除确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      const response = await deleteTaskByTaskIds([row.taskId])
      if (response.code === 200) {
        ElMessage.success('任务删除成功')
        getTaskList()
      } else {
        ElMessage.error('任务删除失败')
      }
    } catch (error) {
      console.error('删除任务失败:', error)
      ElMessage.error('任务删除失败')
    }
  }).catch(() => {
    // 取消删除
  })
}

// 组件挂载时加载任务列表
onMounted(() => {
  updatePageTime()
  getTaskList()
  executionCountdownTimer = window.setInterval(refreshExecutionCountdowns, 1000)
  window.setInterval(updatePageTime, 60000)
  window.addEventListener('uav-vector-regions-changed', renderNoFlyZones)
})

onUnmounted(() => {
  window.removeEventListener('uav-vector-regions-changed', renderNoFlyZones)
  if (executionCountdownTimer) {
    window.clearInterval(executionCountdownTimer)
    executionCountdownTimer = null
  }
})

// ========== 辅助函数 ==========
// 获取紧急度样式类
const getUrgencyClass = (urgency: number) => {
  if (urgency === 3) return 'urgency-high'
  if (urgency === 2) return 'urgency-medium'
  return 'urgency-low'
}

// 获取状态类型
const getStatusType = (status: number) => {
  const types: any = { 1: 'success', 2: 'warning', 3: 'info', 4: 'danger' }
  return types[status] || 'info'
}

// 获取状态文本
const getStatusText = (status: number) => {
  const texts: any = { 1: '待执行', 2: '执行中', 3: '已完成', 4: '已取消' }
  return texts[status] || '未知'
}

// 获取任务类型颜色
const getTaskTypeColor = (type: string) => {
  const colors: any = {
    '救援': '#a4ddd4',
    '运送': '#a4ddd4',
    '测绘': '#a4ddd4',
    '航拍': '#a4ddd4',
    '巡检': '#a4ddd4',
    '道路巡检': '#a4ddd4',
    '水域巡检': '#34d399',
    '其他': '#a4ddd4'
  }
  return colors[type] || '#909399'
}

// 获取紧急度类型
const getUrgencyType = (urgency: number) => {
  const types: any = { 1: 'info', 2: 'warning', 3: 'danger' }
  return types[urgency] || 'info'
}

// 获取紧急度文本
const getUrgencyText = (urgency: number) => {
  const texts: any = { 1: '普通', 2: '紧急', 3: '非常紧急' }
  return texts[urgency] || '未知'
}

// 截断文本
const truncateText = (text: string, length: number) => {
  if (!text) return ''
  return text.length > length ? text.substring(0, length) + '...' : text
}

// 格式化日期
const formatDate = (date: string | Date) => {
  if (!date) return ''
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}
</script>
<template>
  <div class="task-pool-page">
    <div class="task-pool-page__bg" aria-hidden="true" />
    <div class="task-pool-page__decor" aria-hidden="true">
      <svg class="task-pool-page__lines" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="task-pool-grad-blue" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#3b82f6" stop-opacity="0" />
            <stop offset="40%" stop-color="#3b82f6" />
            <stop offset="100%" stop-color="#22d3ee" stop-opacity="0.3" />
          </linearGradient>
          <linearGradient id="task-pool-grad-cyan" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.2" />
            <stop offset="50%" stop-color="#06b6d4" />
            <stop offset="100%" stop-color="#34d399" stop-opacity="0.4" />
          </linearGradient>
          <linearGradient id="task-pool-grad-amber" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.3" />
            <stop offset="60%" stop-color="#f59e0b" />
            <stop offset="100%" stop-color="#fb923c" stop-opacity="0.2" />
          </linearGradient>
          <linearGradient id="task-pool-grad-violet" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.15" />
            <stop offset="50%" stop-color="#8b5cf6" />
            <stop offset="100%" stop-color="#6366f1" stop-opacity="0.2" />
          </linearGradient>
          <linearGradient id="task-pool-grad-teal" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#34d399" stop-opacity="0.25" />
            <stop offset="100%" stop-color="#14b8a6" />
          </linearGradient>
        </defs>
        <path class="task-pool-line task-pool-line--1" d="M-40 120 Q 280 80, 520 200 T 980 90" />
        <path class="task-pool-line task-pool-line--2" d="M200 900 Q 420 620, 680 740 T 1200 560" />
        <path class="task-pool-line task-pool-line--3" d="M1100 -20 L 1320 280 L 1480 180" />
        <path class="task-pool-line task-pool-line--4" d="M-60 520 C 180 420, 320 680, 560 580 S 920 480, 1180 620" />
        <path class="task-pool-line task-pool-line--5" d="M820 900 L 960 680 L 1100 820 L 1280 640" />
        <circle class="task-pool-dot task-pool-dot--1" cx="180" cy="140" r="4" />
        <circle class="task-pool-dot task-pool-dot--2" cx="920" cy="320" r="3" />
        <circle class="task-pool-dot task-pool-dot--3" cx="1240" cy="680" r="5" />
      </svg>
    </div>

    <header class="task-pool-nav">
      <div class="task-pool-nav__tabs">
        <button
          type="button"
          class="task-pool-nav__tab"
          :class="{ 'is-active': activeTab === 'pool' }"
          @click="activeTab = 'pool'"
        >
          任务池
        </button>
        <button
          type="button"
          class="task-pool-nav__tab"
          :class="{ 'is-active': activeTab === 'history' }"
          @click="activeTab = 'history'"
        >
          历史记录
        </button>
        <button
          type="button"
          class="task-pool-nav__tab"
          :class="{ 'is-active': activeTab === 'status' }"
          @click="activeTab = 'status'"
        >
          系统状态
        </button>
      </div>

      <div class="task-pool-nav__tools">
        <el-input
          v-model="query.taskName"
          placeholder="搜索任务"
          clearable
          class="task-pool-nav__search"
          @keyup.enter="searchTask"
        />
        <el-select
          v-model="query.taskType"
          placeholder="类型"
          clearable
          class="task-pool-nav__select"
          @change="searchTask"
        >
          <el-option
            v-for="option in taskTypeOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-button class="task-pool-nav__icon-btn" :icon="Search" @click="searchTask" />
        <el-button class="task-pool-nav__icon-btn" @click="resetSearch">重置</el-button>
        <el-button type="primary" class="task-pool-nav__primary" :icon="Plus" @click="openTaskDialog">
          新建任务
        </el-button>
      </div>
    </header>

    <div v-if="runningTasks.length && activeTab !== 'status'" class="task-pool-alert">
      <span class="task-pool-alert__dot" />
      <span>{{ runningTasks.length }} 个任务正在执行中</span>
      <span v-if="runningTasks[0]" class="task-pool-alert__meta">
        最近：{{ runningTasks[0].taskName }}
      </span>
    </div>

    <section v-if="activeTab === 'status'" class="task-pool-status">
      <div class="task-pool-status__item">
        <div class="task-pool-status__label">任务总数</div>
        <div class="task-pool-status__value">{{ systemStats.total }}</div>
      </div>
      <div class="task-pool-status__item">
        <div class="task-pool-status__label">待执行</div>
        <div class="task-pool-status__value">{{ systemStats.pending }}</div>
      </div>
      <div class="task-pool-status__item">
        <div class="task-pool-status__label">执行中</div>
        <div class="task-pool-status__value">{{ systemStats.running }}</div>
      </div>
      <div class="task-pool-status__item">
        <div class="task-pool-status__label">已完成</div>
        <div class="task-pool-status__value">{{ systemStats.completed }}</div>
      </div>
    </section>

    <section v-if="activeTab === 'status'" class="task-pool-insights">
      <div class="task-pool-panel">
        <div class="task-pool-panel__head">
          <span class="task-pool-panel__title">任务完成率</span>
        </div>
        <div class="task-pool-progress-ring">
          <div class="task-pool-progress-ring__value">{{ completionRate }}%</div>
          <div class="task-pool-progress-ring__track">
            <div class="task-pool-progress-ring__bar" :style="{ width: completionRate + '%' }" />
          </div>
          <p class="task-pool-progress-ring__desc">
            已完成 {{ systemStats.completed }} / 总计 {{ systemStats.total }} 项任务
          </p>
        </div>
      </div>
      <div class="task-pool-panel">
        <div class="task-pool-panel__head">
          <span class="task-pool-panel__title">任务类型分布</span>
        </div>
        <ul v-if="typeDistribution.length" class="task-pool-type-list">
          <li v-for="item in typeDistribution" :key="item.name" class="task-pool-type-list__item">
            <span class="task-pool-type-list__name">{{ item.name }}</span>
            <div class="task-pool-type-list__bar-wrap">
              <div class="task-pool-type-list__bar" :style="{ width: item.percent + '%' }" />
            </div>
            <span class="task-pool-type-list__count">{{ item.count }}</span>
          </li>
        </ul>
        <div v-else class="task-pool-empty task-pool-empty--inline">暂无类型数据</div>
      </div>
    </section>

    <section v-if="activeTab === 'status'" class="task-pool-status task-pool-status--secondary">
      <div class="task-pool-status__item">
        <div class="task-pool-status__label">已取消</div>
        <div class="task-pool-status__value">{{ systemStats.cancelled }}</div>
      </div>
      <div class="task-pool-status__item">
        <div class="task-pool-status__label">当前页任务</div>
        <div class="task-pool-status__value">{{ taskList.length }}</div>
      </div>
      <div class="task-pool-status__item">
        <div class="task-pool-status__label">任务类型数</div>
        <div class="task-pool-status__value">{{ typeDistribution.length }}</div>
      </div>
      <div class="task-pool-status__item">
        <div class="task-pool-status__label">系统时间</div>
        <div class="task-pool-status__value task-pool-status__value--sm">{{ pageTime.split(' ')[1] || '—' }}</div>
      </div>
    </section>

    <section v-else class="task-pool-stage">
      <template v-if="filteredTasks.length">
        <div class="task-pool-carousel-shell">
          <button type="button" class="task-pool-carousel-arrow" aria-label="上一项" @click="prevCarousel">
            <el-icon><ArrowLeft /></el-icon>
          </button>

          <div ref="carouselRef" class="task-pool-carousel" @scroll="onCarouselScroll">
            <article
              v-for="(task, index) in filteredTasks"
              :key="task.taskId"
              class="task-pool-card"
              :class="{ 'is-active': index === carouselIndex }"
              @click="scrollCarouselTo(index)"
            >
              <div class="task-pool-card__head">
                <div class="task-pool-card__head-main">
                  <h3 class="task-pool-card__name">{{ task.taskName }}</h3>
                  <span
                    class="task-pool-card__urgency"
                    :class="'task-pool-card__urgency--' + (task.urgency || 1)"
                  >
                    {{ getUrgencyText(task.urgency || 1) }}
                  </span>
                </div>
                <span class="task-pool-card__type">{{ task.taskType }}</span>
              </div>

              <div class="task-pool-card__metrics">
                <div class="task-pool-metric">
                  <div class="task-pool-metric__label">航点数量</div>
                  <div class="task-pool-metric__value">{{ estimateWaypoints(task) }}</div>
                </div>
                <div class="task-pool-metric">
                  <div class="task-pool-metric__label">预估耗电</div>
                  <div class="task-pool-metric__value">{{ estimatePowerPercent(task) }}%</div>
                </div>
                <div class="task-pool-metric">
                  <div class="task-pool-metric__label">航程</div>
                  <div class="task-pool-metric__value">{{ task.maxDistance || 0 }} km</div>
                </div>
                <div class="task-pool-metric">
                  <div class="task-pool-metric__label">预计时长</div>
                  <div class="task-pool-metric__value">{{ task.estimatedTime || 0 }} min</div>
                </div>
              </div>

              <div class="task-pool-card__power">
                <span class="task-pool-card__power-label">电量消耗预估</span>
                <div class="task-pool-card__power-track">
                  <div
                    class="task-pool-card__power-bar"
                    :style="{ width: Math.min(estimatePowerPercent(task), 100) + '%' }"
                  />
                </div>
              </div>

              <div class="task-pool-card__route">
                {{ task.startLocation || '—' }} → {{ task.endLocation || '—' }}
              </div>

              <div class="task-pool-card__actions">
                <el-button type="primary" class="task-pool-card__publish" @click.stop="publishTask(task)">
                  发布任务
                </el-button>
                <div class="task-pool-card__links">
                  <el-button
                    v-if="isTaskExecuting(task)"
                    link
                    type="warning"
                    @click.stop="terminateTask(task)"
                  >
                    终止
                  </el-button>
                  <el-button link type="primary" :icon="Edit" @click.stop="handleUpdate(task)" />
                  <el-button link type="danger" :icon="Delete" @click.stop="handleDelete(task)" />
                </div>
              </div>

              <div class="task-pool-card__status">
                <el-tag :type="getStatusType(task.status)" size="small" effect="plain">
                  {{ getStatusText(task.status) }}
                </el-tag>
                <span v-if="executionCountdowns[task.taskId]">
                  剩余 {{ formatCountdown(executionCountdowns[task.taskId]) }}
                </span>
              </div>
            </article>
          </div>

          <button type="button" class="task-pool-carousel-arrow" aria-label="下一项" @click="nextCarousel">
            <el-icon><ArrowRight /></el-icon>
          </button>
        </div>

        <div class="task-pool-dots">
          <button
            v-for="(_, index) in filteredTasks"
            :key="index"
            type="button"
            class="task-pool-dots__item"
            :class="{ 'is-active': index === carouselIndex }"
            :aria-label="'第 ' + (index + 1) + ' 项'"
            @click="scrollCarouselTo(index)"
          />
        </div>

        <section v-if="activeTask" class="task-pool-focus">
          <div class="task-pool-focus__main">
            <div class="task-pool-focus__badge">当前选中</div>
            <h3 class="task-pool-focus__title">{{ activeTask.taskName }}</h3>
            <p class="task-pool-focus__route">
              {{ activeTask.startLocation || '—' }} → {{ activeTask.endLocation || '—' }}
            </p>
            <div class="task-pool-focus__tags">
              <el-tag size="small" effect="plain">{{ activeTask.taskType }}</el-tag>
              <el-tag :type="getStatusType(activeTask.status)" size="small" effect="plain">
                {{ getStatusText(activeTask.status) }}
              </el-tag>
              <el-tag :type="getUrgencyType(activeTask.urgency || 1)" size="small" effect="plain">
                {{ getUrgencyText(activeTask.urgency || 1) }}
              </el-tag>
            </div>
          </div>
          <div class="task-pool-focus__stats">
            <div class="task-pool-focus__stat">
              <span class="task-pool-focus__stat-label">航点</span>
              <span class="task-pool-focus__stat-value">{{ estimateWaypoints(activeTask) }}</span>
            </div>
            <div class="task-pool-focus__stat">
              <span class="task-pool-focus__stat-label">航程</span>
              <span class="task-pool-focus__stat-value">{{ activeTask.maxDistance || 0 }} km</span>
            </div>
            <div class="task-pool-focus__stat">
              <span class="task-pool-focus__stat-label">时长</span>
              <span class="task-pool-focus__stat-value">{{ activeTask.estimatedTime || 0 }} min</span>
            </div>
            <div class="task-pool-focus__stat">
              <span class="task-pool-focus__stat-label">耗电</span>
              <span class="task-pool-focus__stat-value">{{ estimatePowerPercent(activeTask) }}%</span>
            </div>
          </div>
          <div class="task-pool-focus__actions">
            <el-button type="primary" @click="publishTask(activeTask)">发布任务</el-button>
            <el-button @click="handleUpdate(activeTask)">编辑</el-button>
          </div>
        </section>

        <section class="task-pool-insights">
          <div class="task-pool-panel">
            <div class="task-pool-panel__head">
              <span class="task-pool-panel__title">类型分布</span>
              <span class="task-pool-panel__meta">{{ typeDistribution.length }} 种</span>
            </div>
            <ul v-if="typeDistribution.length" class="task-pool-type-list">
              <li v-for="item in typeDistribution" :key="item.name" class="task-pool-type-list__item">
                <span class="task-pool-type-list__name">{{ item.name }}</span>
                <div class="task-pool-type-list__bar-wrap">
                  <div class="task-pool-type-list__bar" :style="{ width: item.percent + '%' }" />
                </div>
                <span class="task-pool-type-list__count">{{ item.count }}</span>
              </li>
            </ul>
            <div v-else class="task-pool-empty task-pool-empty--inline">暂无数据</div>
          </div>
          <div class="task-pool-panel">
            <div class="task-pool-panel__head">
              <span class="task-pool-panel__title">快速浏览</span>
              <span class="task-pool-panel__meta">共 {{ filteredTasks.length }} 项</span>
            </div>
            <ul class="task-pool-quick-list">
              <li
                v-for="(task, index) in filteredTasks.slice(0, 5)"
                :key="task.taskId"
                class="task-pool-quick-list__item"
                :class="{ 'is-active': index === carouselIndex }"
                @click="scrollCarouselTo(index)"
              >
                <span class="task-pool-quick-list__index">{{ index + 1 }}</span>
                <div class="task-pool-quick-list__body">
                  <span class="task-pool-quick-list__name">{{ task.taskName }}</span>
                  <span class="task-pool-quick-list__meta">
                    {{ task.taskType }} · {{ task.maxDistance || 0 }} km
                  </span>
                </div>
                <el-tag :type="getStatusType(task.status)" size="small" effect="plain">
                  {{ getStatusText(task.status) }}
                </el-tag>
              </li>
            </ul>
          </div>
        </section>
      </template>

      <div v-else class="task-pool-empty">
        {{ activeTab === 'history' ? '暂无历史任务' : '暂无待处理任务，点击「新建任务」开始' }}
      </div>
    </section>

    <div v-if="activeTab !== 'status'" class="task-pool-footer">
      <pagination
        v-model:page="query.pageNum"
        v-model:limit="query.pageSize"
        :page-sizes="[6, 12, 24, 48]"
        layout="total, sizes, prev, pager, next"
        :total="total"
        @pagination="getTaskList"
      />
    </div>

    <el-dialog
      v-model="taskDialogVisible"
      :title="title"
      width="560px"
      class="task-pool-dialog"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-alert
        v-if="taskForm.taskId && taskForm.status === 3"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 12px;"
        title="该任务已完成。保存后状态将重置为「待执行」。"
      />

      <div class="task-pool-form-section">
        <div class="task-pool-form-section__title">基本信息</div>
        <div class="task-pool-form-grid">
          <div class="task-pool-form-item">
            <label>任务名称</label>
            <el-input v-model="taskForm.taskName" placeholder="请输入任务名称" size="small" />
          </div>
          <div class="task-pool-form-item">
            <label>任务类型</label>
            <el-select v-model="taskForm.taskType" placeholder="请选择" size="small" style="width: 100%;">
              <el-option v-for="option in taskTypeOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
          </div>
          <div class="task-pool-form-item">
            <label>任务状态</label>
            <el-select v-model="taskForm.status" size="small" style="width: 100%;">
              <el-option v-for="option in taskStatusOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
          </div>
          <div class="task-pool-form-item">
            <label>紧急程度</label>
            <el-select v-model="taskForm.urgency" size="small" style="width: 100%;">
              <el-option label="普通" :value="1" />
              <el-option label="紧急" :value="2" />
              <el-option label="非常紧急" :value="3" />
            </el-select>
          </div>
        </div>
      </div>

      <div class="task-pool-form-section">
        <div class="task-pool-form-section__title">路线信息</div>
        <div class="task-pool-form-grid">
          <div class="task-pool-form-item">
            <label>起始地点</label>
            <el-input v-model="taskForm.startLocation" placeholder="起始地点" size="small" />
          </div>
          <div class="task-pool-form-item">
            <label>终点</label>
            <el-input v-model="taskForm.endLocation" placeholder="终点" size="small" />
          </div>
        </div>
      </div>

      <div class="task-pool-form-section">
        <div class="task-pool-form-section__title">任务参数</div>
        <div class="task-pool-form-grid">
          <div class="task-pool-form-item">
            <label>最大距离 (km)</label>
            <el-input-number v-model="taskForm.maxDistance" :min="0" :precision="2" readonly size="small" style="width: 100%;" />
          </div>
          <div class="task-pool-form-item">
            <label>预计时间 (min)</label>
            <el-input-number v-model="taskForm.estimatedTime" :min="0" readonly size="small" style="width: 100%;" />
          </div>
          <div class="task-pool-form-item">
            <label>所需载重 (kg)</label>
            <el-input-number v-model="taskForm.requiredLoad" :min="0" :max="50" :precision="2" size="small" style="width: 100%;" />
          </div>
          <div class="task-pool-form-item full">
            <label>任务描述</label>
            <el-input v-model="taskForm.description" type="textarea" :rows="2" size="small" />
          </div>
        </div>
      </div>

      <div class="task-pool-form-section">
        <div class="task-pool-form-section__title">地图与无人机</div>
        <div class="task-pool-form-item full">
          <label>地图预览</label>
          <div class="task-pool-map" ref="mapContainer" />
          <el-button type="primary" size="small" style="width: 100%; margin-top: 8px;" @click="calculatePathAndGetUavs">
            计算路径并匹配无人机
          </el-button>
        </div>
        <div class="task-pool-form-item full" style="margin-top: 12px;">
          <label>选择无人机</label>
          <el-select v-model="taskForm.uavId" placeholder="推荐选择无人机" size="small" style="width: 100%;">
            <el-option
              v-for="uav in availableUavs"
              :key="uav.uavId"
              :label="`${uav.uavModel}（剩余电量 ${uav.uavRemainingBattery ?? 100}%）`"
              :value="uav.uavId"
            />
          </el-select>
        </div>
      </div>

      <template #footer>
        <el-button @click="taskDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitTask">保存并发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style src="@/assets/styles/task-pool.css"></style>
