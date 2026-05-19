/**
 * 路径计算工具函数
 */

// 地球半径（米）
const EARTH_RADIUS = 6371000

/**
 * Haversine 公式计算两点间距离
 */
export const getDistanceFromLatLonInMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const dLat = deg2rad(lat2 - lat1)
  const dLon = deg2rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS * c
}

/**
 * 角度转弧度
 */
export const deg2rad = (deg: number): number => {
  return deg * (Math.PI / 180)
}

/**
 * 计算路径统计参数
 */
/** 含高度的路径坐标（alt 米，缺省按 0） */
export interface PathCoord3D {
  lng: number
  lat: number
  alt: number
}

export interface PathStats {
  totalDistance: number
  estimatedTime: number
  pointCount: number
  avgSpeed: number
  startCoord: string
  endCoord: string
}

export const calculatePathStats = (flatPathCoords: PathCoord3D[]): PathStats => {
  if (flatPathCoords.length < 2) {
    return {
      totalDistance: 0,
      estimatedTime: 0,
      pointCount: 0,
      avgSpeed: 10,
      startCoord: '',
      endCoord: ''
    }
  }
  
  let totalDistance = 0
  
  // 计算总距离（水平 + 高度变化的三维折线长）
  for (let i = 1; i < flatPathCoords.length; i++) {
    const prev = flatPathCoords[i - 1]
    const curr = flatPathCoords[i]
    const horiz = getDistanceFromLatLonInMeters(prev.lat, prev.lng, curr.lat, curr.lng)
    const za = prev.alt ?? 0
    const zb = curr.alt ?? 0
    const dv = zb - za
    totalDistance += Math.sqrt(horiz * horiz + dv * dv)
  }
  
  const avgSpeed = 10 // 默认 10 m/s
  const estimatedTime = totalDistance / avgSpeed
  
  return {
    totalDistance: Math.round(totalDistance),
    estimatedTime: Math.round(estimatedTime),
    pointCount: flatPathCoords.length,
    avgSpeed: avgSpeed,
    startCoord: `${flatPathCoords[0].lat.toFixed(6)}, ${flatPathCoords[0].lng.toFixed(6)} · ${(flatPathCoords[0].alt ?? 0).toFixed(0)} m`,
    endCoord: `${flatPathCoords[flatPathCoords.length - 1].lat.toFixed(6)}, ${flatPathCoords[flatPathCoords.length - 1].lng.toFixed(6)} · ${(flatPathCoords[flatPathCoords.length - 1].alt ?? 0).toFixed(0)} m`
  }
}

/**
 * 扁平化路径坐标（始终带 alt，缺省为 0）
 */
export const flattenPathCoordinates = (pathPoints: any[]): PathCoord3D[] => {
  const coords: PathCoord3D[] = []
  
  pathPoints.forEach(point => {
    const lng = Number(
      point.lng ?? (typeof point.getLongitude === 'function' ? point.getLongitude() : point.lng)
    )
    const lat = Number(
      point.lat ?? (typeof point.getLatitude === 'function' ? point.getLatitude() : point.lat)
    )
    const altRaw = point.alt ?? point.height ?? point.elevation
    const alt = altRaw != null && !Number.isNaN(Number(altRaw)) ? Number(altRaw) : 0
    coords.push({ lng, lat, alt })
  })
  
  return coords
}

/**
 * 获取算法对应的颜色
 */
export const getAlgorithmColor = (algorithmName: string): string => {
  switch (algorithmName) {
    case 'A*算法':
      return '#10B981' // 绿色
    case '迪杰斯特拉算法':
      return '#3B82F6' // 蓝色
    case '蚁群算法':
      return '#F59E0B' // 橙色
    case '强化学习模型':
    case '强化学习':
      return '#8B5CF6' // 紫色
    case '遗传算法':
      return '#F97316'
    default:
      return '#4D4FC3' // 默认蓝色
  }
}

/**
 * 算法对比分析
 */
export interface AlgorithmComparison {
  name: string
  distance: number
  time: number
  points: number
  pathPoints: any[]
}

export interface Recommendation {
  algorithm: string
  score: number
  reasons: string[]
  advantages: string[]
}

export interface CompareResults {
  astar: AlgorithmComparison
  dijkstra: AlgorithmComparison
  recommendation: Recommendation | null
}

export const analyzeAndRecommend = (astar: AlgorithmComparison, dijkstra: AlgorithmComparison): CompareResults => {
  // 综合评分（距离权重 60%，时间权重 30%，点数权重 10%）
  const astarScore = (
    astar.distance * 0.6 +
    astar.time * 0.3 +
    astar.points * 0.1
  )
  
  const dijkstraScore = (
    dijkstra.distance * 0.6 +
    dijkstra.time * 0.3 +
    dijkstra.points * 0.1
  )
  
  // 归一化评分（越小越好）
  const astarNormalized = astarScore / (astarScore + dijkstraScore)
  const dijkstraNormalized = dijkstraScore / (astarScore + dijkstraScore)
  
  // 生成推荐理由
  let reason: string[] = []
  
  if (astar.distance < dijkstra.distance) {
    reason.push(`A*距离更短（-${Math.round(dijkstra.distance - astar.distance)}米）`)
  } else if (dijkstra.distance < astar.distance) {
    reason.push(`Dijkstra 距离更短（-${Math.round(astar.distance - dijkstra.distance)}米）`)
  } else {
    reason.push('距离相同')
  }
  
  if (astar.time < dijkstra.time) {
    reason.push(`A*时间更省（-${dijkstra.time - astar.time}秒）`)
  } else if (dijkstra.time < astar.time) {
    reason.push(`Dijkstra 时间更省（-${astar.time - dijkstra.time}秒）`)
  } else {
    reason.push('时间相同')
  }
  
  if (astar.points < dijkstra.points) {
    reason.push(`A*路径更简洁（少${dijkstra.points - astar.points}个点）`)
  } else if (dijkstra.points < astar.points) {
    reason.push(`Dijkstra 路径更简洁（少${astar.points - dijkstra.points}个点）`)
  } else {
    reason.push('路径点数相同')
  }
  
  // 推荐最佳路径
  const recommended = astarNormalized < dijkstraNormalized ? 'astar' : 'dijkstra'
  
  return {
    astar,
    dijkstra,
    recommendation: {
      algorithm: recommended === 'astar' ? 'A*算法' : '迪杰斯特拉算法',
      score: recommended === 'astar' ? astarNormalized : dijkstraNormalized,
      reasons: reason,
      advantages: recommended === 'astar' 
        ? ['综合评分更优', ...reason.filter(r => r.includes('A*'))]
        : ['综合评分更优', ...reason.filter(r => r.includes('Dijkstra'))]
    }
  }
}
