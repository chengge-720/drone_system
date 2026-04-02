/**
 * 权重配置管理模块
 * 允许用户自定义各指标的权重
 */

const STORAGE_KEY = 'uav_comparison_weights'

/**
 * 默认权重配置
 */
export const DEFAULT_WEIGHTS = {
  distance: 0.30,      // 路径长度权重 30%
  time: 0.25,          // 飞行时间权重 25%
  computation: 0.25,   // 计算速度权重 25%
  smoothness: 0.20     // 路径平滑度权重 20%
}

/**
 * 验证权重是否有效 (总和为 1)
 * @param {Object} weights 
 * @returns {Boolean}
 */
export const validateWeights = (weights) => {
  if (!weights) return false
  
  const values = Object.values(weights)
  if (values.length !== 4) return false
  
  const sum = values.reduce((acc, val) => acc + parseFloat(val || 0), 0)
  return Math.abs(sum - 1.0) < 0.001
}

/**
 * 归一化权重 (确保总和为 1)
 * @param {Object} weights 
 * @returns {Object}
 */
export const normalizeWeights = (weights) => {
  const values = Object.entries(weights).map(([key, value]) => ({
    key,
    value: parseFloat(value) || 0
  }))
  
  const sum = values.reduce((acc, item) => acc + item.value, 0)
  
  if (sum === 0) {
    // 如果全为 0，返回默认权重
    return { ...DEFAULT_WEIGHTS }
  }
  
  // 归一化
  const normalized = {}
  values.forEach(({ key, value }) => {
    normalized[key] = parseFloat((value / sum).toFixed(4))
  })
  
  return normalized
}

/**
 * 保存权重配置到 localStorage
 * @param {Object} weights 
 * @returns {Boolean}
 */
export const saveWeights = (weights) => {
  try {
    if (!validateWeights(weights)) {
      console.warn('无效的权重配置，使用默认值')
      weights = DEFAULT_WEIGHTS
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(weights))
    return true
  } catch (error) {
    console.error('保存权重配置失败:', error)
    return false
  }
}

/**
 * 从 localStorage 读取权重配置
 * @returns {Object}
 */
export const loadWeights = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return { ...DEFAULT_WEIGHTS }
    
    const weights = JSON.parse(data)
    if (!validateWeights(weights)) {
      return { ...DEFAULT_WEIGHTS }
    }
    
    return weights
  } catch (error) {
    console.error('读取权重配置失败:', error)
    return { ...DEFAULT_WEIGHTS }
  }
}

/**
 * 重置为默认权重
 * @returns {Object}
 */
export const resetWeights = () => {
  localStorage.removeItem(STORAGE_KEY)
  return { ...DEFAULT_WEIGHTS }
}

/**
 * 根据权重重新计算综合得分
 * @param {Object} metrics - 算法指标
 * @param {Object} weights - 权重配置
 * @param {Object} comparison - 对比结果
 * @returns {Number} 综合得分 (0-100)
 */
export const calculateWeightedScore = (metrics, weights, comparison) => {
  let score = 0
  
  // 距离得分 (0-100)
  const maxDistance = Math.max(metrics.distance, comparison.opponentDistance || metrics.distance)
  const distanceScore = maxDistance > 0 ? ((maxDistance - metrics.distance) / maxDistance) * 100 : 50
  score += distanceScore * weights.distance
  
  // 时间得分 (0-100)
  const maxTime = Math.max(metrics.time, comparison.opponentTime || metrics.time)
  const timeScore = maxTime > 0 ? ((maxTime - metrics.time) / maxTime) * 100 : 50
  score += timeScore * weights.time
  
  // 计算速度得分 (0-100)
  const maxComputation = Math.max(metrics.computationTime, comparison.opponentComputation || metrics.computationTime)
  const computationScore = maxComputation > 0 ? ((maxComputation - metrics.computationTime) / maxComputation) * 100 : 50
  score += computationScore * weights.computation
  
  // 平滑度得分 (已经是 0-100)
  const smoothnessScore = metrics.smoothness || 50
  score += smoothnessScore * weights.smoothness
  
  return Math.min(100, Math.max(0, score))
}

/**
 * 生成权重预设方案
 * @returns {Array<Object>}
 */
export const getWeightPresets = () => {
  return [
    {
      name: '均衡模式',
      description: '各指标权重平均分配',
      weights: {
        distance: 0.25,
        time: 0.25,
        computation: 0.25,
        smoothness: 0.25
      }
    },
    {
      name: '效率优先',
      description: '优先考虑路径长度和时间',
      weights: {
        distance: 0.40,
        time: 0.35,
        computation: 0.15,
        smoothness: 0.10
      }
    },
    {
      name: '速度优先',
      description: '优先考虑计算速度',
      weights: {
        distance: 0.20,
        time: 0.20,
        computation: 0.45,
        smoothness: 0.15
      }
    },
    {
      name: '平稳优先',
      description: '优先考虑路径平滑度',
      weights: {
        distance: 0.20,
        time: 0.20,
        computation: 0.15,
        smoothness: 0.45
      }
    },
    {
      name: '节能模式',
      description: '优先考虑路径长度 (省电)',
      weights: {
        distance: 0.50,
        time: 0.25,
        computation: 0.10,
        smoothness: 0.15
      }
    },
    {
      name: '快速响应',
      description: '优先考虑计算和飞行时间',
      weights: {
        distance: 0.25,
        time: 0.40,
        computation: 0.30,
        smoothness: 0.05
      }
    }
  ]
}

/**
 * 应用预设权重
 * @param {String} presetName - 预设名称
 * @returns {Object} 权重配置
 */
export const applyWeightPreset = (presetName) => {
  const presets = getWeightPresets()
  const preset = presets.find(p => p.name === presetName)
  
  if (preset) {
    saveWeights(preset.weights)
    return { ...preset.weights }
  }
  
  return { ...DEFAULT_WEIGHTS }
}

/**
 * 获取当前权重的预设名称
 * @param {Object} currentWeights 
 * @returns {String|null}
 */
export const getCurrentPresetName = (currentWeights) => {
  const presets = getWeightPresets()
  
  for (const preset of presets) {
    const isMatch = Object.keys(preset.weights).every(key => {
      return Math.abs(preset.weights[key] - currentWeights[key]) < 0.01
    })
    
    if (isMatch) {
      return preset.name
    }
  }
  
  return '自定义'
}

/**
 * 默认导出所有方法
 */
export default {
  DEFAULT_WEIGHTS,
  validateWeights,
  normalizeWeights,
  saveWeights,
  loadWeights,
  resetWeights,
  calculateWeightedScore,
  getWeightPresets,
  applyWeightPreset,
  getCurrentPresetName
}
