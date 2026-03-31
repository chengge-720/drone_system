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

// 2D 路径规划相关
const flowAnimationRef = ref(null) // 流光动画引用
const uavIconMarker = ref(null) // 无人机图标标记
const animationStartTime = ref(0) // 动画开始时间
const animationDuration = ref(3000) // 动画持续时间（毫秒）
const flatPathCoords = ref([]) // 扁平化的路径坐标

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
    
    // 3D模式下使用后端算法
    console.log('🗺️ 3D模式：使用后端算法规划')
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
    
    const response = await apiPlanPath(requestData)
    console.log('📡 后端 API 响应:', response)
    
    if (response.code === 200 && response.data.success) {
      const pathData = response.data
      console.log('✅ 路径规划成功，数据:', pathData)
      
      // 提取路径点
      pathPoints.value = []
      if (pathData.pathPoints && pathData.pathPoints.length > 0) {
        pathData.pathPoints.forEach((point, index) => {
          console.log(`点 ${index}:`, point)
          pathPoints.value.push({
            lng: point.lng,
            lat: point.lat
          })
        })
        
        console.log('✅ 后端返回的路径点数量:', pathPoints.value.length)
        console.log('✅ 第一个点:', pathPoints.value[0])
        console.log('✅ 最后一个点:', pathPoints.value[pathPoints.value.length - 1])
        
        // 调整地图视野以包含整个路径
        if (pathPoints.value.length > 0) {
          const startPoint = pathPoints.value[0]
          const endPoint = pathPoints.value[pathPoints.value.length - 1]
          
          // 创建一个包含起点和终点的边界
          if (is3DMode.value) {
            map.value.centerAndZoom(new BMapGL.Point(
              (startPoint.lng + endPoint.lng) / 2,
              (startPoint.lat + endPoint.lat) / 2
            ), 15)
          } else {
            map.value.centerAndZoom(new BMap.Point(
              (startPoint.lng + endPoint.lng) / 2,
              (startPoint.lat + endPoint.lat) / 2
            ), 15)
          }
        }
        
        // 模拟无人机飞行
        console.log('🚁 开始模拟飞行...')
        simulateFlight()
      } else {
        console.error('❌ 未找到有效路径')
        ElMessage.error('路径规划失败：未找到有效路径')
      }
    } else {
      console.error('❌ 路径规划失败:', response)
      ElMessage.error('路径规划失败：' + (response.message || '未知错误'))
    }
  } catch (error) {
    console.error('❌ 调用后端 API 失败:', error)
    ElMessage.error('路径规划失败：' + (error as Error).message)
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
          
          // 提取路径点
          pathPoints.value = []
          for (let i = 0; i < route.getNumPoints(); i++) {
            const point = route.getPoint(i)
            pathPoints.value.push({
              lng: point.lng,
              lat: point.lat
            })
          }
          
          console.log('📍 百度地图返回的路径点数量:', pathPoints.value.length)
          if (pathPoints.value.length > 0) {
            console.log('📍 第一个点:', pathPoints.value[0])
            console.log('📍 最后一个点:', pathPoints.value[pathPoints.value.length - 1])
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
  
  // 2. 绘制流光路线
  drawFlowPolyline()
  
  // 3. 创建无人机图标标记
  createUavIconMarker()
  
  // 4. 启动插值动画
  startInterpolationAnimation()
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