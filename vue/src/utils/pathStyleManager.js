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
  },
  '强化学习': {
    color: '#8B5CF6',
    strokeWeight: 5,
    strokeOpacity: 0.8,
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)'
  },
  '遗传算法': {
    color: '#F97316',
    strokeWeight: 5,
    strokeOpacity: 0.8,
    gradient: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)'
  }
}

/**
 * 获取算法对应的路径样式
 * @param {String} algorithm - 算法名称
 * @returns {Object} 样式对象 {color, strokeWeight, strokeOpacity}
 */
export const getAlgorithmStyle = (algorithm) => {
  return ALGORITHM_STYLES[algorithm] || ALGORITHM_STYLES['A*算法']
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
 * 创建路径线样式
 * @param {String} algorithm - 算法名称
 * @param {Array} pathPoints - 路径点数组
 * @returns {Object} AMap.Polyline 配置对象
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
  const safeCoords = flatPathCoords.filter((coord) => {
    const lng = Number(coord?.lng)
    const lat = Number(coord?.lat)
    return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  })
  if (safeCoords.length < 2) {
    console.warn('⚠️ 路径点存在非法坐标，已跳过绘制')
    return []
  }
  
  const baseColor = getAlgorithmColor(algorithm)
  const polylines = []

  if (pathPolylineRef?.value) {
    const prev = pathPolylineRef.value
    if (Array.isArray(prev)) prev.forEach((p) => p?.setMap?.(null))
    else prev?.setMap?.(null)
    pathPolylineRef.value = null
  }

  // 创建三层发光效果
  const layers = [
    { width: 8, opacity: 0.1 },   // 外层光晕
    { width: 5, opacity: 0.3 },   // 中层过渡
    { width: 3, opacity: 0.8 }    // 内层实线
  ]

  layers.forEach((layer) => {
    const polyline = new AMap.Polyline({
      path: safeCoords.map(coord => [coord.lng, coord.lat]),
      strokeColor: baseColor,
      strokeWeight: layer.width,
      strokeOpacity: layer.opacity,
      map
    })
    polylines.push(polyline)
  })
  if (pathPolylineRef) pathPolylineRef.value = polylines

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

  const v = pathPolylineRef.value
  if (Array.isArray(v)) v.forEach((p) => p?.setMap?.(null))
  else v?.setMap?.(null)
  pathPolylineRef.value = null

  console.log('✅ 路径线已清除')
}

/**
 * 在地图上绘制单条对比路径（可指定独立 polyline 存储，避免互相覆盖）
 */
export const drawComparePathLine = (map, pathPoints, algorithm, polylineStore) => {
  if (!map || !pathPoints || pathPoints.length < 2) return []
  const flat = pathPoints.map((p) => ({
    lng: Number(p.lng),
    lat: Number(p.lat),
    alt: Number(p.alt ?? 0)
  })).filter((p) =>
    Number.isFinite(p.lng) &&
    Number.isFinite(p.lat) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  )
  if (flat.length < 2) return []
  const fakeRef = { value: polylineStore?.value ?? null }
  const lines = drawGlowingPolyline(map, flat, algorithm, fakeRef)
  if (polylineStore) polylineStore.value = fakeRef.value
  return lines
}

export const clearComparePathLine = (polylineStore) => {
  if (!polylineStore?.value) return
  const v = polylineStore.value
  if (Array.isArray(v)) v.forEach((p) => p?.setMap?.(null))
  else v?.setMap?.(null)
  polylineStore.value = null
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
    case '强化学习':
      return '🤖'
    case '遗传算法':
      return '🧬'
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
    '强化学习模型': 'AI 深度学习模型，自适应能力强',
    '强化学习': '深度强化学习策略，端到端路径推理',
    '遗传算法': '进化搜索，在离散网格上优化路径长度与可达性'
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
