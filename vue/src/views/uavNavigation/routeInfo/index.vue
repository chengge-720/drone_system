<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'

// 路径信息数据
const routeInfo = reactive({
  totalDistance: 0, // 总距离
  estimatedTime: 0, // 预计时间
  waypoints: [], // 路径点
  altitudeProfile: [], // 高度剖面
  speedProfile: [] // 速度剖面
})

// 无人机参数
const droneParams = reactive({
  maxSpeed: 15, // 最大速度 m/s
  cruiseSpeed: 10, // 巡航速度 m/s
  maxAltitude: 120, // 最大高度 m
  batteryCapacity: 4500, // 电池容量 mAh
  batteryVoltage: 14.8 // 电池电压 V
})

// 计算飞行参数
const calculateFlightParams = () => {
  // 模拟一些路径点数据
  routeInfo.waypoints = [
    { lng: 116.404, lat: 39.915, alt: 50, speed: 10 },
    { lng: 116.406, lat: 39.917, alt: 80, speed: 12 },
    { lng: 116.408, lat: 39.918, alt: 100, speed: 10 },
    { lng: 116.410, lat: 39.920, alt: 60, speed: 8 }
  ]
  
  // 计算总距离（简化计算）
  routeInfo.totalDistance = 2.5 // 公里
  
  // 计算预计时间
  routeInfo.estimatedTime = (routeInfo.totalDistance * 1000) / droneParams.cruiseSpeed // 秒
  
  // 生成高度剖面数据
  routeInfo.altitudeProfile = routeInfo.waypoints.map((point, index) => ({
    x: index,
    y: point.alt
  }))
  
  // 生成速度剖面数据
  routeInfo.speedProfile = routeInfo.waypoints.map((point, index) => ({
    x: index,
    y: point.speed
  }))
  
  ElMessage.success('飞行参数计算完成')
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

// 初始化
calculateFlightParams()
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