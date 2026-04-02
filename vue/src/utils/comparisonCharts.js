/**
 * ECharts 图表可视化模块
 * 用于算法对比的雷达图、柱状图等
 */
import * as echarts from 'echarts'

/**
 * 初始化雷达图 - 对比两种算法的综合性能
 * @param {HTMLElement} dom - 图表容器
 * @param {Object} astarMetrics - A*算法指标
 * @param {Object} dijkstraMetrics - Dijkstra 算法指标
 * @returns {ECharts} chart 实例
 */
export const initRadarChart = (dom, astarMetrics, dijkstraMetrics) => {
  if (!dom) return null

  const chart = echarts.init(dom)

  // 归一化数据到 0-100 分
  const normalizeScore = (value, max, inverse = false) => {
    if (value === 0) return 100
    const score = inverse ? (1 - value / max) * 100 : (value / max) * 100
    return Math.max(0, Math.min(100, score))
  }

  // 找出最大值用于归一化
  const maxDistance = Math.max(astarMetrics.distance, dijkstraMetrics.distance) || 1
  const maxTime = Math.max(astarMetrics.time, dijkstraMetrics.time) || 1
  const maxPoints = Math.max(astarMetrics.points, dijkstraMetrics.points) || 1
  const maxComputation = Math.max(astarMetrics.computationTime, dijkstraMetrics.computationTime) || 1
  
  const astarScores = {
    distance: normalizeScore(astarMetrics.distance, maxDistance, true),
    time: normalizeScore(astarMetrics.time, maxTime, true),
    points: normalizeScore(astarMetrics.points, maxPoints, true),
    computation: normalizeScore(astarMetrics.computationTime, maxComputation, true),
    smoothness: astarMetrics.smoothness || 50,
    efficiency: calculateEfficiencyScore(astarMetrics)
  }

  const dijkstraScores = {
    distance: normalizeScore(dijkstraMetrics.distance, maxDistance, true),
    time: normalizeScore(dijkstraMetrics.time, maxTime, true),
    points: normalizeScore(dijkstraMetrics.points, maxPoints, true),
    computation: normalizeScore(dijkstraMetrics.computationTime, maxComputation, true),
    smoothness: dijkstraMetrics.smoothness || 50,
    efficiency: calculateEfficiencyScore(dijkstraMetrics)
  }

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: function(params) {
        return `${params.seriesName}<br/>${params.name}: ${params.value.toFixed(1)}分`
      }
    },
    legend: {
      data: ['A*算法', '迪杰斯特拉算法'],
      bottom: 10,
      textStyle: {
        fontSize: 14,
        fontWeight: 'bold'
      }
    },
    radar: {
      indicator: [
        { name: '路径长度', max: 100 },
        { name: '飞行时间', max: 100 },
        { name: '路径点数', max: 100 },
        { name: '计算速度', max: 100 },
        { name: '平滑度', max: 100 },
        { name: '综合效率', max: 100 }
      ],
      center: ['50%', '45%'],
      radius: '65%',
      axisName: {
        color: '#666',
        fontSize: 13,
        fontWeight: 'bold'
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(102, 126, 234, 0.2)'
        }
      },
      splitArea: {
        show: true,
        areaStyle: {
          color: ['rgba(102, 126, 234, 0.02)', 'rgba(102, 126, 234, 0.05)']
        }
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(102, 126, 234, 0.3)'
        }
      }
    },
    series: [{
      name: '算法对比',
      type: 'radar',
      data: [
        {
          value: [
            astarScores.distance,
            astarScores.time,
            astarScores.points,
            astarScores.computation,
            astarScores.smoothness,
            astarScores.efficiency
          ],
          name: 'A*算法',
          itemStyle: {
            color: '#10B981'
          },
          areaStyle: {
            color: 'rgba(16, 185, 129, 0.3)'
          },
          lineStyle: {
            width: 3
          }
        },
        {
          value: [
            dijkstraScores.distance,
            dijkstraScores.time,
            dijkstraScores.points,
            dijkstraScores.computation,
            dijkstraScores.smoothness,
            dijkstraScores.efficiency
          ],
          name: '迪杰斯特拉算法',
          itemStyle: {
            color: '#3B82F6'
          },
          areaStyle: {
            color: 'rgba(59, 130, 246, 0.3)'
          },
          lineStyle: {
            width: 3
          }
        }
      ]
    }]
  }

  chart.setOption(option)
  
  // 响应式调整
  window.addEventListener('resize', () => {
    chart.resize()
  })

  return chart
}

/**
 * 计算综合效率得分
 */
const calculateEfficiencyScore = (metrics) => {
  const distanceScore = metrics.distance > 0 ? (1000 / metrics.distance) * 10 : 50
  const timeScore = metrics.time > 0 ? (1000 / metrics.time) * 10 : 50
  const computationScore = metrics.computationTime > 0 ? (100 / metrics.computationTime) * 10 : 50
  
  return Math.min(100, (distanceScore + timeScore + computationScore) / 3)
}

/**
 * 初始化柱状对比图 - 详细对比各项指标
 * @param {HTMLElement} dom - 图表容器
 * @param {Array} tableData - 表格数据
 * @returns {ECharts} chart 实例
 */
export const initBarChart = (dom, tableData) => {
  if (!dom) return null

  const chart = echarts.init(dom)

  const categories = tableData.map(item => item.metric)
  const astarValues = tableData.map(item => parseFloat(item.astar.value) || 0)
  const dijkstraValues = tableData.map(item => parseFloat(item.dijkstra.value) || 0)

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      formatter: function(params) {
        let result = params[0].name + '<br/>'
        params.forEach(param => {
          const unit = tableData.find(item => item.metric === param.name)?.astar?.unit || ''
          result += `${param.marker}${param.seriesName}: ${param.value} ${unit}<br/>`
        })
        return result
      }
    },
    legend: {
      data: ['A*算法', '迪杰斯特拉算法'],
      top: 10,
      textStyle: {
        fontSize: 14,
        fontWeight: 'bold'
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisTick: {
        alignWithLabel: true
      },
      axisLabel: {
        interval: 0,
        rotate: 0,
        fontSize: 13,
        fontWeight: 'bold',
        color: '#4D4FC3'
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        fontSize: 12,
        color: '#666'
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      }
    },
    series: [
      {
        name: 'A*算法',
        type: 'bar',
        barWidth: '35%',
        data: astarValues,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#10B981' },
            { offset: 1, color: '#059669' }
          ]),
          borderRadius: [8, 8, 0, 0]
        }
      },
      {
        name: '迪杰斯特拉算法',
        type: 'bar',
        barWidth: '35%',
        data: dijkstraValues,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#3B82F6' },
            { offset: 1, color: '#2563EB' }
          ]),
          borderRadius: [8, 8, 0, 0]
        }
      }
    ]
  }

  chart.setOption(option)
  
  window.addEventListener('resize', () => {
    chart.resize()
  })

  return chart
}

/**
 * 初始化百分比堆叠柱状图 - 显示各维度占比
 * @param {HTMLElement} dom - 图表容器
 * @param {Object} astarMetrics 
 * @param {Object} dijkstraMetrics 
 * @returns {ECharts} chart 实例
 */
export const initPercentageBarChart = (dom, astarMetrics, dijkstraMetrics) => {
  if (!dom) return null

  const chart = echarts.init(dom)

  // 计算各维度占比 (总和为 100%)
  const totalDistance = astarMetrics.distance + dijkstraMetrics.distance || 1
  const totalTime = astarMetrics.time + dijkstraMetrics.time || 1
  const totalPoints = astarMetrics.points + dijkstraMetrics.points || 1
  const totalComputation = astarMetrics.computationTime + dijkstraMetrics.computationTime || 1

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      formatter: '{b}<br/>{a}: {c}%<br/>{seriesName}: {c}%'
    },
    legend: {
      data: ['A*算法', '迪杰斯特拉算法'],
      top: 10
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['总距离', '预计时间', '路径点数', '计算耗时'],
      axisLabel: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#4D4FC3'
      }
    },
    yAxis: {
      type: 'value',
      max: 100,
      axisLabel: {
        formatter: '{value}%'
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      }
    },
    series: [
      {
        name: 'A*算法',
        type: 'bar',
        stack: 'total',
        barWidth: '40%',
        label: {
          show: true,
          position: 'inside',
          formatter: '{c}%',
          fontSize: 12,
          color: '#fff'
        },
        data: [
          ((astarMetrics.distance / totalDistance) * 100).toFixed(1),
          ((astarMetrics.time / totalTime) * 100).toFixed(1),
          ((astarMetrics.points / totalPoints) * 100).toFixed(1),
          ((astarMetrics.computationTime / totalComputation) * 100).toFixed(1)
        ],
        itemStyle: {
          color: '#10B981',
          borderRadius: [4, 4, 0, 0]
        }
      },
      {
        name: '迪杰斯特拉算法',
        type: 'bar',
        stack: 'total',
        barWidth: '40%',
        label: {
          show: true,
          position: 'inside',
          formatter: '{c}%',
          fontSize: 12,
          color: '#fff'
        },
        data: [
          ((dijkstraMetrics.distance / totalDistance) * 100).toFixed(1),
          ((dijkstraMetrics.time / totalTime) * 100).toFixed(1),
          ((dijkstraMetrics.points / totalPoints) * 100).toFixed(1),
          ((dijkstraMetrics.computationTime / totalComputation) * 100).toFixed(1)
        ],
        itemStyle: {
          color: '#3B82F6',
          borderRadius: [0, 0, 4, 4]
        }
      }
    ]
  }

  chart.setOption(option)
  
  window.addEventListener('resize', () => {
    chart.resize()
  })

  return chart
}

/**
 * 销毁图表实例
 * @param {ECharts} chart 
 */
export const disposeChart = (chart) => {
  if (chart) {
    chart.dispose()
  }
}

/**
 * 默认导出所有方法
 */
export default {
  initRadarChart,
  initBarChart,
  initPercentageBarChart,
  disposeChart
}
