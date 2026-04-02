/**
 * 路径样式管理模块
 * 负责根据不同算法配置路径样式和颜色
 */

/**
 * 算法样式配置表
 */
export const ALGORITHM_STYLES = {
  'A*算法': {
    color: '#10B981',      // 绿色
    strokeWeight: 5,
    strokeOpacity: 0.8,
    gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
  },
  '迪杰斯特拉算法': {
    color: '#3B82F6',      // 蓝色
    strokeWeight: 5,
    strokeOpacity: 0.8,
    gradient: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)'
  },
  '蚁群算法': {
    color: '#F59E0B',      // 橙色
    strokeWeight: 5,
    strokeOpacity: 0.8,
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
  },
  '强化学习模型': {
    color: '#8B5CF6',      // 紫色
    strokeWeight: 5,
    strokeOpacity: 0.8,
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)'
  }
}

/**
 * 获取算法对应的路径样式
 * @param {String} algorithm - 算法名称
 * @returns {Object} 样式对象 {color, strokeWeight, strokeOpacity}
 */
export const getAlgorithmStyle = (algorithm) => {
  return ALGORITHM_STYLES[algorithm] || ALGORITHM_STYLES['迪杰斯特拉算法']
}

/**
 * 获取算法对应的颜色
 * @param {String} algorithm - 算法名称
 * @returns {String} 颜色值（十六进制）
 */
export const getAlgorithmColor = (algorithm) => {
  const style = getAlgorithmStyle(algorithm)
  return style.color
}

/**
 * 获取算法对应的渐变背景
 * @param {String} algorithm - 算法名称
 * @returns {String} CSS 渐变字符串
 */
export const getAlgorithmGradient = (algorithm) => {
  const style = getAlgorithmStyle(algorithm)
  return style.gradient
}

/**
 * 创建百度地图路径线样式
 * @param {String} algorithm - 算法名称
 * @param {Array} pathPoints - 路径点数组
 * @returns {Object} BMap.Polyline 配置对象
 */
export const createPolylineStyle = (algorithm, pathPoints) => {
  const style = getAlgorithmStyle(algorithm)
  
  return {
    strokeColor: style.color,
    strokeWeight: style.strokeWeight,
    strokeOpacity: style.strokeOpacity,
    enableClicking: false
  }
}

/**
 * 绘制带样式的多层发光路径线
 * @param {Object} map - 地图实例
 * @param {Array} flatPathCoords - 扁平化路径坐标
 * @param {String} algorithm - 算法名称
 * @param {Ref} pathPolylineRef - 路径线引用
 * @returns {Array} 创建的 Polyline 数组
 */
export const drawGlowingPolyline = (map, flatPathCoords, algorithm, pathPolylineRef) => {
  if (!map || !flatPathCoords || flatPathCoords.length < 2) {
    console.error('❌ 无法绘制路径：参数不完整')
    return []
  }
  
  const baseColor = getAlgorithmColor(algorithm)
  const polylines = []
  
  // 创建三层发光效果
  const layers = [
    { width: 8, opacity: 0.1 },   // 外层光晕
    { width: 5, opacity: 0.3 },   // 中层过渡
    { width: 3, opacity: 0.8 }    // 内层实线
  ]
  
  layers.forEach((layer, index) => {
    const polyline = new BMap.Polyline(
      flatPathCoords.map(coord => new BMap.Point(coord.lng, coord.lat)),
      {
        strokeColor: baseColor,
        strokeWeight: layer.width,
        strokeOpacity: layer.opacity,
        enableClicking: false
      }
    )
    
    map.addOverlay(polyline)
    polylines.push(polyline)
    
    // 保存最内层用于动画
    if (index === layers.length - 1 && pathPolylineRef) {
      pathPolylineRef.value = polyline
    }
  })
  
  console.log(`✅ 绘制发光路径完成，算法：${algorithm}, 层数：${layers.length}`)
  return polylines
}

/**
 * 清除路径线
 * @param {Object} map - 地图实例
 * @param {Ref} pathPolylineRef - 路径线引用
 */
export const clearPolyline = (map, pathPolylineRef) => {
  if (!map || !pathPolylineRef.value) return
  
  map.removeOverlay(pathPolylineRef.value)
  pathPolylineRef.value = null
  
  console.log('✅ 路径线已清除')
}

/**
 * 获取算法图标 Emoji
 * @param {String} algorithm - 算法名称
 * @returns {String} Emoji 图标
 */
export const getAlgorithmEmoji = (algorithm) => {
  switch (algorithm) {
    case 'A*算法':
      return '⚡'
    case '迪杰斯特拉算法':
      return '🔍'
    case '蚁群算法':
      return '🐜'
    case '强化学习模型':
      return '🤖'
    default:
      return '📍'
  }
}

/**
 * 获取算法描述信息
 * @param {String} algorithm - 算法名称
 * @returns {String} 描述文本
 */
export const getAlgorithmDescription = (algorithm) => {
  const descriptions = {
    'A*算法': '启发式搜索算法，效率高，适合实时路径规划',
    '迪杰斯特拉算法': '经典最短路径算法，保证全局最优解',
    '蚁群算法': '群体智能算法，适合复杂环境路径优化',
    '强化学习模型': 'AI 深度学习模型，自适应能力强'
  }
  
  return descriptions[algorithm] || '未知算法'
}

/**
 * 比较两种算法的优劣
 * @param {Object} astarResult - A*算法结果
 * @param {Object} dijkstraResult - Dijkstra 算法结果
 * @returns {Object} 比较结果
 */
export const compareAlgorithms = (astarResult, dijkstraResult) => {
  if (!astarResult || !dijkstraResult) {
    return {
      better: null,
      reasons: ['数据不完整，无法比较'],
      advantages: []
    }
  }
  
  const reasons = []
  const advantages = []
  
  // 距离比较
  if (astarResult.distance <= dijkstraResult.distance) {
    reasons.push('A*算法路径更短或相等')
    if (astarResult.distance < dijkstraResult.distance) {
      advantages.push(`距离缩短${((dijkstraResult.distance - astarResult.distance) / dijkstraResult.distance * 100).toFixed(1)}%`)
    }
  } else {
    reasons.push('Dijkstra 算法路径更短')
    advantages.push(`距离缩短${((astarResult.distance - dijkstraResult.distance) / astarResult.distance * 100).toFixed(1)}%`)
  }
  
  // 时间比较
  if (astarResult.time <= dijkstraResult.time) {
    reasons.push('A*算法预计用时更少或相等')
    if (astarResult.time < dijkstraResult.time) {
      advantages.push(`时间节省${((dijkstraResult.time - astarResult.time) / dijkstraResult.time * 100).toFixed(1)}%`)
    }
  } else {
    reasons.push('Dijkstra 算法预计用时更少')
    advantages.push(`时间节省${((astarResult.time - dijkstraResult.time) / astarResult.time * 100).toFixed(1)}%`)
  }
  
  // 路径点数比较（越少越平滑）
  if (astarResult.points <= dijkstraResult.points) {
    reasons.push('A*算法路径点更少，路径更平滑')
  } else {
    reasons.push('Dijkstra 算法路径点更少，路径更平滑')
  }
  
  return {
    better: astarResult.distance <= dijkstraResult.distance ? 'A*算法' : '迪杰斯特拉算法',
    reasons,
    advantages
  }
}

/**
 * 默认导出所有方法
 */
export default {
  getAlgorithmStyle,
  getAlgorithmColor,
  getAlgorithmGradient,
  createPolylineStyle,
  drawGlowingPolyline,
  clearPolyline,
  getAlgorithmEmoji,
  getAlgorithmDescription,
  compareAlgorithms,
  ALGORITHM_STYLES
}
