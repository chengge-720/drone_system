/**
 * 历史对比记录管理模块
 * 使用 localStorage 保存和查询历史对比结果
 */

const STORAGE_KEY = 'uav_path_comparison_history'
const MAX_HISTORY_COUNT = 50 // 最多保存 50 条记录

/**
 * 历史记录项结构
 */
export class ComparisonHistoryItem {
  constructor(data) {
    this.id = data.id || this.generateId()
    this.timestamp = data.timestamp || Date.now()
    this.startPoint = data.startPoint
    this.endPoint = data.endPoint
    this.uavName = data.uavName
    this.astarMetrics = data.astarMetrics
    this.dijkstraMetrics = data.dijkstraMetrics
    this.recommendation = data.recommendation
    this.weights = data.weights || this.getDefaultWeights()
  }

  generateId() {
    return 'comp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  }

  getDefaultWeights() {
    return {
      distance: 0.30,
      time: 0.25,
      computation: 0.25,
      smoothness: 0.20
    }
  }

  getFormattedTime() {
    const date = new Date(this.timestamp)
    const now = new Date()
    const diff = now - date

    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`

    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
}

/**
 * 保存对比记录
 * @param {ComparisonHistoryItem} historyItem 
 */
export const saveComparison = (historyItem) => {
  try {
    const history = getAllComparisons()
    
    // 检查是否已存在 (相同的起点、终点、无人机)
    const existsIndex = history.findIndex(
      item => item.startPoint === historyItem.startPoint &&
              item.endPoint === historyItem.endPoint &&
              item.uavName === historyItem.uavName
    )

    if (existsIndex !== -1) {
      // 更新已有记录
      history[existsIndex] = historyItem
    } else {
      // 添加新记录
      history.unshift(historyItem)
    }

    // 限制记录数量
    if (history.length > MAX_HISTORY_COUNT) {
      history.pop()
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    return true
  } catch (error) {
    console.error('保存对比记录失败:', error)
    return false
  }
}

/**
 * 获取所有对比记录
 * @returns {Array<ComparisonHistoryItem>}
 */
export const getAllComparisons = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    
    const parsed = JSON.parse(data)
    return parsed.map(item => new ComparisonHistoryItem(item))
  } catch (error) {
    console.error('读取对比记录失败:', error)
    return []
  }
}

/**
 * 根据 ID 获取单条记录
 * @param {String} id 
 * @returns {ComparisonHistoryItem|null}
 */
export const getComparisonById = (id) => {
  const history = getAllComparisons()
  return history.find(item => item.id === id) || null
}

/**
 * 删除指定记录
 * @param {String} id 
 */
export const deleteComparison = (id) => {
  try {
    let history = getAllComparisons()
    history = history.filter(item => item.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    return true
  } catch (error) {
    console.error('删除对比记录失败:', error)
    return false
  }
}

/**
 * 清空所有记录
 */
export const clearAllComparisons = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
    return true
  } catch (error) {
    console.error('清空对比记录失败:', error)
    return false
  }
}

/**
 * 搜索记录
 * @param {String} keyword - 搜索关键词
 * @returns {Array<ComparisonHistoryItem>}
 */
export const searchComparisons = (keyword) => {
  if (!keyword) return getAllComparisons()
  
  const history = getAllComparisons()
  const lowerKeyword = keyword.toLowerCase()
  
  return history.filter(item => 
    item.startPoint.toLowerCase().includes(lowerKeyword) ||
    item.endPoint.toLowerCase().includes(lowerKeyword) ||
    item.uavName.toLowerCase().includes(lowerKeyword)
  )
}

/**
 * 获取最近的记录
 * @param {Number} limit - 数量限制
 * @returns {Array<ComparisonHistoryItem>}
 */
export const getRecentComparisons = (limit = 10) => {
  const history = getAllComparisons()
  return history.slice(0, limit)
}

/**
 * 导出记录为 JSON
 * @returns {String} JSON 字符串
 */
export const exportComparisons = () => {
  const history = getAllComparisons()
  return JSON.stringify(history, null, 2)
}

/**
 * 从 JSON 导入记录
 * @param {String} jsonString 
 * @returns {Boolean} 是否成功
 */
export const importComparisons = (jsonString) => {
  try {
    const imported = JSON.parse(jsonString)
    const current = getAllComparisons()
    
    // 合并记录，避免重复
    const merged = [...current]
    imported.forEach(item => {
      const exists = merged.some(existing => existing.id === item.id)
      if (!exists) {
        merged.push(new ComparisonHistoryItem(item))
      }
    })

    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
    return true
  } catch (error) {
    console.error('导入对比记录失败:', error)
    return false
  }
}

/**
 * 默认导出所有方法
 */
export default {
  ComparisonHistoryItem,
  saveComparison,
  getAllComparisons,
  getComparisonById,
  deleteComparison,
  clearAllComparisons,
  searchComparisons,
  getRecentComparisons,
  exportComparisons,
  importComparisons
}
