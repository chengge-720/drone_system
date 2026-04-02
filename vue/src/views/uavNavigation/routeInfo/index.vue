<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { initDistanceChart } from '@/utils/chartInit'

// 从 pathPlanning 传递过来的数据
interface PathPoint {
  lng: number
  lat: number
  alt?: number
}

interface AlgorithmResult {
  name: string
  distance: number
  time: number
  points: number
  pathPoints: PathPoint[]
}

interface CompareResults {
  astar: AlgorithmResult
  dijkstra: AlgorithmResult
  recommendation?: {
    algorithm: string
    score: number
    reasons: string[]
    advantages: string[]
  }
}

// 路径信息数据
const routeInfo = reactive({
  uavModel: '', // 无人机型号
  algorithm: '', // 使用的算法
  totalDistance: 0, // 总距离（米）
  estimatedTime: 0, // 预计时间（秒）
  pointCount: 0, // 路径点数
  startCoord: '', // 起点坐标
  endCoord: '', // 终点坐标
  waypoints: [] as PathPoint[], // 路径点
  compareResults: null as CompareResults | null // 对比结果
})

// 无人机参数
const droneParams = reactive({
  maxSpeed: 15, // 最大速度 m/s
  cruiseSpeed: 10, // 巡航速度 m/s
  maxAltitude: 120, // 最大高度 m
  batteryCapacity: 4500, // 电池容量 mAh
  batteryVoltage: 14.8 // 电池电压 V
})

// 图表引用
const chartContainer = ref(null)
const comparisonChartContainer = ref(null)
let distanceChart = null
let comparisonChart = null

// 初始化图表
const initCharts = () => {
  if (!chartContainer.value || routeInfo.waypoints.length === 0) return
  
  // 导入 ECharts
  import('echarts').then((echarts) => {
    // 计算距离累积数据
    const distances = [0]
    for (let i = 1; i < routeInfo.waypoints.length; i++) {
      const prev = routeInfo.waypoints[i - 1]
      const curr = routeInfo.waypoints[i]
      const dist = getDistanceFromLatLonInMeters(
        prev.lat, prev.lng,
        curr.lat, curr.lng
      )
      distances.push(distances[i - 1] + dist)
    }
    
    // 创建距离图表
    if (distanceChart) {
      distanceChart.dispose()
    }
    
    distanceChart = echarts.default.init(chartContainer.value)
    
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
          const point = routeInfo.waypoints[params[0].dataIndex]
          return `
            <div style="font-weight:bold;">点 #${params[0].dataIndex}</div>
            经度：${point.lng.toFixed(6)}<br/>
            纬度：${point.lat.toFixed(6)}<br/>
            累计距离：${params[0].value.toFixed(1)} m
          `
        }
      },
      xAxis: {
        type: 'index',
        name: '路径点索引',
        nameLocation: 'middle',
        nameGap: 25,
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
          color: new echarts.default.graphic.LinearGradient(0, 0, 0, 1, [
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
    
    distanceChart.setOption(option)
  })
}

// Haversine 公式计算两点间距离
const getDistanceFromLatLonInMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000
  const dLat = deg2rad(lat2 - lat1)
  const dLon = deg2rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

const deg2rad = (deg: number): number => {
  return deg * (Math.PI / 180)
}

// 导出路航数据
const exportRouteData = () => {
  const data = {
    routeInfo,
    droneParams,
    timestamp: new Date().toISOString()
  }
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `uav_route_${new Date().getTime()}.json`
  a.click()
  URL.revokeObjectURL(url)
  
  ElMessage.success('航路数据已导出')
}

// 监听窗口消息（从 pathPlanning 页面跳转过来时传递数据）
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'ROUTE_DATA') {
    const data = event.data.payload
    
    routeInfo.uavModel = data.uavModel || ''
    routeInfo.algorithm = data.algorithm || ''
    routeInfo.totalDistance = data.totalDistance || 0
    routeInfo.estimatedTime = data.estimatedTime || 0
    routeInfo.pointCount = data.pointCount || 0
    routeInfo.startCoord = data.startCoord || ''
    routeInfo.endCoord = data.endCoord || ''
    routeInfo.waypoints = data.waypoints || []
    routeInfo.compareResults = data.compareResults || null
    
    // 保存到 localStorage
    localStorage.setItem('uav_route_data', JSON.stringify(data))
    
    console.log('📊 接收到路径数据:', routeInfo)
    
    // 初始化图表
    setTimeout(() => {
      initCharts()
    }, 100)
    
    ElMessage.success('路径数据接收成功')
  }
})

// 从 localStorage 加载路径规划数据
const loadRouteData = () => {
  try {
    const savedData = localStorage.getItem('uav_route_data')
    if (savedData) {
      const data = JSON.parse(savedData)
      
      routeInfo.uavModel = data.uavModel || ''
      routeInfo.algorithm = data.algorithm || ''
      routeInfo.totalDistance = data.totalDistance || 0
      routeInfo.estimatedTime = data.estimatedTime || 0
      routeInfo.pointCount = data.pointCount || 0
      routeInfo.startCoord = data.startCoord || ''
      routeInfo.endCoord = data.endCoord || ''
      routeInfo.waypoints = data.waypoints || []
      routeInfo.compareResults = data.compareResults || null
      
      console.log('📊 加载路径数据:', routeInfo)
      
      // 初始化图表
      setTimeout(() => {
        initCharts()
      }, 100)
      
      ElMessage.success('路径数据加载成功')
    } else {
      ElMessage.warning('暂无路径数据，请先进行路径规划')
    }
  } catch (error) {
    console.error('加载路径数据失败:', error)
    ElMessage.error('加载路径数据失败')
  }
}
</script>

<template>
  <div class="route-info-container">
    <el-card class="route-card">
      <template #header>
        <div class="card-header">
          <span>无人机航路信息</span>
          <el-button type="primary" @click="exportRouteData">导出数据</el-button>
        </div>
      </template>
      
      <el-row :gutter="20">
        <!-- 基本信息 -->
        <el-col :span="12">
          <el-card class="info-card" shadow="hover">
            <template #header>
              <span>基本信息</span>
            </template>
            <div class="info-grid">
              <div class="info-item">
                <label>总航程:</label>
                <span class="value">{{ routeInfo.totalDistance }} 公里</span>
              </div>
              <div class="info-item">
                <label>预计飞行时间:</label>
                <span class="value">{{ Math.floor(routeInfo.estimatedTime/60) }} 分 {{ Math.round(routeInfo.estimatedTime%60) }} 秒</span>
              </div>
              <div class="info-item">
                <label>路径点数量:</label>
                <span class="value">{{ routeInfo.waypoints.length }} 个</span>
              </div>
              <div class="info-item">
                <label>平均高度:</label>
                <span class="value">{{ (routeInfo.waypoints.reduce((sum, p) => sum + p.alt, 0) / routeInfo.waypoints.length).toFixed(1) }} 米</span>
              </div>
            </div>
          </el-card>
        </el-col>
        
        <!-- 无人机参数 -->
        <el-col :span="12">
          <el-card class="info-card" shadow="hover">
            <template #header>
              <span>无人机参数</span>
            </template>
            <div class="info-grid">
              <div class="info-item">
                <label>巡航速度:</label>
                <span class="value">{{ droneParams.cruiseSpeed }} m/s</span>
              </div>
              <div class="info-item">
                <label>最大高度:</label>
                <span class="value">{{ droneParams.maxAltitude }} 米</span>
              </div>
              <div class="info-item">
                <label>电池容量:</label>
                <span class="value">{{ droneParams.batteryCapacity }} mAh</span>
              </div>
              <div class="info-item">
                <label>电池电压:</label>
                <span class="value">{{ droneParams.batteryVoltage }} V</span>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
      
      <!-- 路径点详情 -->
      <el-card class="waypoints-card" style="margin-top: 20px;">
        <template #header>
          <span>路径点详情</span>
        </template>
        <el-table :data="routeInfo.waypoints" style="width: 100%" stripe>
          <el-table-column prop="lng" label="经度" width="120">
            <template #default="scope">
              {{ scope.row.lng.toFixed(6) }}
            </template>
          </el-table-column>
          <el-table-column prop="lat" label="纬度" width="120">
            <template #default="scope">
              {{ scope.row.lat.toFixed(6) }}
            </template>
          </el-table-column>
          <el-table-column prop="alt" label="高度(米)" width="100">
            <template #default="scope">
              <el-tag type="success">{{ scope.row.alt }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="speed" label="速度(m/s)" width="100">
            <template #default="scope">
              <el-tag type="warning">{{ scope.row.speed }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="scope">
              <el-tag type="primary">待飞</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
      
      <!-- 图表展示区域 -->
      <el-row :gutter="20" style="margin-top: 20px;">
        <el-col :span="12">
          <el-card shadow="hover">
            <template #header>
              <span>高度剖面图</span>
            </template>
            <div class="chart-placeholder">
              <div class="chart-info">
                <p>📈 高度变化趋势</p>
                <p>最高点: {{ Math.max(...routeInfo.waypoints.map(p => p.alt)) }}米</p>
                <p>最低点: {{ Math.min(...routeInfo.waypoints.map(p => p.alt)) }}米</p>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card shadow="hover">
            <template #header>
              <span>速度剖面图</span>
            </template>
            <div class="chart-placeholder">
              <div class="chart-info">
                <p>🚀 速度变化趋势</p>
                <p>最高速度: {{ Math.max(...routeInfo.waypoints.map(p => p.speed)) }}m/s</p>
                <p>最低速度: {{ Math.min(...routeInfo.waypoints.map(p => p.speed)) }}m/s</p>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<style scoped>
.route-info-container {
  padding: 20px;
  background-color: #f5f7fa;
  min-height: 100vh;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.info-item {
  display: flex;
  align-items: center;
  padding: 8px 0;
}

.info-item label {
  font-weight: bold;
  color: #606266;
  width: 100px;
  margin-right: 10px;
}

.info-item .value {
  color: #303133;
  font-weight: 500;
}

.waypoints-card {
  :deep(.el-card__body) {
    padding: 0;
  }
}

.chart-placeholder {
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 4px;
  color: white;
}

.chart-info {
  text-align: center;
}

.chart-info p {
  margin: 5px 0;
  font-size: 14px;
}

.chart-info p:first-child {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 10px;
}

.info-card {
  :deep(.el-card__body) {
    padding: 20px;
  }
}

.route-card {
  :deep(.el-card__body) {
    padding: 20px;
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
  
  .card-header {
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
  }
  
  .card-header .el-button {
    width: 100%;
  }
}
</style>