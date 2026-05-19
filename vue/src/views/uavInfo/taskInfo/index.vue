<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue"
import { useRouter } from 'vue-router'
import { selectTaskList, insertTask, updateTask, deleteTaskByTaskIds, getAvailableUavs, recommendUavs } from '@/api/system/task.js'
import { selectUavList } from '@/api/system/uav.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Document, List, Edit, Clock, Delete, RefreshLeft, Plus, Close, Check, RefreshRight, MapLocation, VideoCamera } from '@element-plus/icons-vue'
import {
  clearExecutionRecord,
  clearPlanningSession,
  getExecutionRemainSeconds,
  loadExecutionRecord
} from '@/utils/taskExecutionStorage'
import {VxeModal} from "vxe-pc-ui";
import 'vxe-pc-ui/lib/style.css'
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
  pageSize: 5,
  taskName: '',
  taskType: ''
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
      ElMessage.info('没有找到符合条件的无人机')
      // fallback: 获取所有可用无人机
      const uavResponse = await selectUavList({ pageNum: 1, pageSize: 100 })
      availableUavs.value = uavResponse.rows || []
    } else {
      ElMessage.success(`智能推荐 ${availableUavs.value.length} 架最合适的无人机`)
      // 自动选择排名第一的无人机
      if (availableUavs.value.length > 0) {
        taskForm.value.uavId = availableUavs.value[0].uavId
        ElMessage.success(`已自动匹配最佳无人机：${availableUavs.value[0].uavModel}`)
      }
    }
  } catch (error) {
    console.error('❌ 智能推荐失败:', error)
    // fallback: 直接获取所有无人机
    const uavResponse = await selectUavList({ pageNum: 1, pageSize: 100 })
    availableUavs.value = uavResponse.rows || []
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
  getTaskList()
  executionCountdownTimer = window.setInterval(refreshExecutionCountdowns, 1000)
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
  <div class="app-container">
    <h1 class="art-text">无人机任务信息</h1>
    
    <!-- 搜索和操作按钮 -->
    <div class="search-card fade-in">
      <div class="search-header">
        <div class="search-title">
          <el-icon><Search /></el-icon>
          <span>任务搜索</span>
        </div>
      </div>
      <div class="search-content">
        <el-form :model="query" inline class="search-form">
          <el-form-item label="任务名称" prop="taskName">
            <el-input 
              v-model="query.taskName" 
              placeholder="请输入任务名称" 
              clearable
              class="search-input"
            >
              <template #prefix>
                <el-icon><Edit /></el-icon>
              </template>
            </el-input>
          </el-form-item>
          
          <el-form-item label="任务类型" prop="taskType">
            <el-select 
              v-model="query.taskType" 
              placeholder="请选择任务类型" 
              clearable
              class="search-select"
            >
              <el-option 
                v-for="option in taskTypeOptions" 
                :key="option.value" 
                :label="option.label" 
                :value="option.value" 
              />
            </el-select>
          </el-form-item>
          
          <el-form-item class="search-actions">
            <el-button type="primary" icon="Search" class="btn-search" @click="searchTask">搜索</el-button>
            <el-button icon="RefreshLeft" class="btn-reset" @click="resetSearch">重置</el-button>
            <el-button type="primary" icon="Plus" class="btn-add" @click="openTaskDialog">发布任务</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>
    
    <!-- 任务列表 -->
    <div class="task-list-card fade-in">
      <div class="task-grid-container">
        <div v-for="(task, index) in taskList" :key="task.taskId" class="task-card" :style="{ animationDelay: `${index * 0.1}s` }">
          <!-- 卡片顶部渐变条 -->
          <div class="task-card-header" :class="getUrgencyClass(task.urgency)">
            <div class="task-card-id">#{{ task.taskId }}</div>
            <div class="task-card-status">
              <el-tag :type="getStatusType(task.status)" size="small" effect="dark">
                {{ getStatusText(task.status) }}
              </el-tag>
              <el-tag
                v-if="executionCountdowns[task.taskId]"
                type="danger"
                size="small"
                effect="plain"
                style="margin-left: 6px;"
              >
                {{ formatCountdown(executionCountdowns[task.taskId]) }}
              </el-tag>
            </div>
          </div>
          
          <!-- 卡片主体内容 -->
          <div class="task-card-body">
            <!-- 任务名称和类型 -->
            <div class="task-title-section">
              <h3 class="task-card-title">{{ task.taskName }}</h3>
              <el-tag :color="getTaskTypeColor(task.taskType)" size="small" round>
                {{ task.taskType }}
              </el-tag>
            </div>
            
            <!-- 路线信息 -->
            <div class="task-route-section">
              <div class="route-item">
                <div class="route-dot start-dot"></div>
                <span class="route-text">{{ task.startLocation }}</span>
              </div>
              <div class="route-line"></div>
              <div class="route-item">
                <div class="route-dot end-dot"></div>
                <span class="route-text">{{ task.endLocation }}</span>
              </div>
            </div>
            
            <!-- 任务参数 -->
            <div class="task-params-grid">
              <div class="param-item">
                <div class="param-icon">📏</div>
                <div class="param-content">
                  <div class="param-label">距离</div>
                  <div class="param-value">{{ task.maxDistance?.toFixed(2) || '-' }} km</div>
                </div>
              </div>
              
              <div class="param-item">
                <div class="param-icon">⏱️</div>
                <div class="param-content">
                  <div class="param-label">时间</div>
                  <div class="param-value">{{ task.estimatedTime || '-' }} min</div>
                </div>
              </div>
              
              <div class="param-item">
                <div class="param-icon">🔋</div>
                <div class="param-content">
                  <div class="param-label">载重</div>
                  <div class="param-value">{{ task.requiredLoad?.toFixed(1) || '-' }} kg</div>
                </div>
              </div>
              
              <div class="param-item">
                <div class="param-icon">🚨</div>
                <div class="param-content">
                  <div class="param-label">紧急度</div>
                  <div class="param-value">
                    <el-tag :type="getUrgencyType(task.urgency)" size="small">
                      {{ getUrgencyText(task.urgency) }}
                    </el-tag>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 无人机信息 -->
            <div v-if="task.uavModel" class="uav-info-section">
              <div class="uav-label">🛸 执行无人机</div>
              <div class="uav-model">{{ task.uavModel }}</div>
            </div>
            
            <!-- 任务描述 -->
            <div v-if="task.description && task.description !== '无'" class="task-description">
              <el-tooltip :content="task.description" placement="top">
                <div class="description-preview">
                  <el-icon><Document /></el-icon>
                  <span>{{ truncateText(task.description, 20) }}</span>
                </div>
              </el-tooltip>
            </div>
          </div>
          
          <!-- 卡片底部操作区 -->
          <div class="task-card-footer">
            <div class="task-time">
              <el-icon><Clock /></el-icon>
              <span>{{ formatDate(task.createTime) }}</span>
            </div>
            <div class="task-actions">
              <el-button
                v-if="isTaskExecuting(task)"
                type="warning"
                size="small"
                @click="terminateTask(task)"
              >
                终止任务
              </el-button>
              <el-button type="primary" size="small" circle @click="handleUpdate(task)">
                <el-icon><Edit /></el-icon>
              </el-button>
            <el-button type="info" size="small" circle @click="goToTaskPlanning(task.taskId)">
              <el-icon><VideoCamera /></el-icon>
            </el-button>
              <el-button type="danger" size="small" circle @click="handleDelete(task)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 空状态提示 -->
      <el-empty v-if="taskList.length === 0" description="暂无任务数据" />
    </div>
    
    <!-- 分页 -->
    <div class="fade-in" style="margin-top: 20px;">
      <pagination
        v-model:current-page="query.pageNum"
        v-model:page-size="query.pageSize"
        :page-sizes="[5, 10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        @size-change="getTaskList"
        @current-change="getTaskList"
      />
    </div>
    
    <!-- 发布任务对话框 -->
    <el-dialog
      v-model="taskDialogVisible"
      :title="title"
      width="560px"
      class="task-dialog-el"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <div class="task-form-scroll-wrapper ultra-compact">
        <el-alert
          v-if="taskForm.taskId && taskForm.status === 3"
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 12px;"
          title="该任务已完成。保存修改后状态将重置为「待执行」，可重新规划并执行。"
        />
        <div class="form-section-title compact">
          <el-icon><Document /></el-icon>
          <span>基本信息</span>
        </div>
        <div class="task-form ultra-compact">
          <div class="form-row ultra-tight">
            <div class="form-item">
              <label class="form-label ultra-small">
                <el-icon><Edit /></el-icon>
                任务名称
              </label>
              <el-input v-model="taskForm.taskName" placeholder="请输入任务名称" size="small" />
            </div>
            <div class="form-item">
              <label class="form-label ultra-small">
                <el-icon><List /></el-icon>
                任务类型
              </label>
              <el-select v-model="taskForm.taskType" placeholder="请选择任务类型" size="small" style="width: 100%;">
                <el-option 
                  v-for="option in taskTypeOptions" 
                  :key="option.value" 
                  :label="option.label" 
                  :value="option.value" 
                />
              </el-select>
            </div>
          </div>
          <div class="form-row ultra-tight">
            <div class="form-item">
              <label class="form-label ultra-small">
                <el-icon><Clock /></el-icon>
                任务状态
              </label>
              <el-select v-model="taskForm.status" placeholder="请选择任务状态" size="small" style="width: 100%;">
                <el-option 
                  v-for="option in taskStatusOptions" 
                  :key="option.value" 
                  :label="option.label" 
                  :value="option.value" 
                />
              </el-select>
            </div>
            <div class="form-item">
              <label class="form-label ultra-small">
                <el-icon><Bell /></el-icon>
                紧急程度
              </label>
              <el-select v-model="taskForm.urgency" placeholder="请选择紧急程度" size="small" style="width: 100%;">
                <el-option label="普通" :value="1" />
                <el-option label="紧急" :value="2" />
                <el-option label="非常紧急" :value="3" />
              </el-select>
            </div>
          </div>
        </div>

        <div class="form-section-title compact">
          <el-icon><Location /></el-icon>
          <span>路线信息</span>
        </div>
        <div class="task-form ultra-compact">
          <div class="form-row ultra-tight">
            <div class="form-item">
              <label class="form-label ultra-small">
                <div class="location-dot start"></div>
                起始地点
              </label>
              <el-input v-model="taskForm.startLocation" placeholder="请输入起始地点" size="small" />
            </div>
            <div class="form-item">
              <label class="form-label ultra-small">
                <div class="location-dot end"></div>
                终点
              </label>
              <el-input v-model="taskForm.endLocation" placeholder="请输入终点" size="small" />
            </div>
          </div>
        </div>

        <div class="form-section-title compact">
          <el-icon><Setting /></el-icon>
          <span>任务参数</span>
        </div>
        <div class="task-form ultra-compact">
          <div class="form-row ultra-tight">
            <div class="form-item">
              <label class="form-label ultra-small">
                <el-icon><ScaleToOriginal /></el-icon>
                最大距离 (km)
              </label>
              <el-input-number v-model="taskForm.maxDistance" :min="0" :precision="2" placeholder="自动计算" readonly class="readonly-input" controls-position="right" size="small" style="width: 100%;" />
            </div>
            <div class="form-item">
              <label class="form-label ultra-small">
                <el-icon><Timer /></el-icon>
                预计时间 (min)
              </label>
              <el-input-number v-model="taskForm.estimatedTime" :min="0" :precision="0" placeholder="自动估算" readonly class="readonly-input" controls-position="right" size="small" style="width: 100%;" />
            </div>
            <div class="form-item">
              <label class="form-label ultra-small">
                <el-icon><Loading /></el-icon>
                所需载重 (kg)
              </label>
              <el-input-number v-model="taskForm.requiredLoad" :min="0" :max="50" :precision="2" placeholder="0-50" controls-position="right" size="small" style="width: 100%;" />
            </div>
          </div>
          <div class="form-row ultra-tight">
            <div class="form-item full-width">
              <label class="form-label ultra-small">
                <el-icon><Document /></el-icon>
                任务描述
              </label>
              <el-input v-model="taskForm.description" type="textarea" :rows="2" placeholder="请输入任务描述" size="small" />
            </div>
          </div>
        </div>

        <div class="form-section-title compact">
          <el-icon><MapLocation /></el-icon>
          <span>地图与无人机</span>
        </div>
        <div class="task-form ultra-compact">
          <div class="form-row ultra-tight">
            <div class="form-item full-width">
              <label class="form-label ultra-small">地图预览</label>
              <div class="map-container super-compact" ref="mapContainer"></div>
              <el-button type="primary" @click="calculatePathAndGetUavs" class="btn-calculate super-compact" style="margin-top: 6px; width: 100%;">
                <el-icon><RefreshRight /></el-icon>
                计算路径并获取可用无人机
              </el-button>
            </div>
          </div>
          <div class="form-row ultra-tight">
            <div class="form-item full-width">
              <label class="form-label ultra-small">
                <el-icon><VideoCamera /></el-icon>
                选择无人机
              </label>
              <el-select v-model="taskForm.uavId" placeholder="推荐选择无人机" size="small" style="width: 100%;" class="uav-select">
                <el-option 
                  v-for="uav in availableUavs" 
                  :key="uav.uavId" 
                  :label="uav.uavModel" 
                  :value="uav.uavId" 
                >
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>{{ uav.uavModel }}</span>
                    <el-tag v-if="availableUavs.length > 0 && uav === availableUavs[0]" type="success" size="small" effect="dark">
                      推荐
                    </el-tag>
                  </div>
                </el-option>
              </el-select>
              <p v-if="availableUavs.length === 0" class="hint-text ultra-small">
                <el-icon><InfoFilled /></el-icon>
                请先计算路径以获取可用无人机
              </p>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button class="btn-cancel" @click="taskDialogVisible = false">
            <el-icon><Close /></el-icon>
            取消
          </el-button>
          <el-button type="primary" class="btn-submit" @click="submitTask">
            <el-icon><Check /></el-icon>
            发布任务
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 搜索卡片 - 现代渐变风格 */
.search-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(102, 126, 234, 0.25);
  margin-bottom: 16px;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.search-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 48px rgba(102, 126, 234, 0.35);
}

.search-header {
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.search-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  letter-spacing: 0.5px;
}

.search-title .el-icon {
  font-size: 18px;
}

.search-content {
  padding: 20px 24px;
  background: #ffffff;
}

.search-form {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
}

.search-form .el-form-item {
  margin-bottom: 0;
}

.search-input,
.search-select {
  width: 220px;
}

.search-input :deep(.el-input__wrapper),
.search-select :deep(.el-select__wrapper) {
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.3s ease;
}

.search-input :deep(.el-input__wrapper):hover,
.search-select :deep(.el-select__wrapper):hover {
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
}

.search-input :deep(.el-input__wrapper.is-focus),
.search-select :deep(.el-select__wrapper.is-focus) {
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.25);
}

.search-actions {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

.btn-search {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 10px;
  padding: 10px 24px;
  font-weight: 600;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-search:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.btn-reset {
  border-radius: 10px;
  padding: 10px 24px;
  font-weight: 600;
  border: 1px solid #e2e8f0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-reset:hover {
  border-color: #667eea;
  color: #667eea;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.15);
}

.btn-add {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  border: none;
  border-radius: 10px;
  padding: 10px 24px;
  font-weight: 600;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-add:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(245, 87, 108, 0.4);
}

/* 任务列表卡片 */
.task-list-card {
  background: transparent;
}

/* ========== 任务卡片网格布局 ========== */
.task-grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 24px;
  padding: 10px;
}

/* ========== 任务卡片主体 ========== */
.task-card {
  background: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  animation: slideInUp 0.6s ease-out forwards;
  cursor: pointer;
  border: 2px solid transparent;
}

.task-card:hover {
  transform: translateY(-8px) scale(1.02);
  box-shadow: 0 12px 40px rgba(77, 79, 195, 0.2);
  border-color: #4D4FC3;
}

@keyframes slideInUp {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ========== 卡片顶部渐变条 ========== */
.task-card-header {
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: white;
  position: relative;
  overflow: hidden;
}

/* 紧急度渐变背景 */
.urgency-high {
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
}

.urgency-medium {
  background: linear-gradient(135deg, #ffa726 0%, #fb8c00 100%);
}

.urgency-low {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.task-card-id {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

/* ========== 卡片主体内容 ========== */
.task-card-body {
  padding: 20px;
}

/* 任务标题区域 */
.task-title-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
}

.task-card-title {
  font-size: 18px;
  font-weight: 700;
  color: #2d3748;
  margin: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ========== 路线信息区域 ========== */
.task-route-section {
  background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  position: relative;
}

.route-item {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.route-item:last-child {
  margin-bottom: 0;
}

.route-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.start-dot {
  background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
  box-shadow: 0 0 12px rgba(72, 187, 120, 0.5);
}

.end-dot {
  background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%);
  box-shadow: 0 0 12px rgba(245, 101, 101, 0.5);
}

.route-line {
  width: 2px;
  height: 16px;
  background: linear-gradient(to bottom, #48bb78, #f56565);
  margin-left: 5px;
  margin-bottom: 8px;
}

.route-text {
  font-size: 13px;
  color: #4a5568;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

/* ========== 任务参数网格 ========== */
.task-params-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: linear-gradient(135deg, #fff5f5 0%, #fffafa 100%);
  border-radius: 10px;
  transition: all 0.3s ease;
}

.param-item:hover {
  background: linear-gradient(135deg, #ffe4e6 0%, #fef2f2 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.param-icon {
  font-size: 20px;
  line-height: 1;
}

.param-content {
  flex: 1;
}

.param-label {
  font-size: 11px;
  color: #718096;
  margin-bottom: 4px;
  font-weight: 500;
}

.param-value {
  font-size: 15px;
  font-weight: 700;
  color: #2d3748;
}

/* ========== 无人机信息区域 ========== */
.uav-info-section {
  background: linear-gradient(135deg, #e6fffa 0%, #b2f5ea 100%);
  border-left: 4px solid #38b2ac;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
}

.uav-label {
  font-size: 12px;
  color: #2c7a7b;
  margin-bottom: 6px;
  font-weight: 600;
}

.uav-model {
  font-size: 15px;
  font-weight: 700;
  color: #234e52;
}

/* ========== 任务描述区域 ========== */
.task-description {
  margin-top: 12px;
}

.description-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #f7fafc;
  border-radius: 8px;
  font-size: 12px;
  color: #718096;
  cursor: help;
  transition: all 0.3s ease;
}

.description-preview:hover {
  background: #edf2f7;
  color: #4a5568;
}

/* ========== 卡片底部操作区 ========== */
.task-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-top: 1px solid #e2e8f0;
}

.task-time {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #718096;
  font-weight: 500;
}

.task-actions {
  display: flex;
  gap: 8px;
}

.task-actions .el-button {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.task-actions .el-button:hover {
  transform: scale(1.2) rotate(15deg);
}

/* ========== 对话框样式美化 - Element Plus ========== */
.task-dialog-el :deep(.el-dialog) {
  border-radius: 16px !important;
  overflow: hidden;
}

.task-dialog-el :deep(.el-dialog__header) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 16px 18px !important;
  border-bottom: none;
  margin-right: 0 !important;
  border-radius: 16px 16px 0 0;
}

.task-dialog-el :deep(.el-dialog__title) {
  color: #ffffff !important;
  font-size: 17px !important;
  font-weight: 600 !important;
}

.task-dialog-el :deep(.el-dialog__headerbtn .el-dialog__close) {
  color: #ffffff !important;
  transition: all 0.3s ease;
}

.task-dialog-el :deep(.el-dialog__headerbtn .el-dialog__close:hover) {
  color: #f093fb !important;
}

.task-dialog-el :deep(.el-dialog__body) {
  padding: 0 !important;
  background: #f8f9fa;
  max-height: calc(60vh - 140px);
  overflow-y: auto;
}

.task-dialog-el :deep(.el-dialog__footer) {
  padding: 12px 18px !important;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
  border-radius: 0 0 16px 16px;
}

/* 自定义滚动条 */
.task-dialog-el :deep(.el-dialog__body::-webkit-scrollbar) {
  width: 6px;
}

.task-dialog-el :deep(.el-dialog__body::-webkit-scrollbar-thumb) {
  background: rgba(102, 126, 234, 0.3);
  border-radius: 3px;
}

.task-dialog-el :deep(.el-dialog__body::-webkit-scrollbar-thumb:hover) {
  background: rgba(102, 126, 234, 0.5);
}

/* 对话框内容包装器 - 关键修复 */
.task-form-scroll-wrapper {
  padding: 14px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.task-form-scroll-wrapper.ultra-compact {
  padding: 12px;
}

/* 表单包装器 */
.task-form-wrapper {
  padding: 16px;
}

/* 分组标题 */
.form-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  margin: 10px -12px 4px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
  border-left: 3px solid #667eea;
  color: #2d3748;
  font-size: 13px;
  font-weight: 600;
}

.form-section-title.compact {
  padding: 7px 10px;
  margin: 8px -10px 3px;
  font-size: 12px;
}

.form-section-title .el-icon {
  color: #667eea;
  font-size: 16px;
}

/* 任务表单 */
.task-form {
  background: #ffffff;
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 10px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}

.task-form.ultra-compact {
  padding: 12px;
  margin-bottom: 8px;
}

.form-row {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.form-row.tight {
  gap: 8px;
  margin-bottom: 8px;
}

.form-row.ultra-tight {
  gap: 6px;
  margin-bottom: 6px;
}

.form-row:last-child {
  margin-bottom: 0;
}

.form-item {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.form-item.full-width {
  flex: 1 1 100%;
}

/* 表单标签 */
.form-label {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 5px;
  font-size: 12px;
  font-weight: 600;
  color: #4a5568;
}

.form-label.ultra-small {
  gap: 4px;
  margin-bottom: 4px;
  font-size: 11px;
}

.form-label .el-icon {
  color: #667eea;
  font-size: 14px;
}

/* 位置圆点 */
.location-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.location-dot.start {
  background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
  box-shadow: 0 0 8px rgba(72, 187, 120, 0.4);
}

.location-dot.end {
  background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%);
  box-shadow: 0 0 8px rgba(245, 101, 101, 0.4);
}

/* 输入框样式 */
.vxe-input,
.vxe-select,
.vxe-textarea {
  border-radius: 6px !important;
  border: 1px solid #e2e8f0 !important;
  transition: all 0.3s ease;
}

.vxe-input:hover,
.vxe-select:hover,
.vxe-textarea:hover {
  border-color: #667eea !important;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

.vxe-input:focus,
.vxe-select:focus,
.vxe-textarea:focus {
  border-color: #667eea !important;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
}

.readonly-input {
  background: #f7fafc !important;
  cursor: not-allowed;
}

/* 地图容器 */
.map-container {
  width: 100%;
  height: 220px;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid #e2e8f0;
  margin-bottom: 8px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
}

.map-container.compact {
  height: 180px;
}

.map-container.super-compact {
  height: 160px;
}

/* 计算路径按钮 */
.btn-calculate {
  width: 100%;
  height: 36px;
  border-radius: 6px;
  font-weight: 600;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  border: none !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
}

.btn-calculate.compact {
  height: 34px;
  font-size: 11px;
}

.btn-calculate.super-compact {
  height: 32px;
  font-size: 11px;
}

.btn-calculate:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

/* 无人机选择框 */
.uav-select {
  margin-bottom: 8px;
}

/* 提示文本 */
.hint-text {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  background: #fff5f5;
  border-radius: 6px;
  color: #999;
  font-size: 11px;
  margin-top: 6px;
  border: 1px dashed #feb2b2;
}

.hint-text.ultra-small {
  padding: 5px 8px;
  font-size: 10px;
  margin-top: 4px;
}

.hint-text .el-icon {
  color: #fc8181;
}

/* 底部按钮 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-cancel {
  min-width: 80px;
  height: 34px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 13px;
  border: 1px solid #e2e8f0 !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 5px;
}

.btn-cancel:hover {
  border-color: #667eea !important;
  color: #667eea !important;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.15);
}

.btn-submit {
  min-width: 100px;
  height: 34px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 13px;
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%) !important;
  border: none !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 5px;
}

.btn-submit:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(245, 87, 108, 0.4);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .form-row {
    flex-direction: column;
  }
  
  .task-dialog :deep(.vxe-modal) {
    width: 95% !important;
  }
}

/* 操作按钮样式 */
.action-button {
  border-radius: 8px;
  font-weight: 500;
  transition: var(--transition);
}

.action-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.action-button.primary:hover {
  box-shadow: 0 4px 12px rgba(77, 79, 200, 0.3);
}

/* 对话框footer */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-footer.ultra-compact {
  gap: 8px;
  padding-top: 8px;
}

/* 动画效果 */
.fade-in {
  animation: fadeIn 0.5s ease-in-out;
}

.fade-in:nth-child(2) {
  animation-delay: 0.1s;
}

.fade-in:nth-child(3) {
  animation-delay: 0.2s;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .form-row {
    flex-direction: column;
  }
  
  .el-row {
    flex-direction: column;
  }
  
  .el-col {
    width: 100% !important;
  }
  
  .map-container {
    height: 300px;
  }
  
  .action-button {
    margin: 5px 0;
  }
}
</style>