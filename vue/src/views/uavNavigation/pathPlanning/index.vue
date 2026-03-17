<script setup lang="ts">
import { ref, onMounted, watch } from "vue"
import { selectUavList } from '@/api/system/uav.js'

// 地图实例
const map = ref(null)
const mapContainer = ref(null)

// 路径规划相关数据
const startPoint = ref('南昌市市政府')
const endPoint = ref('南昌市秋水广场')
const selectedUav = ref(null)
const selectedAlgorithm = ref('强化学习模型')
const uavList = ref([])
const pathPoints = ref([])
const pathPolyline = ref(null)
const startMarker = ref(null)
const endMarker = ref(null)

// 算法选择列表
const algorithmList = [
  { label: '强化学习模型', value: '强化学习模型' },
  { label: 'A*算法', value: 'A*算法' },
  { label: '迪杰斯特拉算法', value: '迪杰斯特拉算法' },
  { label: '蚁群算法', value: '蚁群算法' }
]

// 初始化地图
const initMap = () => {
  if (typeof BMap !== 'undefined') {
    // 创建地图实例
    map.value = new BMap.Map(mapContainer.value)
    // 设置南昌为中心
    const point = new BMap.Point(115.892151, 28.676493)
    map.value.centerAndZoom(point, 13)
    // 启用滚轮缩放
    map.value.enableScrollWheelZoom(true)
    // 添加控件
    map.value.addControl(new BMap.NavigationControl())
    map.value.addControl(new BMap.ScaleControl())
  }
}

// 加载无人机列表
const loadUavList = async () => {
  try {
    const response = await selectUavList({ pageNum: 1, pageSize: 100 })
    uavList.value = response.rows || []
  } catch (error) {
    console.error('加载无人机列表失败:', error)
  }
}

// 路径规划
const planPath = async () => {
  if (!startPoint.value || !endPoint.value) {
    alert('请输入起始地点和终点')
    return
  }

  if (!selectedUav.value) {
    alert('请选择无人机')
    return
  }

  // 清除之前的路径和标记
  clearPath()

  // 使用百度地图API进行地理编码
  const geocoder = new BMap.Geocoder()

  // 编码起点
  geocoder.getPoint(startPoint.value, (startPointObj) => {
    if (startPointObj) {
      // 编码终点
      geocoder.getPoint(endPoint.value, (endPointObj) => {
        if (endPointObj) {
          // 添加起点标记
          startMarker.value = new BMap.Marker(startPointObj)
          map.value.addOverlay(startMarker.value)
          
          // 添加终点标记
          endMarker.value = new BMap.Marker(endPointObj)
          map.value.addOverlay(endMarker.value)
          
          // 计算两点之间的路径
          calculatePath(startPointObj, endPointObj)
        } else {
          alert('终点地址解析失败')
        }
      }, '南昌市')
    } else {
      alert('起点地址解析失败')
    }
  }, '南昌市')
}

// 计算路径
const calculatePath = (start, end) => {
  // 使用百度地图路线规划API
  const driving = new BMap.DrivingRoute(map.value, {
    renderOptions: { map: map.value, autoViewport: true },
    onSearchComplete: (results) => {
      if (driving.getStatus() === BMAP_STATUS_SUCCESS) {
        const plan = results.getPlan(0)
        const route = plan.getRoute(0)
        
        // 提取路径点
        pathPoints.value = []
        for (let i = 0; i < route.getNumPoints(); i++) {
          pathPoints.value.push(route.getPoint(i))
        }
        
        // 创建路径线
        pathPolyline.value = new BMap.Polyline(pathPoints.value, {
          strokeColor: '#4D4FC3',
          strokeWeight: 5,
          strokeOpacity: 0.8
        })
        map.value.addOverlay(pathPolyline.value)
        
        // 模拟无人机飞行
        simulateFlight()
      }
    }
  })
  
  driving.search(start, end)
}

// 模拟无人机飞行
const simulateFlight = () => {
  if (!pathPoints.value || pathPoints.value.length === 0) return
  
  // 创建无人机标记
  const uavMarker = new BMap.Marker(pathPoints.value[0])
  map.value.addOverlay(uavMarker)
  
  let index = 0
  const flyInterval = setInterval(() => {
    index++
    if (index < pathPoints.value.length) {
      uavMarker.setPosition(pathPoints.value[index])
    } else {
      clearInterval(flyInterval)
    }
  }, 200)
}

// 清除路径
const clearPath = () => {
  if (pathPolyline.value) {
    map.value.removeOverlay(pathPolyline.value)
    pathPolyline.value = null
  }
  
  if (startMarker.value) {
    map.value.removeOverlay(startMarker.value)
    startMarker.value = null
  }
  
  if (endMarker.value) {
    map.value.removeOverlay(endMarker.value)
    endMarker.value = null
  }
  
  pathPoints.value = []
}

// 选择最合适的无人机
const selectBestUav = () => {
  if (!pathPoints.value || pathPoints.value.length === 0) {
    alert('请先规划路径')
    return
  }
  
  // 计算路径距离
  let distance = 0
  for (let i = 0; i < pathPoints.value.length - 1; i++) {
    distance += map.value.getDistance(pathPoints.value[i], pathPoints.value[i + 1])
  }
  
  // 转换为公里
  distance = distance / 1000
  
  // 根据距离选择最合适的无人机
  let bestUav = null
  let maxFlightTime = 0
  
  uavList.value.forEach(uav => {
    // 假设无人机的最大飞行时间可以覆盖路径距离
    // 这里简化处理，实际应该根据无人机的续航时间和速度来计算
    if (uav.uavMaxFlightTime && uav.uavMaxFlightTime > maxFlightTime) {
      maxFlightTime = uav.uavMaxFlightTime
      bestUav = uav
    }
  })
  
  if (bestUav) {
    selectedUav.value = bestUav.uavId
    alert(`根据路径距离 ${distance.toFixed(2)} 公里，推荐使用无人机: ${bestUav.uavModel}`)
  } else {
    alert('没有找到合适的无人机')
  }
}

// 组件挂载时初始化
onMounted(() => {
  // 等待百度地图API加载完成
  setTimeout(() => {
    initMap()
  }, 500)
  
  // 加载无人机列表
  loadUavList()
})
</script>

<template>
  <div class="app-container">
    <h1 class="art-text">路径规划</h1>
    
    <!-- 路径规划表单 -->
    <div class="card fade-in">
      <div class="path-form">
        <el-form :model="{
          startPoint: startPoint,
          endPoint: endPoint,
          uavId: selectedUav,
          algorithm: selectedAlgorithm
        }" label-width="120px">
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="起始地点">
                <el-input v-model="startPoint" placeholder="请输入起始地点，如：南昌市市政府" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="终点">
                <el-input v-model="endPoint" placeholder="请输入终点，如：南昌市秋水广场" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="无人机种类">
                <el-select v-model="selectedUav" placeholder="请选择无人机">
                  <el-option 
                    v-for="uav in uavList" 
                    :key="uav.uavId" 
                    :label="uav.uavModel" 
                    :value="uav.uavId" 
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="路径规划算法">
                <el-select v-model="selectedAlgorithm" placeholder="请选择算法">
                  <el-option 
                    v-for="algorithm in algorithmList" 
                    :key="algorithm.value" 
                    :label="algorithm.label" 
                    :value="algorithm.value" 
                  />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row>
            <el-col :span="24" style="text-align: center;">
              <el-button type="primary" @click="planPath" class="action-button primary">规划路径</el-button>
              <el-button @click="selectBestUav" class="action-button success">选择最佳无人机</el-button>
              <el-button @click="clearPath" class="action-button danger">清除路径</el-button>
            </el-col>
          </el-row>
        </el-form>
      </div>
    </div>
    
    <!-- 地图展示 -->
    <div class="card fade-in" style="margin-top: 20px;">
      <div class="map-container" ref="mapContainer"></div>
    </div>
  </div>
</template>

<style scoped>
/* 表单样式 */
.path-form {
  padding: 20px;
}

/* 地图容器样式 */
.map-container {
  width: 100%;
  height: 600px;
  border-radius: 8px;
  overflow: hidden;
}

/* 操作按钮样式 */
.action-button {
  border-radius: 8px;
  font-weight: 500;
  transition: var(--transition);
  margin: 0 10px;
}

.action-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.action-button.primary:hover {
  box-shadow: 0 4px 12px rgba(77, 79, 200, 0.3);
}

.action-button.success:hover {
  box-shadow: 0 4px 12px rgba(102, 187, 106, 0.3);
}

.action-button.danger:hover {
  box-shadow: 0 4px 12px rgba(244, 67, 54, 0.3);
}

/* 动画效果 */
.fade-in {
  animation: fadeIn 0.5s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .el-row {
    flex-direction: column;
  }
  
  .el-col {
    width: 100% !important;
  }
  
  .map-container {
    height: 400px;
  }
  
  .action-button {
    margin: 5px;
  }
}
</style>