<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue"
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  MapLocation, RefreshRight, Delete, Document, Location, 
  Clock, Loading, VideoCamera, TrendCharts, MagicStick, 
  Position, ZoomIn, ZoomOut, RefreshLeft, ArrowDown, Check, MoreFilled 
} from '@element-plus/icons-vue'

// ========== 导入工具模块 ==========
import { createPathPlanningEnhanced } from '@/utils/pathPlanningEnhanced'
import { calculatePathStats, flattenPathCoordinates, getAlgorithmColor, analyzeAndRecommend, type CompareResults } from '@/utils/pathCalculator'
import { PathAnimationManager } from '@/utils/pathAnimation'
import { initDistanceChart } from '@/utils/chartInit'
import { 
  create2DMap, 
  create3DMap, 
  resetMapView,
  adjustMapViewport,
  getGeoPoint,
  createGeoMarker
} from '@/utils/mapInitializer'
import {
  initThreeJSScene,
  createUAVModel,
  updateUAVPosition,
  updateCameraView,
  renderThreeScene,
  cleanupThreeJS
} from '@/utils/uav3DModel'
import {
  simulateFlight2D,
  simulateFlight3D,
  stopAllFlightAnimations
} from '@/utils/flightSimulation'
import {
  loadTaskList as apiLoadTaskList,
  loadUavList as apiLoadUavList,
  selectTask as apiSelectTask,
  recommendUavByPath as apiRecommendUav
} from '@/utils/taskSelector'
import {
  drawGlowingPolyline
} from '@/utils/pathStyleManager'

// ========== 核心数据 ==========
const map = ref(null)
const mapContainer = ref(null)
const is3DMode = ref(false)

// 路径规划基础数据
const startPoint = ref('南昌市市政府')
const endPoint = ref('南昌市秋水广场')
const selectedUav = ref(null)
const selectedAlgorithm = ref('迪杰斯特拉算法')
const uavList = ref([])
const pathPoints = ref([])

// 增强功能数据（由管理器维护）
const weatherInfo = ref(null)
const weatherWarning = ref('')
const suitabilityScore = ref(null)

// 路径对比相关
const compareResults = ref<CompareResults | null>(null)
const showComparePanel = ref(false)

// 2D 路径动画相关
const flowAnimationRef = ref<number | null>(null)
const uavIconMarker = ref(null)
const animationDuration = ref(3000)
const flatPathCoords = ref<Array<{ lng: number; lat: number }>>([])
let animationManager: PathAnimationManager | null = null

// 路径统计可视化
const showPathInfo = ref(false)
const pathStats = ref({
  totalDistance: 0,
  estimatedTime: 0,
  pointCount: 0,
  avgSpeed: 10,
  startCoord: '',
  endCoord: ''
})
const chartContainer = ref(null)
let distanceChart = null

// 3D 相关
const threeScene = ref(null)
const threeCamera = ref(null)
const threeRenderer = ref(null)
const uav3DModel = ref(null)

// 任务相关
const taskList = ref([])
const selectedTask = ref(null)
const showTaskDialog = ref(false)

// 标记引用（简化）
const startMarker = ref(null)
const endMarker = ref(null)
const pathPolyline = ref(null)

// 增强管理器实例
const enhancedManager = ref(null)

// 算法选择列表
const algorithmList = [
  { label: '强化学习模型', value: '强化学习模型' },
  { label: 'A*算法', value: 'A*算法' },
  { label: '迪杰斯特拉算法', value: '迪杰斯特拉算法' },
  { label: '蚁群算法', value: '蚁群算法' }
]

// ========== 地图初始化 ==========
const initMap = () => {
  if (is3DMode.value) {
    // 3D模式
    map.value = create3DMap(mapContainer.value)
    
    // 初始化 Three.js
    const threeData = initThreeJSScene(mapContainer.value)
    if (threeData) {
      threeScene.value = threeData.scene
      threeCamera.value = threeData.camera
      threeRenderer.value = threeData.renderer
    }
  } else {
    // 2D 模式
    map.value = create2DMap(mapContainer.value)
  }
  
  console.log('✅ 地图初始化完成，模式:', is3DMode.value ? '3D' : '2D')
}

// 切换地图模式
const toggleMapMode = () => {
  is3DMode.value = !is3DMode.value
  clearPath()
  setTimeout(() => {
    initMap()
  }, 100)
}

// ========== 数据加载 ==========
const loadData = async () => {
  // 并行加载无人机和任务列表
  const [uavs, tasks] = await Promise.all([
    apiLoadUavList(),
    apiLoadTaskList()
  ])
  
  uavList.value = uavs
  taskList.value = tasks
}

// ========== 任务管理 ==========
const openTaskSelector = async () => {
  showTaskDialog.value = true
  taskList.value = await apiLoadTaskList()
}

const selectTask = (task) => {
  const result = apiSelectTask(
    task,
    selectedTask,
    startPoint,
    endPoint,
    selectedUav
  )
  
  if (result.success) {
    ElMessage.success(result.message)
    showTaskDialog.value = false
  }
}

// ========== 路径规划主流程 ==========
const planPath = async () => {
  if (!startPoint.value || !endPoint.value) {
    ElMessage.error('请输入起始地点和终点')
    return
  }
  
  if (!selectedUav.value) {
    ElMessage.error('请选择无人机')
    return
  }
  
  try {
    // 地理编码
    const startPointObj = await getGeoPoint(startPoint.value, map.value, '南昌市')
    const endPointObj = await getGeoPoint(endPoint.value, map.value, '南昌市')
    
    // 创建标记
    startMarker.value = createGeoMarker(map.value, startPointObj, is3DMode.value)
    endMarker.value = createGeoMarker(map.value, endPointObj, is3DMode.value)
    
    // 调用后端 API 计算路径
    await calculatePathByApi(startPointObj, endPointObj)
    
  } catch (error) {
    console.error('路径规划失败:', error)
    ElMessage.error('路径规划失败：' + error.message)
  }
}



// ========== 后端 API 调用 ==========
const calculatePathByApi = async (start, end) => {
  try {
    // 2D 模式：使用百度地图真实路线
    if (!is3DMode.value) {
      console.log('🗺️ 2D 模式：使用百度地图真实路线数据')
      await calculatePathWithBaiduMap(start, end)
      return
    }
    
    // 3D模式：并行执行 A*和 Dijkstra
    console.log('🗺️ 3D模式：并行执行算法对比')
    
    const requestData = {
      startLng: start.lng,
      startLat: start.lat,
      endLng: end.lng,
      endLat: end.lat,
      uavId: selectedUav.value,
      algorithm: selectedAlgorithm.value === 'A*算法' ? 1 :
                 selectedAlgorithm.value === '迪杰斯特拉算法' ? 2 :
                 selectedAlgorithm.value === '蚁群算法' ? 3 : 4
    }
    
    // 并行请求两个算法
    const [astarResponse, dijkstraResponse] = await Promise.all([
      apiPlanPath({ ...requestData, algorithm: 1 }),
      apiPlanPath({ ...requestData, algorithm: 2 })
    ])
    
    // 处理对比结果
    if (astarResponse.code === 200 && dijkstraResponse.code === 200) {
      processCompareResults(astarResponse.data, dijkstraResponse.data)
    }
    
  } catch (error) {
    console.error('API 调用失败:', error)
    ElMessage.error('路径规划失败：' + error.message)
  }
}

// ========== 处理对比结果 ==========
const processCompareResults = (astarData, dijkstraData) => {
  compareResults.value = {
    astar: {
      name: 'A*算法',
      distance: astarData.totalDistance,
      time: astarData.estimatedTime,
      points: astarData.pathPoints.length,
      pathPoints: astarData.pathPoints
    },
    dijkstra: {
      name: '迪杰斯特拉算法',
      distance: dijkstraData.totalDistance,
      time: dijkstraData.estimatedTime,
      points: dijkstraData.pathPoints.length,
      pathPoints: dijkstraData.pathPoints
    },
    recommendation: null
  }
  
  // 分析并推荐
  const result = analyzeAndRecommend(compareResults.value.astar, compareResults.value.dijkstra)
  compareResults.value.recommendation = result.recommendation
  
  // 显示对比面板
  showComparePanel.value = true
  
  // 使用用户选择的算法路径
  const selectedData = selectedAlgorithm.value === 'A*算法' ? astarData : dijkstraData
  
  // 提取路径点
  pathPoints.value = selectedData.pathPoints.map(point => ({
    lng: point.lng,
    lat: point.lat
  }))
  
  // 调整视野
  adjustMapViewport(map.value, pathPoints.value)
  
  // 启动飞行模拟
  simulateFlight()
  
  // 初始化增强功能
  initEnhancedFeatures()
}

const analyzeAndRecommendLocal = () => {
  if (!compareResults.value) return
  const result = analyzeAndRecommend(compareResults.value.astar, compareResults.value.dijkstra)
  compareResults.value = result
}



// ========== 导航与跳转 ==========
const navigateToRouteInfo = () => {
  const savedData = localStorage.getItem('uav_route_data')
  if (!savedData) {
    ElMessage.warning('请先进行路径规划')
    return
  }
  window.location.href = '/#/uav-navigation/route-info'
}

// ========== 百度地图路径计算 ==========
const calculatePathWithBaiduMap = (start, end) => {
  return new Promise((resolve, reject) => {
    console.log('🛣️ 调用百度地图路线规划 API...')
    
    const driving = new BMap.DrivingRoute(map.value, {
      renderOptions: { 
        map: null,
        autoViewport: true,
        enableDragging: false
      },
      onSearchComplete: (results) => {
        if (driving.getStatus() === BMAP_STATUS_SUCCESS) {
          const plan = results.getPlan(0)
          const route = plan.getRoute(0)
          const points = route.getPath()
          
          if (points.length === 0) {
            ElMessage.error('无法获取路径数据')
            reject(new Error('百度地图返回空路径'))
            return
          }
          
          // 提取路径点
          pathPoints.value = []
          for (let i = 0; i < points.length; i++) {
            const point = points[i]
            let lng, lat
            if (typeof point.getLongitude === 'function') {
              lng = point.getLongitude()
              lat = point.getLatitude()
            } else {
              lng = point.lng
              lat = point.lat
            }
            
            if (lng !== undefined && lat !== undefined && !isNaN(lng) && !isNaN(lat)) {
              pathPoints.value.push({ lng: Number(lng), lat: Number(lat) })
            }
          }
          
          // 调整视野
          if (pathPoints.value.length > 0) {
            adjustMapViewport(map.value, pathPoints.value)
          }
          
          // 启动飞行模拟
          simulateFlight()
          resolve(true)
        } else {
          reject(new Error('百度地图路线规划失败'))
        }
      }
    })
    
    driving.search(start, end)
  })
}

// ========== 飞行模拟 ==========
const simulateFlight = async () => {
  if (!pathPoints.value || pathPoints.value.length === 0) return
  
  if (is3DMode.value && threeScene.value) {
    // 3D模式
    const uavModel = createUAVModel(threeScene.value)
    uav3DModel.value = uavModel
    
    const stopAnimation = simulateFlight3D(
      pathPoints.value,
      uavModel,
      map.value,
      mapContainer.value,
      (point) => updateCameraView(threeCamera.value, point, 
        map.value.pointToOverlayPixel(point), 
        mapContainer.value
      ),
      () => renderThreeScene(threeRenderer.value, threeScene.value, threeCamera.value)
    )
    
    flowAnimationRef.value = { stop: stopAnimation }
    
  } else {
    // 2D 模式
    const result = await simulateFlight2D(
      map.value,
      pathPoints.value,
      uavIconMarker,
      pathPolyline,
      flowAnimationRef,
      ref(null),
      flattenPathCoordinates,
      calculatePathStats
    )
    
    if (result) {
      flatPathCoords.value = result.flatPathCoords
      pathStats.value = result.pathStats
      showPathInfo.value = true
      setTimeout(() => initCharts(), 100)
    }
  }
}

// ========== 图表初始化 ==========
const initCharts = () => {
  if (!chartContainer.value || flatPathCoords.value.length === 0) return
  distanceChart = initDistanceChart(chartContainer.value, flatPathCoords.value, distanceChart)
}

// ========== 增强功能初始化 ==========
const initEnhancedFeatures = async () => {
  enhancedManager.value = createPathPlanningEnhanced({
    enableDraggableMarkers: true,
    autoLoadWeather: true,
    autoLoadNoFlyZones: true
  })
  
  await enhancedManager.value.init(map.value, pathPoints.value)
  
  enhancedManager.value.callbacks.onWarningsChanged = (warnings, weather, score) => {
    weatherInfo.value = weather
    weatherWarning.value = warnings.join('\n')
    suitabilityScore.value = score
    
    if (warnings.length > 0) {
      ElMessage.warning(warnings[0])
    }
  }
}


// ========== 清除路径 ==========
const clearPath = () => {
  // 停止所有动画
  stopAllFlightAnimations(
    animationManager,
    flowAnimationRef.value?.stop,
    flowAnimationRef,
    ref(null)
  )
  
  // 清理地图覆盖物
  if (map.value) {
    ;[startMarker.value, endMarker.value, pathPolyline.value, uavIconMarker.value]
      .forEach(marker => {
        if (marker) map.value.removeOverlay(marker)
      })
  }
  
  // 清理 3D 资源
  if (uav3DModel.value && threeScene.value) {
    threeScene.value.remove(uav3DModel.value)
    uav3DModel.value = null
  }
  
  // 重置状态
  pathPoints.value = []
  flatPathCoords.value = []
  showPathInfo.value = false
  showComparePanel.value = false
  compareResults.value = null
  
  // 销毁增强管理器
  if (enhancedManager.value) {
    enhancedManager.value.destroy()
    enhancedManager.value = null
  }
  
  console.log('✅ 路径已清除')
}

// ========== 智能推荐无人机 ==========
const selectBestUav = () => {
  if (!pathPoints.value || pathPoints.value.length === 0) {
    ElMessage.warning('请先规划路径')
    return
  }
  
  const recommendedUav = apiRecommendUav(
    pathPoints.value,
    uavList.value,
    map.value
  )
  
  if (recommendedUav) {
    selectedUav.value = recommendedUav.uavId
    ElMessage.success(`推荐使用：${recommendedUav.uavModel} (续航${recommendedUav.uavMaxFlightTime}分钟)`)
  } else {
    ElMessage.warning('未找到合适的无人机')
  }
}

// ========== 视角控制 ==========
const adjustView = (direction) => {
  if (!map.value || !is3DMode.value) return
  
  const currentTilt = map.value.getTilt()
  
  switch (direction) {
    case 'forward':
      map.value.panBy(0, -50)
      break
    case 'backward':
      map.value.panBy(0, 50)
      break
    case 'left':
      map.value.panBy(-50, 0)
      break
    case 'right':
      map.value.panBy(50, 0)
      break
    case 'up':
      map.value.setTilt(Math.max(0, currentTilt - 10))
      break
    case 'down':
      map.value.setTilt(Math.min(80, currentTilt + 10))
      break
  }
}

const focusOnStartPoint = () => {
  if (!map.value || !startMarker.value) return
  const startPoint = startMarker.value.getPosition()
  map.value.centerAndZoom(startPoint, 15)
  if (is3DMode.value) {
    map.value.setHeading(45)
    map.value.setTilt(60)
  }
}

const focusOnEndPoint = () => {
  if (!map.value || !endMarker.value) return
  const endPoint = endMarker.value.getPosition()
  map.value.centerAndZoom(endPoint, 15)
  if (is3DMode.value) {
    map.value.setHeading(45)
    map.value.setTilt(60)
  }
}

const resetView = () => {
  if (!map.value) return
  resetMapView(map.value, is3DMode.value)
}

// ========== 生命周期 ==========
onMounted(async () => {
  setTimeout(() => {
    initMap()
  }, 500)
  
  await loadData()
})

onUnmounted(() => {
  clearPath()
  if (threeRenderer.value && mapContainer.value) {
    cleanupThreeJS(
      { scene: threeScene.value, camera: threeCamera.value, renderer: threeRenderer.value },
      mapContainer.value
    )
  }
})
</script>

<template>
  <div class="app-container">
    <h1 class="art-text">路径规划</h1>
    
    <!-- 路径规划表单 -->
    <div class="card fade-in">
      <div class="path-form">
        <el-form 
          :model="{
            startPoint: startPoint,
            endPoint: endPoint,
            uavId: selectedUav,
            algorithm: selectedAlgorithm
          }" 
          inline
          class="inline-form"
        >
          <el-form-item label="起始地点" class="form-item-inline"/>
            <el-input v-model="startPoint" placeholder="请输入起始地点" clearable />
          
          <el-form-item label="终点" class="form-item-inline"/>
            <el-input v-model="endPoint" placeholder="请输入终点" clearable />
          
          <el-form-item label="无人机" class="form-item-inline">
            <el-select v-model="selectedUav" placeholder="请选择无人机" clearable>
              <el-option
                  v-for="uav in uavList"
                  :key="uav.uavId"
                  :label="uav.uavModel"
                  :value="uav.uavId"
              />
            </el-select>
          </el-form-item>
          
          <el-form-item label="算法" class="form-item-inline">
            <el-select v-model="selectedAlgorithm" placeholder="请选择算法">
              <el-option 
                v-for="algorithm in algorithmList" 
                :key="algorithm.value" 
                :label="algorithm.label" 
                :value="algorithm.value" 
              />
            </el-select>
          </el-form-item>
        </el-form>
        
        <div class="action-bar">
          <el-button type="primary" @click="planPath" class="btn-primary" :icon="RefreshRight">
            开始规划
          </el-button>
          <el-button @click="openTaskSelector" class="btn-secondary" :icon="Document">
            选择任务
          </el-button>
          <el-button @click="selectBestUav" class="btn-success" :icon="MagicStick">
            智能推荐
          </el-button>
          <el-button @click="clearPath" class="btn-danger" :icon="Delete">
            清除路径
          </el-button>
          <el-dropdown trigger="click">
            <el-button class="btn-more" :icon="MoreFilled">
              更多 <el-icon class="el-icon--right"><arrow-down /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="navigateToRouteInfo" :icon="TrendCharts">查看路线信息</el-dropdown-item>
                <el-dropdown-item @click="toggleMapMode" :icon="Position">{{ is3DMode ? '切换到 2D' : '切换到 3D' }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </div>
    <!-- 地图展示 -->
    <div class="card fade-in" style="margin-top: 20px;">
      <div class="map-container" ref="mapContainer">
        <!-- 3D 视角控制按钮 -->
        <div v-if="is3DMode" class="view-control">
          <div class="view-control-title">
            <el-icon><Position /></el-icon>
            视角控制
          </div>
          <div class="view-control-grid">
            <el-button @click="adjustView('forward')" circle size="small">↑</el-button>
            <el-button @click="adjustView('up')" size="small">上仰</el-button>
            <el-button @click="adjustView('backward')" circle size="small">↓</el-button>
            <el-button @click="adjustView('left')" circle size="small">←</el-button>
            <el-button @click="resetView()" size="small"><el-icon><RefreshLeft /></el-icon></el-button>
            <el-button @click="adjustView('right')" circle size="small">→</el-button>
          </div>
          <div class="view-control-actions">
            <el-button @click="focusOnStartPoint" :disabled="!startMarker.value" size="small" plain>
              <el-icon><Location /></el-icon> 起点
            </el-button>
            <el-button @click="focusOnEndPoint" :disabled="!endMarker.value" size="small" plain>
              <el-icon><MapLocation /></el-icon> 终点
            </el-button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 路径信息可视化面板 -->
    <div v-if="showPathInfo" class="card fade-in" style="margin-top: 20px;">
      <div class="path-info-panel">
        <div class="panel-header">
          <div class="panel-title">
            <el-icon><TrendCharts /></el-icon>
            路径参数可视化
          </div>
        </div>
        
        <!-- 统计卡片 -->
        <div class="stats-grid">
          <div class="stat-card stat-gradient-1">
            <div class="stat-icon"><el-icon><Location /></el-icon></div>
            <div class="stat-content">
              <div class="stat-label">总距离</div>
              <div class="stat-value">{{ pathStats.totalDistance }}<span class="stat-unit">米</span></div>
            </div>
          </div>
          <div class="stat-card stat-gradient-2">
            <div class="stat-icon"><el-icon><Clock /></el-icon></div>
            <div class="stat-content">
              <div class="stat-label">预计时间</div>
              <div class="stat-value">{{ pathStats.estimatedTime }}<span class="stat-unit">秒</span></div>
            </div>
          </div>
          <div class="stat-card stat-gradient-3">
            <div class="stat-icon"><el-icon><Loading /></el-icon></div>
            <div class="stat-content">
              <div class="stat-label">路径点数</div>
              <div class="stat-value">{{ pathStats.pointCount }}<span class="stat-unit">个</span></div>
            </div>
          </div>
          <div class="stat-card stat-gradient-4">
            <div class="stat-icon"><el-icon><VideoCamera /></el-icon></div>
            <div class="stat-content">
              <div class="stat-label">平均速度</div>
              <div class="stat-value">{{ pathStats.avgSpeed }}<span class="stat-unit">m/s</span></div>
            </div>
          </div>
        </div>
        
        <!-- 坐标信息 -->
        <div class="coord-cards">
          <div class="coord-card coord-start">
            <div class="coord-label">
              <el-icon><Location /></el-icon>
              起点坐标
            </div>
            <div class="coord-value">{{ pathStats.startCoord || '暂无' }}</div>
          </div>
          <div class="coord-card coord-end">
            <div class="coord-label">
              <el-icon><MapLocation /></el-icon>
              终点坐标
            </div>
            <div class="coord-value">{{ pathStats.endCoord || '暂无' }}</div>
          </div>
        </div>
        
        <!-- 图表容器 -->
        <div ref="chartContainer" class="chart-container"></div>
      </div>
    </div>
    
    <!-- 算法对比面板 -->
    <div v-if="showComparePanel && compareResults" class="card fade-in" style="margin-top: 20px;">
      <div class="compare-panel">
        <div class="panel-header">
          <div class="panel-title gradient-text">
            <el-icon><TrendCharts /></el-icon>
            算法对比分析
          </div>
        </div>
        
        <!-- 对比表格 -->
        <div class="comparison-table-wrapper">
          <table class="comparison-table">
            <thead>
              <tr>
                <th width="25%">指标</th>
                <th width="37.5%" class="astar-header">
                  <span class="algo-icon">⚡</span>A*算法
                </th>
                <th width="37.5%" class="dijkstra-header">
                  <span class="algo-icon">🔍</span>迪杰斯特拉算法
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="label-cell"><el-icon><Location /></el-icon> 总距离</td>
                <td :class="['value-cell', compareResults.astar.distance <= compareResults.dijkstra.distance ? 'better' : '']">
                  {{ compareResults.astar.distance }} 米
                </td>
                <td :class="['value-cell', compareResults.dijkstra.distance < compareResults.astar.distance ? 'better' : '']">
                  {{ compareResults.dijkstra.distance }} 米
                </td>
              </tr>
              <tr>
                <td class="label-cell"><el-icon><Clock /></el-icon> 预计时间</td>
                <td :class="['value-cell', compareResults.astar.time <= compareResults.dijkstra.time ? 'better' : '']">
                  {{ compareResults.astar.time }} 秒
                </td>
                <td :class="['value-cell', compareResults.dijkstra.time < compareResults.astar.time ? 'better' : '']">
                  {{ compareResults.dijkstra.time }} 秒
                </td>
              </tr>
              <tr>
                <td class="label-cell"><el-icon><Loading /></el-icon> 路径点数</td>
                <td :class="['value-cell', compareResults.astar.points <= compareResults.dijkstra.points ? 'better' : '']">
                  {{ compareResults.astar.points }} 个
                </td>
                <td :class="['value-cell', compareResults.dijkstra.points < compareResults.astar.points ? 'better' : '']">
                  {{ compareResults.dijkstra.points }} 个
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- 推荐结果 -->
        <div v-if="compareResults.recommendation" class="recommendation-box">
          <div class="recommendation-header">
            <div class="recommendation-title">
              <span class="trophy">🏆</span>
              推荐算法：<span class="highlight-badge">{{ compareResults.recommendation.algorithm }}</span>
            </div>
          </div>
          <div class="recommendation-content">
            <div class="reason-section">
              <div class="section-label"><el-icon><MagicStick /></el-icon> 推荐理由</div>
              <div class="reason-list">
                <div v-for="(reason, index) in compareResults.recommendation.reasons" :key="index" class="reason-tag">
                  {{ reason }}
                </div>
              </div>
            </div>
            <div class="advantage-section">
              <div class="section-label"><el-icon><TrendCharts /></el-icon> 核心优势</div>
              <div class="advantage-list">
                <div v-for="(adv, index) in compareResults.recommendation.advantages" :key="index" class="advantage-item">
                  <el-icon class="check-icon"><Check /></el-icon>
                  {{ adv }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 任务选择对话框 -->
    <el-dialog v-model="showTaskDialog" title="选择任务" width="900px">
      <el-table :data="taskList" style="width: 100%" border highlight-current-row>
        <el-table-column prop="taskId" label="任务编号" width="100" align="center"/>
        <el-table-column prop="taskName" label="任务名称" width="150" align="center"/>
        <el-table-column prop="taskType" label="任务类型" width="100" align="center"/>
        <el-table-column prop="startLocation" label="起始地点" width="150" align="center" show-overflow-tooltip/>
        <el-table-column prop="endLocation" label="终点" width="150" align="center" show-overflow-tooltip/>
        <el-table-column prop="maxDistance" label="距离 (km)" width="90" align="center">
          <template #default="scope">
            {{ scope.row.maxDistance?.toFixed(2) || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="estimatedTime" label="时间 (min)" width="90" align="center">
          <template #default="scope">
            {{ scope.row.estimatedTime || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="urgency" label="紧急度" width="80" align="center">
          <template #default="scope">
            <el-tag v-if="scope.row.urgency === 1" type="info">普通</el-tag>
            <el-tag v-else-if="scope.row.urgency === 2" type="warning">紧急</el-tag>
            <el-tag v-else type="danger">非常紧急</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="uavModel" label="推荐无人机" width="120" align="center" show-overflow-tooltip/>
        <el-table-column label="操作" width="120" align="center" fixed="right">
          <template #default="scope">
            <el-button type="primary" size="small" @click="selectTask(scope.row)">选择此任务</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showTaskDialog = false">取消</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ========== 全局变量 ========== */
:root {
  --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --success-gradient: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  --warning-gradient: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  --info-gradient: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  --card-shadow: 0 8px 32px rgba(102, 126, 234, 0.15);
  --hover-shadow: 0 12px 48px rgba(102, 126, 234, 0.25);
  --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ========== 卡片容器 ========== */
.card {
  background: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--card-shadow);
  transition: var(--transition);
  border: 1px solid rgba(102, 126, 234, 0.1);
}

.card:hover {
  box-shadow: var(--hover-shadow);
  transform: translateY(-2px);
}

/* ========== 路径规划表单 ========== */
.path-form {
  padding: 24px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 249, 250, 0.95) 100%);
}

.form-section {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  padding: 16px;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  transition: var(--transition);
}

.form-section:hover {
  border-color: #667eea;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.1);
  transform: translateX(4px);
}

.section-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-gradient);
  border-radius: 12px;
  color: white;
  font-size: 20px;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.section-content {
  flex: 1;
  min-width: 0;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.input-field,
.select-field {
  width: 100%;
  min-width: 0;
}

.input-field :deep(.el-input),
.select-field :deep(.el-select) {
  width: 100%;
}

/* 输入框和选择框紧凑样式 */
.input-field :deep(.el-input__wrapper),
.select-field :deep(.el-select .el-input__wrapper) {
  padding: 6px 12px;
  border-radius: 6px;
  width: 100%;
}

.input-field :deep(.el-input__inner),
.select-field :deep(.el-input__inner) {
  font-size: 13px;
  width: 100%;
}

/* Inline 表单样式 */
.inline-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end; /* 底部对齐 */
  gap: 16px;
}

.form-item-inline {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px; /* 极致紧凑：4px -> 2px */
  margin-bottom: 0;
}

.form-item-inline :deep(.el-form-item__label) {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 0;
  line-height: 1.3; /* 行高进一步缩小 */
  padding: 0;
}

/* 关键：统一 el-input 和 el-select 的高度 */
.form-item-inline :deep(.el-input),
.form-item-inline :deep(.el-select) {
  width: 220px;
}

.form-item-inline :deep(.el-input__wrapper),
.form-item-inline :deep(.el-select .el-input__wrapper) {
  padding: 10px 14px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  height: 44px; /* 固定高度 */
  box-sizing: border-box;
}

.form-item-inline :deep(.el-input__inner),
.form-item-inline :deep(.el-select .el-input__inner) {
  font-size: 14px;
  font-weight: 500;
  height: 24px; /* 统一输入内容高度 */
  line-height: 24px;
}

/* 修复 select 下拉箭头垂直居中 */
.form-item-inline :deep(.el-select .el-input__suffix) {
  top: 50%;
  transform: translateY(-50%);
}

/* ========== 操作按钮栏 ========== */
.action-bar {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid #e2e8f0;
  flex-wrap: wrap;
  justify-content: center;
}

.btn-primary,
.btn-secondary,
.btn-success,
.btn-danger,
.btn-more {
  padding: 12px 24px;
  font-weight: 600;
  border-radius: 10px;
  transition: var(--transition);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

/* ========== 地图容器 ========== */
.map-container {
  width: 100%;
  height: 600px;
  border-radius: 16px;
  position: relative;
  overflow: visible;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

/* ========== 3D 视角控制 ========== */
.view-control {
  position: absolute;
  top: 80px;
  right: 20px;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  z-index: 999999;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(102, 126, 234, 0.2);
  transition: var(--transition);
  min-width: 200px;
}

.view-control:hover {
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.2);
  transform: translateY(-2px);
}

.view-control-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 16px;
  color: #4D4FC3;
  text-align: center;
  padding-bottom: 12px;
  border-bottom: 2px solid #e2e8f0;
}

.view-control-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.view-control-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.view-control-actions .el-button {
  border-radius: 8px;
  transition: var(--transition);
}

.view-control-actions .el-button:hover {
  transform: scale(1.02);
}

/* ========== 路径信息面板 ========== */
.path-info-panel {
  padding: 24px;
}

.panel-header {
  margin-bottom: 24px;
  text-align: center;
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 20px;
  font-weight: 700;
  color: #4D4FC3;
}

.gradient-text {
  background: var(--primary-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ========== 统计卡片 ========== */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  position: relative;
  border-radius: 16px;
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: var(--transition);
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.stat-card::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(
    45deg,
    transparent 30%,
    rgba(255, 255, 255, 0.2) 50%,
    transparent 70%
  );
  transform: rotate(45deg);
  transition: var(--transition);
}

.stat-card:hover::before {
  left: 100%;
}

.stat-card:hover {
  transform: translateY(-6px) scale(1.03);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.stat-icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 14px;
  font-size: 26px;
  flex-shrink: 0;
  backdrop-filter: blur(10px);
}

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-label {
  font-size: 13px;
  opacity: 0.9;
  margin-bottom: 6px;
  font-weight: 500;
}

.stat-value {
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.5px;
}

.stat-unit {
  font-size: 13px;
  font-weight: 500;
  margin-left: 4px;
  opacity: 0.8;
}

/* 渐变背景 */
.stat-gradient-1 { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.stat-gradient-2 { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
.stat-gradient-3 { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
.stat-gradient-4 { background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); }

/* ========== 坐标卡片 ========== */
.coord-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
}

.coord-card {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 16px 20px;
  border: 2px solid #e2e8f0;
  transition: var(--transition);
}

.coord-card:hover {
  border-color: #667eea;
  background: #ffffff;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.1);
  transform: translateX(4px);
}

.coord-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.coord-value {
  font-size: 14px;
  color: #2d3748;
  font-family: 'Courier New', monospace;
  font-weight: 600;
  word-break: break-all;
}

.coord-start .coord-label { color: #667eea; }
.coord-end .coord-label { color: #f5576c; }

/* ========== 图表容器 ========== */
.chart-container {
  width: 100%;
  height: 400px;
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-sizing: border-box;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  
  .stat-card {
    padding: 15px;
  }
  
  .stat-value {
    font-size: 24px;
  }
  
  .chart-container {
    height: 300px;
  }
}

/* ========== 算法对比面板 ========== */
.compare-panel {
  padding: 24px;
}

.panel-header .gradient-text {
  font-size: 22px;
  font-weight: 800;
}

/* ========== 对比表格 ========== */
.comparison-table-wrapper {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  margin-bottom: 24px;
  border: 1px solid #e2e8f0;
}

.comparison-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
}

.comparison-table thead tr {
  background: var(--primary-gradient);
  color: white;
}

.comparison-table th {
  padding: 18px;
  font-size: 16px;
  font-weight: 700;
  text-align: center;
}

.astar-header,
.dijkstra-header {
  position: relative;
}

.algo-icon {
  margin-right: 8px;
  font-size: 18px;
}

.comparison-table tbody tr {
  border-bottom: 1px solid #e2e8f0;
  transition: var(--transition);
}

.comparison-table tbody tr:last-child {
  border-bottom: none;
}

.comparison-table tbody tr:hover {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
}

.label-cell {
  padding: 18px;
  font-weight: 600;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
}

.value-cell {
  padding: 18px;
  text-align: center;
  font-size: 15px;
  color: #2d3748;
  font-weight: 600;
  transition: var(--transition);
}

.value-cell.better {
  background: linear-gradient(135deg, rgba(67, 233, 123, 0.15) 0%, rgba(56, 249, 215, 0.15) 100%);
  color: #2f855a;
  font-weight: 700;
  font-size: 16px;
  box-shadow: inset 0 0 12px rgba(67, 233, 123, 0.2);
}

/* ========== 推荐结果框 ========== */
.recommendation-box {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  border-radius: 16px;
  padding: 24px;
  color: white;
  box-shadow: 0 8px 24px rgba(240, 147, 251, 0.4);
  position: relative;
  overflow: hidden;
}

.recommendation-box::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
  animation: pulse 3s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.1); opacity: 0.8; }
}

.recommendation-header {
  margin-bottom: 20px;
  text-align: center;
}

.recommendation-title {
  font-size: 20px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.trophy {
  font-size: 28px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.highlight-badge {
  background: rgba(255, 255, 255, 0.3);
  padding: 6px 16px;
  border-radius: 24px;
  font-size: 18px;
  font-weight: 700;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.recommendation-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 12px;
  opacity: 0.95;
}

.reason-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reason-tag {
  background: rgba(255, 255, 255, 0.2);
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 14px;
  backdrop-filter: blur(10px);
  transition: var(--transition);
  border-left: 3px solid rgba(255, 255, 255, 0.5);
}

.reason-tag:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateX(4px);
}

.advantage-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.advantage-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.2);
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 14px;
  backdrop-filter: blur(10px);
  transition: var(--transition);
}

.check-icon {
  color: #fff;
  font-size: 18px;
  flex-shrink: 0;
}


/* ========== 响应式设计 ========== */
@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  
  .stat-card {
    padding: 15px;
  }
  
  .stat-value {
    font-size: 24px;
  }
  
  .chart-container {
    height: 300px;
  }
  
  .coord-cards {
    grid-template-columns: 1fr;
  }
  
  .recommendation-content {
    grid-template-columns: 1fr;
  }
  
  .comparison-table thead tr {
    display: none;
  }
  
  .comparison-table tbody tr {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 12px;
  }
  
  .label-cell,
  .value-cell {
    text-align: left;
    padding: 8px;
  }
  
  .action-bar {
    flex-direction: column;
  }
  
  .action-bar .el-button {
    width: 100%;
  }
  
  .view-control {
    top: 70px;
    right: 10px;
    padding: 12px;
    min-width: 160px;
  }
  
  .view-control-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* ========== 淡入动画 ========== */
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
</style>