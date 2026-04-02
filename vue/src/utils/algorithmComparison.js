/**
 * 算法对比分析模块
 * 提供 A*算法和 Dijkstra 算法的性能对比、差异分析和可视化
 */

/**
 * 算法性能指标接口
 */
export class AlgorithmMetrics {
  constructor(algorithmName) {
    this.algorithmName = algorithmName
    this.distance = 0           // 总距离 (米)
    this.time = 0               // 预计时间 (秒)
    this.points = 0             // 路径点数
    this.computationTime = 0    // 计算耗时 (毫秒)
    this.memoryUsage = 0        // 内存使用 (KB，估算)
    this.expandedNodes = 0      // 扩展节点数
    this.turnCount = 0          // 转弯次数
    this.smoothness = 0         // 平滑度评分 (0-100)
  }
}

/**
 * 对比两个算法的性能指标
 * @param {AlgorithmMetrics} astarMetrics - A*算法指标
 * @param {AlgorithmMetrics} dijkstraMetrics - Dijkstra 算法指标
 * @returns {Object} 对比结果
 */
export const compareAlgorithms = (astarMetrics, dijkstraMetrics) => {
  const comparison = {
    distanceComparison: {
      better: astarMetrics.distance <= dijkstraMetrics.distance ? 'A*' : 'Dijkstra',
      difference: Math.abs(astarMetrics.distance - dijkstraMetrics.distance),
      percentage: calculatePercentageDifference(astarMetrics.distance, dijkstraMetrics.distance)
    },
    timeComparison: {
      better: astarMetrics.time <= dijkstraMetrics.time ? 'A*' : 'Dijkstra',
      difference: Math.abs(astarMetrics.time - dijkstraMetrics.time),
      percentage: calculatePercentageDifference(astarMetrics.time, dijkstraMetrics.time)
    },
    pointsComparison: {
      better: astarMetrics.points <= dijkstraMetrics.points ? 'A*' : 'Dijkstra',
      difference: Math.abs(astarMetrics.points - dijkstraMetrics.points),
      percentage: calculatePercentageDifference(astarMetrics.points, dijkstraMetrics.points)
    },
    computationComparison: {
      better: astarMetrics.computationTime <= dijkstraMetrics.computationTime ? 'A*' : 'Dijkstra',
      difference: Math.abs(astarMetrics.computationTime - dijkstraMetrics.computationTime),
      percentage: calculatePercentageDifference(astarMetrics.computationTime, dijkstraMetrics.computationTime)
    },
    smoothnessComparison: {
      better: astarMetrics.smoothness >= dijkstraMetrics.smoothness ? 'A*' : 'Dijkstra',
      difference: Math.abs(astarMetrics.smoothness - dijkstraMetrics.smoothness)
    }
  }
  
  return comparison
}

/**
 * 计算百分比差异
 */
const calculatePercentageDifference = (value1, value2) => {
  if (value1 === 0 && value2 === 0) return 0
  const avg = (value1 + value2) / 2
  const diff = Math.abs(value1 - value2)
  return ((diff / avg) * 100).toFixed(2)
}

/**
 * 生成算法优缺点分析报告
 * @param {AlgorithmMetrics} astarMetrics 
 * @param {AlgorithmMetrics} dijkstraMetrics 
 * @returns {Object} 分析报告
 */
export const generateAnalysisReport = (astarMetrics, dijkstraMetrics) => {
  const comparison = compareAlgorithms(astarMetrics, dijkstraMetrics)
  
  const report = {
    astar: {
      advantages: [],
      disadvantages: [],
      bestFor: []
    },
    dijkstra: {
      advantages: [],
      disadvantages: [],
      bestFor: []
    },
    recommendation: null
  }
  
  // A*算法分析
  if (comparison.distanceComparison.better === 'A*') {
    report.astar.advantages.push(`路径更短，节省${comparison.distanceComparison.percentage}%的距离`)
  } else {
    report.astar.disadvantages.push(`路径较长，比 Dijkstra 多${comparison.distanceComparison.percentage}%`)
  }
  
  if (comparison.computationComparison.better === 'A*') {
    report.astar.advantages.push(`计算更快，耗时少${comparison.computationComparison.percentage}%`)
    report.astar.bestFor.push('实时性要求高的场景')
  }
  
  if (comparison.smoothnessComparison.better === 'A*') {
    report.astar.advantages.push(`路径更平滑，转弯更少`)
    report.astar.bestFor.push('需要平稳飞行的任务')
  }
  
  report.astar.advantages.push('启发式搜索，效率高')
  report.astar.disadvantages.push('依赖启发函数的质量')
  report.astar.bestFor.push('已知目标点的路径规划')
  
  // Dijkstra 算法分析
  if (comparison.distanceComparison.better === 'Dijkstra') {
    report.dijkstra.advantages.push(`路径更短，节省${comparison.distanceComparison.percentage}%的距离`)
  } else {
    report.dijkstra.disadvantages.push(`路径较长，比 A*多${comparison.distanceComparison.percentage}%`)
  }
  
  if (comparison.computationComparison.better === 'Dijkstra') {
    report.dijkstra.advantages.push(`计算更快，耗时少${comparison.computationComparison.percentage}%`)
  }
  
  if (comparison.smoothnessComparison.better === 'Dijkstra') {
    report.dijkstra.advantages.push(`路径更平滑，转弯更少`)
    report.dijkstra.bestFor.push('需要平稳飞行的任务')
  }
  
  report.dijkstra.advantages.push('保证找到全局最优解')
  report.dijkstra.disadvantages.push('遍历所有节点，计算量大')
  report.dijkstra.bestFor.push('对最优路径要求严格的场景')
  report.dijkstra.bestFor.push('未知目标点的探索性搜索')
  
  // 综合推荐
  const scoreAstar = calculateOverallScore(astarMetrics, comparison)
  const scoreDijkstra = calculateOverallScore(dijkstraMetrics, comparison)
  
  report.recommendation = {
    algorithm: scoreAstar >= scoreDijkstra ? 'A*算法' : '迪杰斯特拉算法',
    confidence: Math.max(scoreAstar, scoreDijkstra),
    reasons: generateRecommendationReasons(comparison, scoreAstar, scoreDijkstra)
  }
  
  return report
}

/**
 * 计算综合得分
 */
const calculateOverallScore = (metrics, comparison) => {
  let score = 50
  
  // 距离权重 30%
  if (comparison.distanceComparison.better === metrics.algorithmName) {
    score += 15
  }
  
  // 时间权重 25%
  if (comparison.timeComparison.better === metrics.algorithmName) {
    score += 12
  }
  
  // 计算速度权重 25%
  if (comparison.computationComparison.better === metrics.algorithmName) {
    score += 12
  }
  
  // 平滑度权重 20%
  if (comparison.smoothnessComparison.better === metrics.algorithmName) {
    score += 10
  }
  
  return score
}

/**
 * 生成推荐理由
 */
const generateRecommendationReasons = (comparison, scoreAstar, scoreDijkstra) => {
  const reasons = []
  
  if (Math.abs(scoreAstar - scoreDijkstra) < 5) {
    reasons.push('两种算法表现相当，可根据具体需求选择')
  }
  
  if (comparison.distanceComparison.percentage > 10) {
    reasons.push(`${comparison.distanceComparison.better}在距离上有显著优势 (${comparison.distanceComparison.percentage}%)`)
  }
  
  if (comparison.computationComparison.percentage > 20) {
    reasons.push(`${comparison.computationComparison.better}在计算速度上优势明显 (${comparison.computationComparison.percentage}%)`)
  }
  
  if (comparison.smoothnessComparison.difference > 10) {
    reasons.push(`${comparison.smoothnessComparison.better}的路径更加平滑`)
  }
  
  reasons.push('综合考虑路径长度、计算效率和平滑度')
  
  return reasons
}

/**
 * 计算路径平滑度（基于转弯次数和角度）
 * @param {Array} pathPoints - 路径点数组
 * @returns {Number} 平滑度评分 (0-100)
 */
export const calculateSmoothness = (pathPoints) => {
  if (!pathPoints || pathPoints.length < 3) return 50
  
  let totalTurnAngle = 0
  let turnCount = 0
  
  for (let i = 1; i < pathPoints.length - 1; i++) {
    const prev = pathPoints[i - 1]
    const curr = pathPoints[i]
    const next = pathPoints[i + 1]
    
    // 计算向量
    const v1 = { x: curr.lng - prev.lng, y: curr.lat - prev.lat }
    const v2 = { x: next.lng - curr.lng, y: next.lat - curr.lat }
    
    // 计算夹角
    const angle = calculateAngleBetweenVectors(v1, v2)
    
    // 如果转弯角度超过 15 度，计为一次转弯
    if (Math.abs(angle) > 15) {
      turnCount++
      totalTurnAngle += Math.abs(angle)
    }
  }
  
  // 平滑度评分：转弯越少、角度越小，评分越高
  const baseScore = 100
  const turnPenalty = turnCount * 5
  const anglePenalty = totalTurnAngle * 0.5
  
  return Math.max(0, Math.min(100, baseScore - turnPenalty - anglePenalty))
}

/**
 * 计算两个向量的夹角
 */
const calculateAngleBetweenVectors = (v1, v2) => {
  const dot = v1.x * v2.x + v1.y * v2.y
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y)
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y)
  
  if (mag1 === 0 || mag2 === 0) return 0
  
  const cosAngle = dot / (mag1 * mag2)
  const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI)
  
  return angle
}

/**
 * 估算内存使用量
 * @param {Number} expandedNodes - 扩展节点数
 * @returns {Number} 内存使用 (KB)
 */
export const estimateMemoryUsage = (expandedNodes) => {
  // 每个节点约占用 100 字节
  return (expandedNodes * 100) / 1024
}

/**
 * 生成对比表格数据
 * @param {AlgorithmMetrics} astarMetrics 
 * @param {AlgorithmMetrics} dijkstraMetrics 
 * @returns {Array} 表格数据行
 */
export const generateComparisonTableData = (astarMetrics, dijkstraMetrics) => {
  const comparison = compareAlgorithms(astarMetrics, dijkstraMetrics)
  
  return [
    {
      metric: '总距离',
      astar: { value: astarMetrics.distance, unit: '米', better: comparison.distanceComparison.better === 'A*' },
      dijkstra: { value: dijkstraMetrics.distance, unit: '米', better: comparison.distanceComparison.better === 'Dijkstra' }
    },
    {
      metric: '预计时间',
      astar: { value: astarMetrics.time, unit: '秒', better: comparison.timeComparison.better === 'A*' },
      dijkstra: { value: dijkstraMetrics.time, unit: '秒', better: comparison.timeComparison.better === 'Dijkstra' }
    },
    {
      metric: '路径点数',
      astar: { value: astarMetrics.points, unit: '个', better: comparison.pointsComparison.better === 'A*' },
      dijkstra: { value: dijkstraMetrics.points, unit: '个', better: comparison.pointsComparison.better === 'Dijkstra' }
    },
    {
      metric: '计算耗时',
      astar: { value: astarMetrics.computationTime, unit: 'ms', better: comparison.computationComparison.better === 'A*' },
      dijkstra: { value: dijkstraMetrics.computationTime, unit: 'ms', better: comparison.computationComparison.better === 'Dijkstra' }
    },
    {
      metric: '平滑度',
      astar: { value: astarMetrics.smoothness.toFixed(1), unit: '分', better: comparison.smoothnessComparison.better === 'A*' },
      dijkstra: { value: dijkstraMetrics.smoothness.toFixed(1), unit: '分', better: comparison.smoothnessComparison.better === 'Dijkstra' }
    },
    {
      metric: '转弯次数',
      astar: { value: astarMetrics.turnCount, unit: '次', better: astarMetrics.turnCount <= dijkstraMetrics.turnCount },
      dijkstra: { value: dijkstraMetrics.turnCount, unit: '次', better: dijkstraMetrics.turnCount < astarMetrics.turnCount }
    }
  ]
}

/**
 * 默认导出所有方法
 */
export default {
  AlgorithmMetrics,
  compareAlgorithms,
  generateAnalysisReport,
  calculateSmoothness,
  estimateMemoryUsage,
  generateComparisonTableData
}
