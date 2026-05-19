/**
 * 任务选择与管理模块
 * 负责任务列表加载、选择和自动匹配无人机
 */

import { selectTaskList } from '@/api/system/task'
import { selectUavList } from '@/api/system/uav'
import { getDistanceFromLatLonInM } from '@/utils/noFlyZoneService.js'

/**
 * 加载任务列表
 * @param {Object} filters - 筛选条件
 * @returns {Promise<Array>} 任务列表
 */
export const loadTaskList = async (filters = {}) => {
  try {
    const defaultFilters = {
      pageNum: 1,
      pageSize: 100,
      status: 1, // 默认加载待执行任务
      ...filters
    }
    
    const response = await selectTaskList(defaultFilters)
    const tasks = response.rows || []
    
    console.log(`✅ 加载任务列表成功，共 ${tasks.length} 个任务`)
    return tasks
  } catch (error) {
    console.error('❌ 加载任务列表失败:', error)
    return []
  }
}

/**
 * 加载无人机列表
 * @param {Object} filters - 筛选条件
 * @returns {Promise<Array>} 无人机列表
 */
export const loadUavList = async (filters = {}) => {
  try {
    const defaultFilters = {
      pageNum: 1,
      pageSize: 100,
      ...filters
    }
    
    const response = await selectUavList(defaultFilters)
    const uavs = response.rows || []
    
    console.log(`✅ 加载无人机列表成功，共 ${uavs.length} 架无人机`)
    return uavs
  } catch (error) {
    console.error('❌ 加载无人机列表失败:', error)
    return []
  }
}

/**
 * 选择任务并自动配置
 * @param {Object} task - 选中的任务
 * @param {Ref} selectedTaskRef - 选中任务引用
 * @param {Ref} startPointRef - 起点引用
 * @param {Ref} endPointRef - 终点引用
 * @param {Ref} selectedUavRef - 选中无人机引用
 * @returns {Object} 配置结果
 */
export const selectTask = (
  task,
  selectedTaskRef,
  startPointRef,
  endPointRef,
  selectedUavRef
) => {
  if (!task) {
    console.warn('⚠️ 任务为空')
    return { success: false, message: '任务为空' }
  }
  
  // 设置任务信息
  selectedTaskRef.value = task
  startPointRef.value = task.startLocation
  endPointRef.value = task.endLocation
  
  let message = `已选择任务：${task.taskName}`
  
  // 如果有推荐无人机，自动选择
  if (task.uavId) {
    selectedUavRef.value = task.uavId
    message += '，并自动匹配无人机'
    console.log('✅ 自动匹配无人机:', task.uavId)
  } else {
    message += '，请手动选择无人机'
  }
  
  console.log('✅ 任务选择成功:', task.taskName)
  
  return {
    success: true,
    message,
    task,
    hasUavRecommendation: !!task.uavId
  }
}

/**
 * 根据路径距离智能推荐无人机
 * @param {Array} pathPoints - 路径点数组
 * @param {Array} uavList - 无人机列表
 * @param {Object} map - 地图实例
 * @returns {Object|null} 推荐的无人机
 */
export const recommendUavByPath = (pathPoints, uavList, map) => {
  if (!pathPoints || pathPoints.length === 0) {
    console.warn('⚠️ 路径点为空，无法推荐无人机')
    return null
  }
  
  if (!uavList || uavList.length === 0) {
    console.warn('⚠️ 无人机列表为空')
    return null
  }
  
  // 计算路径总距离
  let totalDistance = 0
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const a = pathPoints[i]
    const b = pathPoints[i + 1]
    totalDistance += getDistanceFromLatLonInM(a.lat, a.lng, b.lat, b.lng)
  }
  
  // 转换为公里
  const distanceKm = totalDistance / 1000
  
  console.log(`📏 路径总距离：${distanceKm.toFixed(2)} km`)
  
  // 安全系数：预留 30% 的余量
  const safetyFactor = 1.3
  const requiredRange = distanceKm * safetyFactor
  
  console.log(`⚠️ 考虑安全系数后所需航程：${requiredRange.toFixed(2)} km`)
  
  // 查找满足条件的无人机
  const suitableUavs = uavList.filter(uav => {
    if (!uav.uavMaxFlightTime) return false
    
    // 假设无人机速度为 10m/s（36km/h）
    const assumedSpeed = 10 // m/s
    const maxRange = (uav.uavMaxFlightTime * 60 * assumedSpeed) / 1000 // 转换为 km
    
    return maxRange >= requiredRange
  })
  
  if (suitableUavs.length === 0) {
    console.warn('⚠️ 没有无人机能满足此路径要求')
    return null
  }
  
  // 选择续航时间最长的无人机
  const bestUav = suitableUavs.reduce((best, current) => {
    return current.uavMaxFlightTime > best.uavMaxFlightTime ? current : best
  })
  
  console.log(`✅ 推荐无人机：${bestUav.uavModel} (续航${bestUav.uavMaxFlightTime}分钟)`);
  
  return bestUav
}

/**
 * 显示任务选择对话框
 * @param {Function} loadTasksFn - 加载任务函数
 * @param {Ref} showTaskDialogRef - 对话框显示引用
 * @returns {Promise<Array>} 任务列表
 */
export const openTaskSelector = async (loadTasksFn, showTaskDialogRef) => {
  showTaskDialogRef.value = true
  return await loadTasksFn()
}

/**
 * 关闭任务选择对话框
 * @param {Ref} showTaskDialogRef - 对话框显示引用
 */
export const closeTaskSelector = (showTaskDialogRef) => {
  showTaskDialogRef.value = false
}

/**
 * 格式化任务显示信息
 * @param {Object} task - 任务对象
 * @returns {String} 格式化的显示信息
 */
export const formatTaskDisplayInfo = (task) => {
  if (!task) return '无任务'
  
  const parts = []
  
  if (task.taskName) {
    parts.push(task.taskName)
  }
  
  if (task.startLocation && task.endLocation) {
    parts.push(`${task.startLocation} → ${task.endLocation}`)
  }
  
  if (task.maxDistance) {
    parts.push(`距离：${task.maxDistance.toFixed(2)}km`)
  }
  
  if (task.estimatedTime) {
    parts.push(`预计：${task.estimatedTime}分钟`)
  }
  
  return parts.join(' | ')
}

/**
 * 获取任务紧急度标签类型
 * @param {Number} urgency - 紧急度等级 (1:普通，2:紧急，3:非常紧急)
 * @returns {String} Element Plus tag 类型
 */
export const getUrgencyTagType = (urgency) => {
  switch (urgency) {
    case 3:
      return 'danger'
    case 2:
      return 'warning'
    case 1:
    default:
      return 'info'
  }
}

/**
 * 获取任务紧急度文本
 * @param {Number} urgency - 紧急度等级
 * @returns {String} 紧急度文本
 */
export const getUrgencyText = (urgency) => {
  switch (urgency) {
    case 3:
      return '非常紧急'
    case 2:
      return '紧急'
    case 1:
    default:
      return '普通'
  }
}

/**
 * 默认导出所有方法
 */
export default {
  loadTaskList,
  loadUavList,
  selectTask,
  recommendUavByPath,
  openTaskSelector,
  closeTaskSelector,
  formatTaskDisplayInfo,
  getUrgencyTagType,
  getUrgencyText
}
