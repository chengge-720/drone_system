<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from "vue"
import { selectUavList, planPath as apiPlanPath } from '@/api/system/uav.js'
import { ElMessage } from 'element-plus'

// 地图实例
const map = ref(null)
const mapContainer = ref(null)
const is3DMode = ref(false) // 默认使用2D模式

// 路径规划相关数据
const startPoint = ref('南昌市市政府')
const endPoint = ref('南昌市秋水广场')
const selectedUav = ref(null)
const selectedAlgorithm = ref('迪杰斯特拉算法') // 默认使用迪杰斯特拉算法
const uavList = ref([])
const pathPoints = ref([])
const pathPolyline = ref(null)
const startMarker = ref(null)
const endMarker = ref(null)
const uavMarker = ref(null)
const flyInterval = ref(null)

// 路径对比相关
const compareResults = ref(null) // 存储对比结果
const showComparePanel = ref(false) // 是否显示对比面板

// 2D 路径规划相关
const flowAnimationRef = ref(null) // 流光动画引用
const uavIconMarker = ref(null) // 无人机图标标记
const animationStartTime = ref(0) // 动画开始时间
const animationDuration = ref(3000) // 动画持续时间（毫秒）
const flatPathCoords = ref([]) // 扁平化的路径坐标

// 路径参数可视化
const showPathInfo = ref(false) // 是否显示路径信息面板
const pathStats = ref({
  totalDistance: 0, // 总距离（米）
  estimatedTime: 0, // 预计时间（秒）
  pointCount: 0, // 坐标点数
  avgSpeed: 10, // 平均速度（m/s）
  startCoord: '', // 起点坐标
  endCoord: '' // 终点坐标
})
const chartContainer = ref(null)
let distanceChart = null
let elevationChart = null

// Three.js相关
const threeScene = ref(null)
const threeCamera = ref(null)
const threeRenderer = ref(null)
const uav3DModel = ref(null)
const animationId = ref(null)

// 算法选择列表
const algorithmList = [
  { label: '强化学习模型', value: '强化学习模型' },
  { label: 'A*算法', value: 'A*算法' },
  { label: '迪杰斯特拉算法', value: '迪杰斯特拉算法' },
  { label: '蚁群算法', value: '蚁群算法' }
]

// 初始化地图
const initMap = () => {
  if (is3DMode.value && typeof BMapGL !== 'undefined') {
    // 创建3D地图实例
    map.value = new BMapGL.Map(mapContainer.value, {
      enableMapClick: false
    })
    // 设置南昌为中心
    const point = new BMapGL.Point(115.892151, 28.676493)
    map.value.centerAndZoom(point, 13)
    // 启用滚轮缩放
    map.value.enableScrollWheelZoom(true)
    // 添加控件
    map.value.addControl(new BMapGL.NavigationControl())
    map.value.addControl(new BMapGL.ScaleControl())
    // 设置3D视角
    map.value.setHeading(45) // 旋转角度
    map.value.setTilt(60) // 倾斜角度
    
    // 初始化Three.js
    initThreeJS()
  } else if (typeof BMap !== 'undefined') {
    // 创建2D地图实例
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

// 初始化Three.js
const initThreeJS = () => {
  if (!map.value || !mapContainer.value) return
  
  // 创建场景
  threeScene.value = new THREE.Scene()
  
  // 创建相机
  threeCamera.value = new THREE.PerspectiveCamera(60, mapContainer.value.clientWidth / mapContainer.value.clientHeight, 0.1, 10000)
  
  // 创建渲染器
  threeRenderer.value = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  threeRenderer.value.setSize(mapContainer.value.clientWidth, mapContainer.value.clientHeight)
  threeRenderer.value.setClearColor(0x000000, 0)
  
  // 添加到地图容器
  mapContainer.value.appendChild(threeRenderer.value.domElement)
  
  // 添加光源
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
  threeScene.value.add(ambientLight)
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(1, 1, 1)
  threeScene.value.add(directionalLight)
}

// 创建3D无人机模型
const createUAVModel = () => {
  if (!threeScene.value) return
  
  // 清除旧模型
  if (uav3DModel.value) {
    threeScene.value.remove(uav3DModel.value)
  }
  
  // 创建无人机模型组
  uav3DModel.value = new THREE.Group()
  
  // 机身
  const bodyGeometry = new THREE.BoxGeometry(1, 0.2, 0.5)
  const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0x4D4FC3 })
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
  uav3DModel.value.add(body)
  
  // 机翼
  const wingGeometry = new THREE.BoxGeometry(0.2, 0.1, 2)
  const wingMaterial = new THREE.MeshPhongMaterial({ color: 0x4D4FC3 })
  
  const leftWing = new THREE.Mesh(wingGeometry, wingMaterial)
  leftWing.position.set(-0.6, 0, 0)
  uav3DModel.value.add(leftWing)
  
  const rightWing = new THREE.Mesh(wingGeometry, wingMaterial)
  rightWing.position.set(0.6, 0, 0)
  uav3DModel.value.add(rightWing)
  
  // 螺旋桨
  const propellerGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 32)
  const propellerMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff })
  
  const frontPropeller = new THREE.Mesh(propellerGeometry, propellerMaterial)
  frontPropeller.position.set(0, 0.1, 1)
  frontPropeller.rotation.x = Math.PI / 2
  uav3DModel.value.add(frontPropeller)
  
  const backPropeller = new THREE.Mesh(propellerGeometry, propellerMaterial)
  backPropeller.position.set(0, 0.1, -1)
  backPropeller.rotation.x = Math.PI / 2
  uav3DModel.value.add(backPropeller)
  
  threeScene.value.add(uav3DModel.value)
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
    ElMessage.error('请输入起始地点和终点')
    return
  }

  if (!selectedUav.value) {
    ElMessage.error('请选择无人机')
    return
  }

  try {
    // 使用百度地图 API 进行地理编码
    const geocoder = is3DMode.value ? new BMapGL.Geocoder() : new BMap.Geocoder()

    // 编码起点
    geocoder.getPoint(startPoint.value, async (startPointObj) => {
      if (startPointObj) {
        // 编码终点
        geocoder.getPoint(endPoint.value, async (endPointObj) => {
          if (endPointObj) {
            // 添加起点标记
            if (is3DMode.value) {
              startMarker.value = new BMapGL.Marker(startPointObj)
            } else {
              startMarker.value = new BMap.Marker(startPointObj)
            }
            map.value.addOverlay(startMarker.value)
            
            // 添加终点标记
            if (is3DMode.value) {
              endMarker.value = new BMapGL.Marker(endPointObj)
            } else {
              endMarker.value = new BMap.Marker(endPointObj)
            }
            map.value.addOverlay(endMarker.value)
            
            // 调用后端 API 计算路径
            await calculatePathByApi(startPointObj, endPointObj)
          } else {
            ElMessage.error('终点地址解析失败')
          }
        }, '南昌市')
      } else {
        ElMessage.error('起点地址解析失败')
      }
    }, '南昌市')
  } catch (error) {
    console.error('路径规划失败:', error)
    ElMessage.error('路径规划失败：' + (error as Error).message)
  }
}

// 计算路径
const calculatePath = (start, end) => {
  // 2D 模式不再使用百度地图的 DrivingRoute，直接使用后端 API（内部会调用百度地图）
  if (!is3DMode.value) {
    console.log('🎯 2D 模式将使用百度地图真实路线数据')
    return
  }
  
  // 3D模式仍然使用百度地图的 DrivingRoute
  // 根据选择的算法设置不同的路径样式
  let pathStyle = {
    strokeColor: '#4D4FC3',
    strokeWeight: 5,
    strokeOpacity: 0.8
  }
  
  // 根据算法类型设置不同的路径样式
  switch (selectedAlgorithm.value) {
    case 'A*算法':
      pathStyle = {
        strokeColor: '#10B981', // 绿色
        strokeWeight: 5,
        strokeOpacity: 0.8
      }
      break
    case '迪杰斯特拉算法':
      pathStyle = {
        strokeColor: '#3B82F6', // 蓝色
        strokeWeight: 5,
        strokeOpacity: 0.8
      }
      break
    case '蚁群算法':
      pathStyle = {
        strokeColor: '#F59E0B', // 橙色
        strokeWeight: 5,
        strokeOpacity: 0.8
      }
      break
    case '强化学习模型':
      // 强化学习模型暂时不用实现，使用默认样式
      break
  }
  
  // 使用百度地图路线规划 API（但不自动渲染）
  const driving = new BMapGL.DrivingRoute(map.value, {
    renderOptions: { 
      map: map.value, 
      autoViewport: true,
      enableDragging: false
    },
    onSearchComplete: (results) => {
      if (driving.getStatus() === BMAP_STATUS_SUCCESS) {
        const plan = results.getPlan(0)
        const route = plan.getRoute(0)
        
        // 提取路径点
        pathPoints.value = []
        for (let i = 0; i < route.getNumPoints(); i++) {
          pathPoints.value.push(route.getPoint(i))
        }
        
        console.log('3D模式路径点数量:', pathPoints.value.length)
        
        // 模拟无人机飞行（3D模式不使用流光效果）
        simulateFlight()
      } else {
        ElMessage.error('路径规划失败：' + driving.getStatus())
      }
    }
  })
  
  driving.search(start, end)
}

// 通过后端 API 计算路径
const calculatePathByApi = async (start, end) => {
  try {
    // 2D 模式下，优先使用百度地图的真实路线数据
    if (!is3DMode.value) {
      console.log('🗺️ 2D 模式：使用百度地图真实路线数据')
      await calculatePathWithBaiduMap(start, end)
      return
    }
    
    // 3D模式下使用后端算法 - 并行执行 A*和 Dijkstra 进行对比
    console.log('🗺️ 3D模式：并行执行 A*和 Dijkstra 算法进行对比')
    
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
    
    console.log('🗺️ 请求后端 API，参数:', requestData)
    
    // 并行执行两个算法
    const astarRequest = { ...requestData, algorithm: 1 }
    const dijkstraRequest = { ...requestData, algorithm: 2 }
    
    const [astarResponse, dijkstraResponse] = await Promise.all([
      apiPlanPath(astarRequest),
      apiPlanPath(dijkstraRequest)
    ])
    
    console.log('📡 A*算法响应:', astarResponse)
    console.log('📡 Dijkstra 算法响应:', dijkstraResponse)
    
    // 存储对比结果
    if (astarResponse.code === 200 && dijkstraResponse.code === 200) {
      const astarData = astarResponse.data
      const dijkstraData = dijkstraResponse.data
      
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
      
      // 分析并推荐最佳路径
      analyzeAndRecommend()
      
      // 显示对比面板
      showComparePanel.value = true
      
      // 使用用户选择的算法的路径
      const selectedData = selectedAlgorithm.value === 'A*算法' ? astarData : dijkstraData
      
      // 提取路径点
      pathPoints.value = []
      if (selectedData.pathPoints && selectedData.pathPoints.length > 0) {
        selectedData.pathPoints.forEach((point, index) => {
          pathPoints.value.push({
            lng: point.lng,
            lat: point.lat
          })
        })
        
        console.log('✅ 后端返回的路径点数量:', pathPoints.value.length)
        
        // 调整地图视野
        if (pathPoints.value.length > 0) {
          const startPoint = pathPoints.value[0]
          const endPoint = pathPoints.value[pathPoints.value.length - 1]
          
          map.value.centerAndZoom(new BMap.Point(
            (startPoint.lng + endPoint.lng) / 2,
            (startPoint.lat + endPoint.lat) / 2
          ), 15)
        }
        
        // 模拟无人机飞行
        console.log('🚁 开始模拟飞行...')
        simulateFlight()
      } else {
        console.error('❌ 未找到有效路径')
        ElMessage.error('路径规划失败：未找到有效路径')
      }
    } else {
      console.error('❌ 路径规划失败')
      ElMessage.error('路径规划失败')
    }
  } catch (error) {
    console.error('❌ 调用后端 API 失败:', error)
    ElMessage.error('路径规划失败：' + (error as Error).message)
  }
}

// 分析并推荐最佳路径
const analyzeAndRecommend = () => {
  if (!compareResults.value) return
  
  const { astar, dijkstra } = compareResults.value
  
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
  let reason = []
  
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
  
  compareResults.value.recommendation = {
    algorithm: recommended === 'astar' ? 'A*算法' : '迪杰斯特拉算法',
    score: recommended === 'astar' ? astarNormalized : dijkstraNormalized,
    reasons: reason,
    advantages: recommended === 'astar' ? 
      ['综合评分更优', ...reason.filter(r => r.includes('A*'))] :
      ['综合评分更优', ...reason.filter(r => r.includes('Dijkstra'))]
  }
}

// 使用百度地图真实路线数据计算路径
const calculatePathWithBaiduMap = (start, end) => {
  return new Promise((resolve, reject) => {
    console.log('🛣️ 调用百度地图路线规划 API...')
    
    // 创建驾车路线规划实例（不自动渲染）
    const driving = new BMap.DrivingRoute(map.value, {
      renderOptions: { 
        map: null, // 关键：设置为 null，不自动渲染红色路径
        autoViewport: true,
        enableDragging: false
      },
      onSearchComplete: (results) => {
        if (driving.getStatus() === BMAP_STATUS_SUCCESS) {
          console.log('✅ 百度地图路线规划成功')
          
          const plan = results.getPlan(0)
          const route = plan.getRoute(0)
          
          // 使用 route.getPath() 方法获取路径点
          const points = route.getPath()
          console.log('📍 百度地图返回的路径点数量:', points.length)
          
          if (points.length === 0) {
            console.error('❌ 未能获取到任何路径点！')
            ElMessage.error('无法获取路径数据')
            reject(new Error('百度地图返回空路径'))
            return
          }
          
          // 提取路径点到 pathPoints.value
          pathPoints.value = []
          for (let i = 0; i < points.length; i++) {
            const point = points[i]
            
            // 确保正确获取经纬度
            let lng, lat
            if (typeof point.lng === 'number') {
              lng = point.lng
              lat = point.lat
            } else if (typeof point.getLongitude === 'function') {
              lng = point.getLongitude()
              lat = point.getLatitude()
            } else {
              lng = point.lng
              lat = point.lat
            }
            
            if (lng !== undefined && lat !== undefined && !isNaN(lng) && !isNaN(lat)) {
              pathPoints.value.push({
                lng: Number(lng),
                lat: Number(lat)
              })
            }
          }
          
          console.log('✅ 提取完成，路径点数量:', pathPoints.value.length)
          if (pathPoints.value.length > 0) {
            console.log('📍 第一个点:', JSON.stringify(pathPoints.value[0]))
            console.log('📍 最后一个点:', JSON.stringify(pathPoints.value[pathPoints.value.length - 1]))
          }
          
          // 调整地图视野
          if (pathPoints.value.length > 0) {
            const startPoint = pathPoints.value[0]
            const endPoint = pathPoints.value[pathPoints.value.length - 1]
            
            map.value.centerAndZoom(new BMap.Point(
              (startPoint.lng + endPoint.lng) / 2,
              (startPoint.lat + endPoint.lat) / 2
            ), 15)
          }
          
          // 模拟无人机飞行
          console.log('🚁 开始模拟飞行...')
          simulateFlight()
          
          resolve(true)
        } else {
          console.error('❌ 百度地图路线规划失败:', driving.getStatus())
          ElMessage.error('路线规划失败：' + driving.getStatus())
          reject(new Error('百度地图路线规划失败'))
        }
      }
    })
    
    // 执行路线规划
    driving.search(start, end)
  })
}

// 模拟无人机飞行
const simulateFlight = () => {
  if (!pathPoints.value || pathPoints.value.length === 0) return
  
  if (is3DMode.value && threeScene.value) {
    // 3D模式飞行模拟
    createUAVModel()
    fly3DUAV()
  } else {
    // 2D 模式飞行模拟 - 使用流光路线和插值动画
    simulateFlight2D()
  }
}

// 2D 模式飞行模拟（流光路线 + 插值动画）
const simulateFlight2D = () => {
  console.log('🎬 开始 2D 飞行模拟...')
  
  // 1. 数据清洗：将树状结构的路径点扁平化为连续坐标
  flatPathCoords.value = flattenPathCoordinates()
  
  console.log('📍 扁平化后的路径坐标数量:', flatPathCoords.value.length)
  console.log('📍 第一个坐标:', flatPathCoords.value[0])
  console.log('📍 最后一个坐标:', flatPathCoords.value[flatPathCoords.value.length - 1])
  
  if (flatPathCoords.value.length < 2) {
    console.error('❌ 路径点不足 2 个，无法绘制路线')
    return
  }
  
  // 2. 计算路径参数
  calculatePathStats()
  
  // 3. 显示路径信息面板
  showPathInfo.value = true
  setTimeout(() => {
    initCharts()
  }, 100)
  
  // 4. 绘制流光路线
  drawFlowPolyline()
  
  // 5. 创建无人机图标标记
  createUavIconMarker()
  
  // 6. 启动插值动画
  startInterpolationAnimation()
}

// 计算路径统计参数
const calculatePathStats = () => {
  if (flatPathCoords.value.length < 2) return
  
  let totalDistance = 0
  
  // 计算总距离（使用 Haversine 公式）
  for (let i = 1; i < flatPathCoords.value.length; i++) {
    const prev = flatPathCoords.value[i - 1]
    const curr = flatPathCoords.value[i]
    totalDistance += getDistanceFromLatLonInMeters(prev.lat, prev.lng, curr.lat, curr.lng)
  }
  
  const avgSpeed = pathStats.value.avgSpeed // 默认 10 m/s
  const estimatedTime = totalDistance / avgSpeed
  
  pathStats.value = {
    totalDistance: Math.round(totalDistance),
    estimatedTime: Math.round(estimatedTime),
    pointCount: flatPathCoords.value.length,
    avgSpeed: avgSpeed,
    startCoord: `${flatPathCoords.value[0].lat.toFixed(6)}, ${flatPathCoords.value[0].lng.toFixed(6)}`,
    endCoord: `${flatPathCoords.value[flatPathCoords.value.length - 1].lat.toFixed(6)}, ${flatPathCoords.value[flatPathCoords.value.length - 1].lng.toFixed(6)}`
  }
}

// Haversine 公式计算两点间距离
const getDistanceFromLatLonInMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000 // 地球半径（米）
  const dLat = deg2rad(lat2 - lat1)
  const dLon = deg2rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

const deg2rad = (deg) => {
  return deg * (Math.PI / 180)
}

// 初始化图表
const initCharts = () => {
  if (!chartContainer.value || flatPathCoords.value.length === 0) return
  
  // 动态导入 ECharts
  import('echarts').then((echarts) => {
    // 距离累积图
    const distances = [0]
    for (let i = 1; i < flatPathCoords.value.length; i++) {
      const prev = flatPathCoords.value[i - 1]
      const curr = flatPathCoords.value[i]
      const dist = getDistanceFromLatLonInMeters(prev.lat, prev.lng, curr.lat, curr.lng)
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
        formatter: function(params) {
          const point = flatPathCoords.value[params[0].dataIndex]
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
  }).catch(err => {
    console.error('加载 ECharts 失败:', err)
  })
}

// 数据清洗：扁平化路径坐标
const flattenPathCoordinates = () => {
  const coords = []
  // 如果是百度地图返回的树状结构，需要展平
  // 这里假设 pathPoints 已经是连续的坐标点
  pathPoints.value.forEach(point => {
    coords.push({
      lng: point.lng || point.getLongitude(),
      lat: point.lat || point.getLatitude()
    })
  })
  return coords
}

// 绘制流光路线（多层 Canvas 叠加）
const drawFlowPolyline = () => {
  console.log('🎨 开始绘制流光路线...')
  
  if (!map.value) {
    console.error('❌ 地图实例不存在')
    return
  }
  
  if (flatPathCoords.value.length < 2) {
    console.error('❌ 路径坐标不足 2 个')
    return
  }
  
  // 清除旧路径
  if (pathPolyline.value) {
    map.value.removeOverlay(pathPolyline.value)
  }
  
  // 根据算法获取颜色
  const color = getAlgorithmColor(selectedAlgorithm.value)
  console.log('🎨 使用颜色:', color, '算法:', selectedAlgorithm.value)
  
  // 创建多层半透明线条实现发光效果
  const layers = [
    { width: 8, opacity: 0.1 },  // 外层：宽且淡
    { width: 5, opacity: 0.3 },  // 中层
    { width: 3, opacity: 0.8 }   // 内层：窄且实
  ]
  
  layers.forEach((layer, index) => {
    const polyline = new BMap.Polyline(
      flatPathCoords.value.map(coord => new BMap.Point(coord.lng, coord.lat)),
      {
        strokeColor: color,
        strokeWeight: layer.width,
        strokeOpacity: layer.opacity,
        enableClicking: false
      }
    )
    map.value.addOverlay(polyline)
    console.log(`✅ 绘制第 ${index + 1} 层线条，宽度：${layer.width}, 透明度：${layer.opacity}`)
    
    // 保存最内层用于流动动画
    if (index === layers.length - 1) {
      pathPolyline.value = polyline
    }
  })
  
  console.log('✅ 流光路线绘制完成，总层数:', layers.length)
  
  // 启动流光动画
  startFlowAnimation()
}

// 启动流光动画
const startFlowAnimation = () => {
  if (!pathPolyline.value) return
  
  let offset = 0
  const animate = () => {
    offset = (offset + 1) % 100
    // 通过设置 strokeDashArray 实现流动效果
    pathPolyline.value.setStrokeStyle({
      strokeDashArray: `${offset * 10}, ${100 - offset * 10}`
    })
    flowAnimationRef.value = requestAnimationFrame(animate)
  }
  animate()
}

// 创建无人机图标标记
const createUavIconMarker = () => {
  if (uavIconMarker.value) {
    map.value.removeOverlay(uavIconMarker.value)
  }
  
  // 使用自定义图标
  const icon = new BMap.Icon(
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNEQ0RkMzIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjgiLz48cGF0aCBkPSJNMTIgNFYyTTEyIDIwdjJNNCAxMmgyTTIwIDEyaC0yIi8+PC9zdmc+',
    new BMap.Size(32, 32)
  )
  
  uavIconMarker.value = new BMap.Marker(flatPathCoords.value[0], { icon })
  map.value.addOverlay(uavIconMarker.value)
}

// 启动插值动画
const startInterpolationAnimation = () => {
  if (flatPathCoords.value.length < 2 || !uavIconMarker.value) return
  
  animationStartTime.value = Date.now()
  const totalPoints = flatPathCoords.value.length
  
  const interpolate = () => {
    const elapsed = Date.now() - animationStartTime.value
    const progress = Math.min(elapsed / animationDuration.value, 1)
    
    // 计算当前应该到达的点索引
    const currentIndex = Math.floor(progress * (totalPoints - 1))
    const nextIndex = Math.min(currentIndex + 1, totalPoints - 1)
    
    // 线性插值
    const currentPoint = flatPathCoords.value[currentIndex]
    const nextPoint = flatPathCoords.value[nextIndex]
    
    const segmentProgress = (progress * (totalPoints - 1)) - currentIndex
    const lng = currentPoint.lng + (nextPoint.lng - currentPoint.lng) * segmentProgress
    const lat = currentPoint.lat + (nextPoint.lat - currentPoint.lat) * segmentProgress
    
    // 更新无人机位置
    const newPosition = new BMap.Point(lng, lat)
    uavIconMarker.value.setPosition(newPosition)
    
    // 计算并更新旋转角度
    updateUavRotation(currentPoint, nextPoint)
    
    // 继续动画
    if (progress < 1) {
      requestAnimationFrame(interpolate)
    }
  }
  
  interpolate()
}

// 更新无人机旋转角度
const updateUavRotation = (current, next) => {
  if (!uavIconMarker.value) return
  
  // 计算向量角度
  const dx = next.lng - current.lng
  const dy = next.lat - current.lat
  const angle = Math.atan2(dy, dx) * 180 / Math.PI
  
  // 设置图标旋转（百度地图 Marker 不支持直接旋转，需要使用 Canvas 自定义）
  // 这里简化处理，实际项目中可以使用 Canvas 绘制旋转图标
  console.log('无人机朝向:', angle.toFixed(2), '度')
}

// 3D无人机飞行
const fly3DUAV = () => {
  if (!pathPoints.value || pathPoints.value.length === 0 || !uav3DModel.value) return
  
  let index = 0
  const animate = () => {
    if (index < pathPoints.value.length - 1) {
      // 更新无人机位置
      const currentPoint = pathPoints.value[index]
      const nextPoint = pathPoints.value[index + 1]
      
      // 计算位置和方向
      const currentLatLng = new BMapGL.Point(currentPoint.lng, currentPoint.lat)
      const nextLatLng = new BMapGL.Point(nextPoint.lng, nextPoint.lat)
      
      // 转换为屏幕坐标
      const currentPixel = map.value.pointToOverlayPixel(currentLatLng)
      const nextPixel = map.value.pointToOverlayPixel(nextLatLng)
      
      // 计算方向角
      const dx = nextPixel.x - currentPixel.x
      const dy = nextPixel.y - currentPixel.y
      const angle = Math.atan2(dy, dx) + Math.PI / 2
      
      // 更新3D模型位置和旋转
      uav3DModel.value.position.set(
        (currentPixel.x - mapContainer.value.clientWidth / 2) / 100,
        -(currentPixel.y - mapContainer.value.clientHeight / 2) / 100,
        0
      )
      uav3DModel.value.rotation.z = angle
      
      // 移动到下一个点
      index++
      
      // 更新相机位置
      updateCamera(currentLatLng)
      
      // 渲染场景
      renderThreeJS()
      
      // 继续动画
      animationId.value = requestAnimationFrame(animate)
    }
  }
  
  animate()
}

// 更新相机位置
const updateCamera = (targetPoint) => {
  if (!threeCamera.value || !map.value) return
  
  const pixel = map.value.pointToOverlayPixel(targetPoint)
  
  // 设置相机位置，跟随无人机
  threeCamera.value.position.set(
    (pixel.x - mapContainer.value.clientWidth / 2) / 100,
    -(pixel.y - mapContainer.value.clientHeight / 2) / 100 - 5,
    10
  )
  
  // 看向无人机
  threeCamera.value.lookAt(
    (pixel.x - mapContainer.value.clientWidth / 2) / 100,
    -(pixel.y - mapContainer.value.clientHeight / 2) / 100,
    0
  )
}

// 渲染Three.js场景
const renderThreeJS = () => {
  if (threeRenderer.value && threeScene.value && threeCamera.value) {
    threeRenderer.value.render(threeScene.value, threeCamera.value)
  }
}

// 清除路径
const clearPath = () => {
  // 清除路径线
  if (pathPolyline.value) {
    map.value.removeOverlay(pathPolyline.value)
    pathPolyline.value = null
  }
  
  // 清除标记
  if (startMarker.value) {
    map.value.removeOverlay(startMarker.value)
    startMarker.value = null
  }
  
  if (endMarker.value) {
    map.value.removeOverlay(endMarker.value)
    endMarker.value = null
  }
  
  if (uavMarker.value) {
    map.value.removeOverlay(uavMarker.value)
    uavMarker.value = null
  }
  
  if (uavIconMarker.value) {
    map.value.removeOverlay(uavIconMarker.value)
    uavIconMarker.value = null
  }
  
  // 清除定时器
  if (flyInterval.value) {
    clearInterval(flyInterval.value)
    flyInterval.value = null
  }
  
  // 清除流光动画
  if (flowAnimationRef.value) {
    cancelAnimationFrame(flowAnimationRef.value)
    flowAnimationRef.value = null
  }
  
  // 清除动画
  if (animationId.value) {
    cancelAnimationFrame(animationId.value)
    animationId.value = null
  }
  
  // 清除 3D 模型
  if (uav3DModel.value && threeScene.value) {
    threeScene.value.remove(uav3DModel.value)
    uav3DModel.value = null
  }
  
  pathPoints.value = []
  flatPathCoords.value = []
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
    if (is3DMode.value) {
      distance += map.value.getDistance(pathPoints.value[i], pathPoints.value[i + 1])
    } else {
      distance += map.value.getDistance(pathPoints.value[i], pathPoints.value[i + 1])
    }
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

// 切换2D/3D模式
const toggleMapMode = () => {
  is3DMode.value = !is3DMode.value
  clearPath()
  initMap()
}

// 调整3D视角
const adjustView = (direction) => {
  if (!map.value || !is3DMode.value) return
  
  const currentHeading = map.value.getHeading()
  const currentTilt = map.value.getTilt()
  const currentCenter = map.value.getCenter()
  
  switch (direction) {
    case 'forward':
      // 向前移动视角
      map.value.panBy(0, -50)
      break
    case 'backward':
      // 向后移动视角
      map.value.panBy(0, 50)
      break
    case 'left':
      // 向左移动视角
      map.value.panBy(-50, 0)
      break
    case 'right':
      // 向右移动视角
      map.value.panBy(50, 0)
      break
    case 'up':
      // 上升视角（减小倾斜角度）
      map.value.setTilt(Math.max(0, currentTilt - 10))
      break
    case 'down':
      // 下降视角（增大倾斜角度）
      map.value.setTilt(Math.min(80, currentTilt + 10))
      break
  }
}

// 聚焦到起点
const focusOnStartPoint = () => {
  if (!map.value || !startMarker.value) return
  
  const startPoint = startMarker.value.getPosition()
  map.value.centerAndZoom(startPoint, 15)
  if (is3DMode.value) {
    map.value.setHeading(45)
    map.value.setTilt(60)
  }
}

// 聚焦到终点
const focusOnEndPoint = () => {
  if (!map.value || !endMarker.value) return
  
  const endPoint = endMarker.value.getPosition()
  map.value.centerAndZoom(endPoint, 15)
  if (is3DMode.value) {
    map.value.setHeading(45)
    map.value.setTilt(60)
  }
}

// 重置视角
const resetView = () => {
  if (!map.value) return
  
  // 重置到南昌市中心
  const point = is3DMode.value ? new BMapGL.Point(115.892151, 28.676493) : new BMap.Point(115.892151, 28.676493)
  map.value.centerAndZoom(point, 13)
  if (is3DMode.value) {
    map.value.setHeading(45)
    map.value.setTilt(60)
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

// 组件卸载时清理
onUnmounted(() => {
  clearPath()
  if (threeRenderer.value && threeRenderer.value.domElement) {
    if (mapContainer.value) {
      mapContainer.value.removeChild(threeRenderer.value.domElement)
    }
  }
})

// 获取算法颜色
const getAlgorithmColor = (algorithmName) => {
  switch (algorithmName) {
    case 'A*算法':
      return '#10B981' // 绿色
    case '迪杰斯特拉算法':
      return '#3B82F6' // 蓝色
    case '蚁群算法':
      return '#F59E0B' // 橙色
    case '强化学习模型':
      return '#8B5CF6' // 紫色
    default:
      return '#4D4FC3' // 默认蓝色
  }
}

// 引入 Three.js
const THREE = window.THREE || {}
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
              <el-button @click="toggleMapMode" class="action-button info">
                {{ is3DMode ? '切换到2D模式' : '切换到3D模式' }}
              </el-button>
            </el-col>
          </el-row>
        </el-form>
      </div>
    </div>
    <!-- 地图展示 -->
    <div class="card fade-in" style="margin-top: 20px;">
      <div class="map-container" ref="mapContainer">
        <!-- 3D 视角控制按钮 -->
        <div v-if="is3DMode" class="view-control">
          <div class="view-control-title">视角控制</div>
          <div class="view-control-buttons">
            <el-button @click="adjustView('forward')">↑</el-button>
            <el-button @click="adjustView('up')">上仰</el-button>
            <el-button @click="adjustView('backward')">↓</el-button>
          </div>
          <div class="view-control-buttons">
            <el-button @click="adjustView('left')">←</el-button>
            <el-button @click="resetView()">重置</el-button>
            <el-button @click="adjustView('right')">→</el-button>
          </div>
          <div class="view-control-targets">
            <el-button @click="focusOnStartPoint" :disabled="!startMarker.value">聚焦起点</el-button>
            <el-button @click="focusOnEndPoint" :disabled="!endMarker.value">聚焦终点</el-button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 路径信息可视化面板 -->
    <div v-if="showPathInfo" class="card fade-in" style="margin-top: 20px;">
      <div class="path-info-panel">
        <div class="path-info-title">📊 路径参数可视化</div>
        
        <!-- 统计卡片 -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">总距离</div>
            <div class="stat-value">{{ pathStats.totalDistance }}</div>
            <div class="stat-unit">米</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">预计时间</div>
            <div class="stat-value">{{ pathStats.estimatedTime }}</div>
            <div class="stat-unit">秒</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">路径点数</div>
            <div class="stat-value">{{ pathStats.pointCount }}</div>
            <div class="stat-unit">个</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">平均速度</div>
            <div class="stat-value">{{ pathStats.avgSpeed }}</div>
            <div class="stat-unit">m/s</div>
          </div>
        </div>
        
        <!-- 坐标信息 -->
        <div class="coord-info">
          <div class="coord-item">
            <span class="coord-label">📍 起点坐标：</span>
            <span class="coord-value">{{ pathStats.startCoord }}</span>
          </div>
          <div class="coord-item">
            <span class="coord-label">🏁 终点坐标：</span>
            <span class="coord-value">{{ pathStats.endCoord }}</span>
          </div>
        </div>
        
        <!-- 图表容器 -->
        <div ref="chartContainer" class="chart-container"></div>
      </div>
    </div>
    
    <!-- 算法对比面板 -->
    <div v-if="showComparePanel && compareResults" class="card fade-in" style="margin-top: 20px;">
      <div class="compare-panel">
        <div class="compare-title">⚖️ 算法对比分析</div>
        
        <!-- 对比表格 -->
        <div class="comparison-table">
          <div class="table-header">
            <div class="header-cell">指标</div>
            <div class="header-cell">A*算法</div>
            <div class="header-cell">迪杰斯特拉算法</div>
          </div>
          <div class="table-row">
            <div class="cell-label">📏 总距离</div>
            <div class="cell-value" :class="{ 'better': compareResults.astar.distance <= compareResults.dijkstra.distance }">
              {{ compareResults.astar.distance }} 米
            </div>
            <div class="cell-value" :class="{ 'better': compareResults.dijkstra.distance < compareResults.astar.distance }">
              {{ compareResults.dijkstra.distance }} 米
            </div>
          </div>
          <div class="table-row">
            <div class="cell-label">⏱️ 预计时间</div>
            <div class="cell-value" :class="{ 'better': compareResults.astar.time <= compareResults.dijkstra.time }">
              {{ compareResults.astar.time }} 秒
            </div>
            <div class="cell-value" :class="{ 'better': compareResults.dijkstra.time < compareResults.astar.time }">
              {{ compareResults.dijkstra.time }} 秒
            </div>
          </div>
          <div class="table-row">
            <div class="cell-label">🔢 路径点数</div>
            <div class="cell-value" :class="{ 'better': compareResults.astar.points <= compareResults.dijkstra.points }">
              {{ compareResults.astar.points }} 个
            </div>
            <div class="cell-value" :class="{ 'better': compareResults.dijkstra.points < compareResults.astar.points }">
              {{ compareResults.dijkstra.points }} 个
            </div>
          </div>
        </div>
        
        <!-- 推荐结果 -->
        <div v-if="compareResults.recommendation" class="recommendation-box">
          <div class="recommendation-title">
            🏆 推荐算法：<span class="highlight">{{ compareResults.recommendation.algorithm }}</span>
          </div>
          <div class="recommendation-reasons">
            <div v-for="(reason, index) in compareResults.recommendation.reasons" :key="index" class="reason-item">
              {{ reason }}
            </div>
          </div>
          <div class="recommendation-advantages">
            <strong>优势：</strong>
            <ul>
              <li v-for="(adv, index) in compareResults.recommendation.advantages" :key="index">
                {{ adv }}
              </li>
            </ul>
          </div>
        </div>
      </div>
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
  position: relative;
  overflow: visible; /* 允许内容溢出，确保按钮可见 */
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

.action-button.info:hover {
  box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
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

/* 3D视角控制按钮样式 */
.view-control {
  position: absolute;
  top: 80px; /* 向下移动，避免与地图默认控件重叠 */
  right: 20px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 15px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  z-index: 999999; /* 进一步提高z-index确保在地图之上 */
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
  pointer-events: auto; /* 确保按钮可以被点击 */
}

.view-control:hover {
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.2);
  transform: translateY(-2px);
}

.view-control-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 15px;
  color: #4D4FC3;
  text-align: center;
  font-family: 'Arial', sans-serif;
}

.view-control-buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 15px;
}

.view-control-buttons .el-button {
  border-radius: 8px;
  transition: all 0.2s ease;
  border: 1px solid #E4E7ED;
}

.view-control-buttons .el-button:hover {
  background-color: #4D4FC3;
  color: white;
  border-color: #4D4FC3;
  transform: scale(1.05);
}

.view-control-targets {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.view-control-targets .el-button {
  border-radius: 8px;
  transition: all 0.2s ease;
  border: 1px solid #E4E7ED;
}

.view-control-targets .el-button:hover {
  background-color: #4D4FC3;
  color: white;
  border-color: #4D4FC3;
  transform: scale(1.05);
}

.view-control-targets .el-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.view-control-targets .el-button:disabled:hover {
  background-color: #F5F7FA;
  color: #C0C4CC;
  border-color: #E4E7ED;
  transform: none;
}

/* 路径信息面板样式 */
.path-info-panel {
  padding: 20px;
}

.path-info-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 20px;
  color: #4D4FC3;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
  margin-bottom: 20px;
}

.stat-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  color: white;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
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
    rgba(255, 255, 255, 0.1) 50%,
    transparent 70%
  );
  transform: rotate(45deg);
  transition: all 0.5s ease;
}

.stat-card:hover::before {
  left: 100%;
}

.stat-card:hover {
  transform: translateY(-5px) scale(1.02);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

.stat-label {
  font-size: 14px;
  opacity: 0.9;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  margin-bottom: 4px;
}

.stat-unit {
  font-size: 12px;
  opacity: 0.8;
}

.coord-info {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
}

.coord-item {
  margin-bottom: 8px;
  font-size: 14px;
}

.coord-item:last-child {
  margin-bottom: 0;
}

.coord-label {
  font-weight: 600;
  color: #4D4FC3;
}

.coord-value {
  color: #666;
  font-family: 'Courier New', monospace;
}

.chart-container {
  width: 100%;
  height: 400px;
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-sizing: border-box;
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

/* 算法对比面板样式 */
.compare-panel {
  padding: 20px;
}

.compare-title {
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 20px;
  color: #4D4FC3;
  text-align: center;
}

.comparison-table {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
}

.table-header {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-weight: bold;
  padding: 15px;
}

.header-cell {
  text-align: center;
  font-size: 16px;
}

.table-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 15px;
  border-bottom: 1px solid #e8e8e8;
  background: white;
  transition: all 0.3s ease;
}

.table-row:last-child {
  border-bottom: none;
}

.table-row:hover {
  background: #f8f9fa;
}

.cell-label {
  font-weight: 600;
  color: #666;
  display: flex;
  align-items: center;
  gap: 8px;
}

.cell-value {
  text-align: center;
  font-size: 15px;
  color: #333;
  font-weight: 500;
  padding: 8px;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.cell-value.better {
  background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
  color: #2d3748;
  font-weight: bold;
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(168, 237, 234, 0.4);
}

.recommendation-box {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  border-radius: 12px;
  padding: 20px;
  color: white;
  box-shadow: 0 4px 15px rgba(240, 147, 251, 0.4);
}

.recommendation-title {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 15px;
  text-align: center;
}

.recommendation-title .highlight {
  background: rgba(255, 255, 255, 0.3);
  padding: 4px 12px;
  border-radius: 20px;
  margin-left: 8px;
  font-size: 20px;
}

.recommendation-reasons {
  margin-bottom: 15px;
}

.reason-item {
  background: rgba(255, 255, 255, 0.2);
  padding: 10px 15px;
  border-radius: 8px;
  margin-bottom: 8px;
  font-size: 14px;
}

.recommendation-advantages ul {
  list-style: none;
  padding-left: 0;
  margin: 0;
}

.recommendation-advantages li {
  background: rgba(255, 255, 255, 0.15);
  padding: 10px 15px;
  border-radius: 8px;
  margin-bottom: 8px;
  font-size: 14px;
}

@media (max-width: 768px) {
  .table-header,
  .table-row {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  
  .header-cell,
  .cell-label,
  .cell-value {
    text-align: left;
  }
  
  .cell-value.better {
    transform: none;
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
  
  .view-control {
    top: 70px; /* 向下移动，避免与地图默认控件重叠 */
    right: 10px;
    padding: 10px;
    max-width: 200px;
  }
  
  .view-control-title {
    font-size: 14px;
    margin-bottom: 10px;
  }
  
  .view-control-buttons {
    grid-template-columns: repeat(2, 1fr);
    gap: 5px;
    margin-bottom: 10px;
  }
  
  .view-control-targets {
    gap: 5px;
  }
  
  .view-control-buttons .el-button,
  .view-control-targets .el-button {
    font-size: 12px;
    padding: 8px;
  }
}
</style>