/**
 * 飞行模拟控制模块
 * 负责 2D/3D模式下的无人机飞行动画模拟
 */

import { PathAnimationManager } from './pathAnimation'

/**
 * 飞行模拟配置
 */
export const FLIGHT_CONFIG = {
  animationDuration: 3000,  // 动画持续时间（毫秒）
  frameRate: 60,            // 帧率
  speedFactor: 1.0          // 速度系数
}

/**
 * 2D 模式飞行模拟（流光路线 + 插值动画）
 * @param {Object} map - 地图实例
 * @param {Array} pathPoints - 路径点数组
 * @param {Ref} uavIconMarker - 无人机图标标记引用
 * @param {Ref} pathPolyline - 路径线引用
 * @param {Ref} flowAnimationRef - 流光动画引用
 * @param {Ref} animationId - 动画 ID 引用
 * @param {Function} flattenPathCoordinates - 扁平化路径坐标函数
 * @param {Function} calculatePathStats - 计算路径统计函数
 * @returns {Object} 包含动画管理器和路径统计的对象
 */
export const simulateFlight2D = async (
  map,
  pathPoints,
  uavIconMarker,
  pathPolyline,
  flowAnimationRef,
  animationId,
  flattenPathCoordinates,
  calculatePathStats
) => {
  if (!map || !pathPoints || pathPoints.length === 0) {
    console.error('❌ 无法开始 2D 飞行模拟：参数不完整')
    return null
  }
  
  try {
    console.log('🎬 开始 2D 飞行模拟...')
    
    // 1. 数据清洗：扁平化路径坐标
    const flatPathCoords = flattenPathCoordinates(pathPoints)
    
    console.log('📍 扁平化后的路径坐标数量:', flatPathCoords.length)
    
    if (flatPathCoords.length < 2) {
      console.error('❌ 路径点不足 2 个，无法绘制路线')
      return null
    }
    
    // 2. 计算路径参数
    const pathStats = calculatePathStats(flatPathCoords)
    
    // 3. 绘制流光路线
    await drawFlowPolyline(
      map,
      flatPathCoords,
      uavIconMarker,
      pathPolyline,
      flowAnimationRef
    )
    
    // 4. 创建动画管理器并启动动画
    const animationManager = new PathAnimationManager(
      map,
      flatPathCoords,
      uavIconMarker,
      pathPolyline.value,
      flowAnimationRef,
      animationId,
      { duration: FLIGHT_CONFIG.animationDuration }
    )
    
    animationManager.createUavIconMarker()
    animationManager.startInterpolationAnimation()
    animationManager.startFlowAnimation()
    
    console.log('✅ 2D 飞行模拟启动成功')
    
    return {
      animationManager,
      pathStats,
      flatPathCoords
    }
  } catch (error) {
    console.error('❌ 2D 飞行模拟失败:', error)
    return null
  }
}

/**
 * 绘制流光路线（多层 Canvas 叠加）
 * @param {Object} map - 地图实例
 * @param {Array} flatPathCoords - 扁平化路径坐标
 * @param {Ref} uavIconMarker - 无人机图标标记引用
 * @param {Ref} pathPolyline - 路径线引用
 * @param {Ref} flowAnimationRef - 流光动画引用
 */
export const drawFlowPolyline = async (
  map,
  flatPathCoords,
  uavIconMarker,
  pathPolyline,
  flowAnimationRef
) => {
  if (!map) {
    console.error('❌ 地图实例不存在')
    return
  }
  
  if (flatPathCoords.length < 2) {
    console.error('❌ 路径坐标不足 2 个')
    return
  }
  
  // 清除旧路径
  if (pathPolyline.value) {
    map.removeOverlay(pathPolyline.value)
  }
  
  // 使用默认颜色（蓝色）
  const color = '#3B82F6'
  
  // 创建多层半透明线条实现发光效果
  const layers = [
    { width: 8, opacity: 0.1 },   // 外层：宽且淡
    { width: 5, opacity: 0.3 },   // 中层
    { width: 3, opacity: 0.8 }    // 内层：窄且实
  ]
  
  layers.forEach((layer, index) => {
    const polyline = new BMap.Polyline(
      flatPathCoords.map(coord => new BMap.Point(coord.lng, coord.lat)),
      {
        strokeColor: color,
        strokeWeight: layer.width,
        strokeOpacity: layer.opacity,
        enableClicking: false
      }
    )
    map.addOverlay(polyline)
    
    // 保存最内层用于流动动画
    if (index === layers.length - 1) {
      pathPolyline.value = polyline
    }
  })
  
  console.log('✅ 流光路线绘制完成，总层数:', layers.length)
}

/**
 * 3D模式飞行模拟
 * @param {Array} pathPoints - 路径点数组
 * @param {THREE.Group} uav3DModel - 3D 无人机模型
 * @param {Object} map - 地图实例
 * @param {HTMLElement} container - 地图容器
 * @param {Function} updateCamera - 更新相机函数
 * @param {Function} renderThreeJS - 渲染 Three.js 函数
 * @returns {Function} 停止动画的函数
 */
export const simulateFlight3D = (
  pathPoints,
  uav3DModel,
  map,
  container,
  updateCamera,
  renderThreeJS
) => {
  if (!pathPoints || pathPoints.length === 0 || !uav3DModel || !map) {
    console.error('❌ 无法开始 3D 飞行模拟：参数不完整')
    return () => {}
  }
  
  let index = 0
  let animationId = null
  let isRunning = true
  
  const animate = () => {
    if (!isRunning) return
    
    if (index < pathPoints.length - 1) {
      const currentPoint = pathPoints[index]
      const nextPoint = pathPoints[index + 1]
      
      // 转换为屏幕坐标
      const currentPixel = map.pointToOverlayPixel(
        new BMapGL.Point(currentPoint.lng, currentPoint.lat)
      )
      const nextPixel = map.pointToOverlayPixel(
        new BMapGL.Point(nextPoint.lng, nextPoint.lat)
      )
      
      // 更新无人机位置和旋转
      const dx = nextPixel.x - currentPixel.x
      const dy = nextPixel.y - currentPixel.y
      const angle = Math.atan2(dy, dx) + Math.PI / 2
      
      uav3DModel.position.set(
        (currentPixel.x - container.clientWidth / 2) / 100,
        -(currentPixel.y - container.clientHeight / 2) / 100,
        0
      )
      uav3DModel.rotation.z = angle
      
      // 移动到下一个点
      index++
      
      // 更新相机位置
      updateCamera(new BMapGL.Point(currentPoint.lng, currentPoint.lat))
      
      // 渲染场景
      renderThreeJS()
      
      // 继续动画
      animationId = requestAnimationFrame(animate)
    }
  }
  
  // 启动动画
  animate()
  console.log('🚁 3D 飞行模拟已启动')
  
  // 返回停止动画的函数
  return () => {
    isRunning = false
    if (animationId) {
      cancelAnimationFrame(animationId)
    }
    console.log('⏹️ 3D 飞行模拟已停止')
  }
}

/**
 * 停止所有飞行动画
 * @param {Object} animationManager - 2D 动画管理器
 * @param {Function} stop3DAnimation - 3D 动画停止函数
 * @param {Ref} flowAnimationRef - 流光动画引用
 * @param {Ref} animationId - 动画 ID 引用
 */
export const stopAllFlightAnimations = (
  animationManager,
  stop3DAnimation,
  flowAnimationRef,
  animationId
) => {
  // 停止 2D 动画
  if (animationManager) {
    animationManager.clearAnimations()
  }
  
  // 停止 3D 动画
  if (stop3DAnimation && typeof stop3DAnimation === 'function') {
    stop3DAnimation()
  }
  
  // 取消流光动画
  if (flowAnimationRef.value) {
    cancelAnimationFrame(flowAnimationRef.value)
    flowAnimationRef.value = null
  }
  
  // 取消其他动画
  if (animationId.value) {
    cancelAnimationFrame(animationId.value)
    animationId.value = null
  }
  
  console.log('⏹️ 所有飞行动画已停止')
}

/**
 * 默认导出所有方法
 */
export default {
  simulateFlight2D,
  drawFlowPolyline,
  simulateFlight3D,
  stopAllFlightAnimations,
  FLIGHT_CONFIG
}
