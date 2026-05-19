/**
 * ECharts 图表初始化工具
 */

import type { Ref } from 'vue'
import { getDistanceFromLatLonInMeters, type PathCoord3D } from './pathCalculator'

export const initDistanceChart = (
  chartContainer: HTMLElement | null,
  flatPathCoords: PathCoord3D[],
  distanceChartRef: any
) => {
  if (!chartContainer || flatPathCoords.length === 0) return
  
  // 动态导入 ECharts
  import('echarts').then((echarts) => {
    // 计算距离累积数据
    const distances = [0]
    for (let i = 1; i < flatPathCoords.length; i++) {
      const prev = flatPathCoords[i - 1]
      const curr = flatPathCoords[i]
      const horiz = getDistanceFromLatLonInMeters(prev.lat, prev.lng, curr.lat, curr.lng)
      const dv = (curr.alt ?? 0) - (prev.alt ?? 0)
      const dist = Math.sqrt(horiz * horiz + dv * dv)
      distances.push(distances[i - 1] + dist)
    }
    
    // 销毁旧图表
    if (distanceChartRef) {
      distanceChartRef.dispose()
    }
    
    // 创建新图表
    const chart = echarts.init(chartContainer)
    
    const option = {
      title: {
        text: '路径距离累积曲线',
        left: 'center',
        textStyle: {
          color: '#333',
          fontSize: 14,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'axis',
        formatter: function(params: any) {
          const point = flatPathCoords[params[0].dataIndex]
          return `
            <div style="font-weight:bold;">点 #${params[0].dataIndex}</div>
            经度：${point.lng.toFixed(6)}<br/>
            纬度：${point.lat.toFixed(6)}<br/>
            高度：${(point.alt ?? 0).toFixed(1)} m<br/>
            累计距离：${params[0].value.toFixed(1)} m
          `
        }
      },
      xAxis: {
        type: 'category',
        name: '路径点索引',
        nameLocation: 'middle',
        nameGap: 25,
        data: distances.map((_, i) => i),
        axisLabel: {
          color: '#666'
        }
      },
      yAxis: {
        type: 'value',
        name: '累计距离 (米)',
        axisLabel: {
          color: '#666',
          formatter: '{value} m'
        },
        splitLine: {
          lineStyle: {
            color: '#eee'
          }
        }
      },
      series: [{
        name: '累计距离',
        type: 'line',
        data: distances,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#4D4FC3'
        },
        lineStyle: {
          width: 3,
          color: '#4D4FC3'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(77, 79, 195, 0.3)' },
            { offset: 1, color: 'rgba(77, 79, 195, 0.05)' }
          ])
        }
      }],
      grid: {
        left: '10%',
        right: '5%',
        bottom: '10%',
        top: '15%'
      }
    }
    
    chart.setOption(option)
    
    return chart
  }).catch(err => {
    console.error('加载 ECharts 失败:', err)
  })
}
