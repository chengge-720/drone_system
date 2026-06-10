/**
 * 飞行模拟控制模块
 * 负责 2D/3D模式下的无人机飞行动画模拟
 */

import { PathAnimationManager } from './pathAnimation'
import { pathLengthMeters3D, interpolateAlongPath } from './basicPathPlanner'
import {
  createPathLine3D,
  updatePathLineGeometry,
  lngLatAltToOverlayWorld,
  disposePathLine,
  decimatePathForLine
} from './uav3DModel'
import {
  buildObstacleOverlayGroup,
  updateObstacleOverlayGroupPositions,
  disposeObstacleOverlayGroup
} from './obstacle3DOverlay'

/**
 * 飞行模拟配置
 */
export const FLIGHT_CONFIG = {
  animationDuration: 3000,  // 动画持续时间（毫秒）
  frameRate: 60,            // 帧率
  speedFactor: 1.0          // 速度系数
}

// 用户当前要求：暂停动画效果，只生产路径并静态渲染
// 其它页面（如路径规划页）可以据此跳过额外的动画/渲染依赖请求
export const ENABLE_ANIMATIONS = false

// 3D 模式底图 Marker 已移除；此 base64 保留仅用于未来扩展
const UAV_BMAPGL_ICON_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNEQ0RkMzIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjgiLz48cGF0aCBkPSJNMTIgNHYyTTEyIDIwdjJNNCAxMmgyTTIwIDEyaC0yIi8+PC9zdmc+'

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
  calculatePathStats,
  renderOpts = {}
) => {
  if (!map || !pathPoints || pathPoints.length === 0) {
    console.error('❌ 无法开始 2D 飞行模拟：参数不完整')
    return null
  }

  const animEnabled = renderOpts?.forceAnimations ?? ENABLE_ANIMATIONS
  
  try {
    console.log('🎬 开始 2D 飞行模拟...')

    if (!animEnabled) {
      try {
        const flowId = flowAnimationRef?.value
        if (typeof flowId === 'number') cancelAnimationFrame(flowId)
        if (flowAnimationRef) flowAnimationRef.value = null
      } catch {}
      try {
        const animId = animationId?.value
        if (typeof animId === 'number') cancelAnimationFrame(animId)
        if (animationId) animationId.value = null
      } catch {}
      try {
        const m = uavIconMarker?.value || uavIconMarker
        if (m?.setMap) m.setMap(null)
        if (uavIconMarker?.value !== undefined) uavIconMarker.value = null
      } catch {}
      try {
        const pl = pathPolyline?.value
        if (Array.isArray(pl)) pl.forEach((p) => p?.setMap?.(null))
        else if (pl?.setMap) pl.setMap(null)
        if (pathPolyline) pathPolyline.value = null
      } catch {}
    }
    
    // 1. 数据清洗：扁平化路径坐标
    const flatPathCoords = flattenPathCoordinates(pathPoints)
    
    console.log('📍 扁平化后的路径坐标数量:', flatPathCoords.length)
    
    if (flatPathCoords.length < 2) {
      console.error('❌ 路径点不足 2 个，无法绘制路线')
      return null
    }
    
    // 2. 计算路径参数
    const pathStats = calculatePathStats(flatPathCoords)
    
    const failureDisplay = renderOpts?.failureDisplay || {}
    const lineCoords =
      failureDisplay?.enabled ? sampleFlatPathCoords(flatPathCoords, 14) : flatPathCoords

    // 3. 绘制路线
    await drawFlowPolyline(map, lineCoords, uavIconMarker, pathPolyline, flowAnimationRef, {
      enableFlow: animEnabled,
      enhancedStyle: Boolean(renderOpts?.enhancedStyle),
      failureStyle: Boolean(failureDisplay?.enabled)
    })

    drawFailureMarkers(map, renderOpts, {
      start: flatPathCoords[0],
      failedEnd: flatPathCoords[flatPathCoords.length - 1]
    })

    if (!animEnabled) {
      console.log('✅ 路径已绘制（动画已暂停）')
      return {
        animationManager: null,
        pathStats,
        flatPathCoords
      }
    }

    const speedMps = Math.max(1, Number(renderOpts?.speedMps || 10))
    const totalDist = Number(pathStats?.totalDistance || 0)
    const animDuration = Math.min(
      90000,
      Math.max(10000, renderOpts?.animationDurationMs || (totalDist / speedMps) * 1000)
    )

    // 4. 创建动画管理器并启动动画（多层折线时只驱动最内层）
    const polyForAnim = Array.isArray(pathPolyline.value)
      ? pathPolyline.value[pathPolyline.value.length - 1]
      : pathPolyline.value
    const animationManager = new PathAnimationManager(
      map,
      flatPathCoords,
      uavIconMarker,
      polyForAnim,
      flowAnimationRef,
      animationId,
      {
        duration: animDuration,
        flowSpeed: 1,
        loop: Boolean(renderOpts?.loopAnimation)
      }
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
  flowAnimationRef,
  opts = {}
) => {
  const { enableFlow = true, failureStyle = false, enhancedStyle = false } = opts
  if (!map) {
    console.error('❌ 地图实例不存在')
    return
  }
  
  if (flatPathCoords.length < 2) {
    console.error('❌ 路径坐标不足 2 个')
    return
  }
  
  // 清除旧路径（多层发光时曾只保存最内层，导致「清除路径」删不干净）
  const prev = pathPolyline.value
  if (Array.isArray(prev)) {
    prev.forEach((p) => p?.setMap?.(null))
  } else if (prev?.setMap) {
    prev.setMap(null)
  }
  pathPolyline.value = null

  const color = failureStyle ? '#2563EB' : enhancedStyle ? '#2563eb' : '#3B82F6'

  const layers = failureStyle
    ? [{ width: 4, opacity: 0.9, color }]
    : enhancedStyle
      ? [
          { width: 14, opacity: 0.1, color: '#22d3ee' },
          { width: 9, opacity: 0.22, color: '#38bdf8' },
          { width: 5, opacity: 0.55, color: '#3b82f6' },
          { width: 3, opacity: 0.95, color: '#1d4ed8' }
        ]
      : [
          { width: 8, opacity: 0.1, color },
          { width: 5, opacity: 0.3, color },
          { width: 3, opacity: 0.8, color }
        ]

  const created = []
  layers.forEach((layer) => {
    const polyline = new AMap.Polyline({
      path: flatPathCoords.map(coord => [coord.lng, coord.lat]),
      strokeColor: layer.color || color,
      strokeWeight: layer.width,
      strokeOpacity: layer.opacity,
      // 暂停动画时画实线，避免 AMap canvas 频繁重绘触发性能/警告
      ...(enableFlow ? { strokeDasharray: [0, 100] } : {}),
      map
    })
    created.push(polyline)
  })
  pathPolyline.value = created
  
  console.log('✅ 流光路线绘制完成，总层数:', layers.length)
}

const sampleFlatPathCoords = (coords, maxPoints = 14) => {
  if (!Array.isArray(coords) || coords.length <= maxPoints) return coords || []
  const sampled = []
  const n = coords.length
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i * (n - 1)) / (maxPoints - 1))
    sampled.push(coords[idx])
  }
  return sampled
}

const clearMarkersRef = (markersRef) => {
  const prev = markersRef?.value
  if (!Array.isArray(prev)) return
  prev.forEach((m) => m?.setMap?.(null))
  markersRef.value = []
}

const drawFailureMarkers = (map, renderOpts, points) => {
  const failureDisplay = renderOpts?.failureDisplay || {}
  const markersRef = renderOpts?.failureMarkersRef
  if (!markersRef) return
  clearMarkersRef(markersRef)
  if (!failureDisplay?.enabled || !map || !points?.start || !points?.failedEnd) return

  const goal = failureDisplay.goal
  const mk = (lng, lat, color) =>
    new AMap.CircleMarker({
      center: [lng, lat],
      radius: 7,
      strokeColor: '#FFFFFF',
      strokeWeight: 2,
      fillColor: color,
      fillOpacity: 0.95,
      zIndex: 160,
      map
    })

  const markers = []
  markers.push(mk(points.start.lng, points.start.lat, '#EF4444'))
  if (goal?.lng != null && goal?.lat != null) markers.push(mk(goal.lng, goal.lat, '#EF4444'))
  markers.push(mk(points.failedEnd.lng, points.failedEnd.lat, '#2563EB'))
  markersRef.value = markers
}

/**
 * 3D 模式：Three 叠层，按弧长插值（含 alt），航线为世界坐标折线
 * @param {Array<{ lng: number, lat: number, alt: number }>} pathPoints
 * @param {THREE.Group} uav3DModel
 * @param {Object} map 地图实例（需支持 lngLatToContainer 投影）
 * @param {HTMLElement} container 地图挂载容器（与 pointToOverlayPixel 一致）
 * @param {{ threeScene: THREE.Scene, camera: THREE.Camera, renderThreeJS: () => void, speedMps?: number, obstacles?: object[] }} deps
 * @returns {() => void} 停止动画并清理叠层辅助对象
 */
export const simulateFlight3D = (pathPoints, uav3DModel, map, container, deps) => {
  const { threeScene, camera, renderThreeJS, speedMps = 42, obstacles } = deps || {}

  if (!pathPoints || pathPoints.length === 0 || !uav3DModel || !map || !container) {
    console.error('❌ 无法开始 3D 飞行模拟：参数不完整')
    return () => {}
  }
  
  // 确保投影函数存在：AMap 使用 lngLatToContainer
  if (typeof map?.lngLatToContainer !== 'function') {
    console.warn('⏸️ 3D 叠层缺少 AMap 投影能力（lngLatToContainer 不存在），已跳过 3D 动画')
    return () => {}
  }
  if (!threeScene || !camera || typeof renderThreeJS !== 'function') {
    console.error('❌ 3D 飞行模拟缺少 threeScene / camera / renderThreeJS')
    return () => {}
  }

  if (threeScene.userData.__pathLine3D) {
    disposePathLine(threeScene.userData.__pathLine3D, threeScene)
    threeScene.userData.__pathLine3D = null
  }
  disposeObstacleOverlayGroup(threeScene)

  const pathLine = createPathLine3D(threeScene, pathPoints, map, container)
  threeScene.userData.__pathLine3D = pathLine

  if (obstacles?.length) {
    const obsGroup = buildObstacleOverlayGroup(obstacles, pathPoints, map, container)
    if (obsGroup) {
      threeScene.add(obsGroup)
      threeScene.userData.__obstacleOverlayGroup = obsGroup
    }
  }

  // 3D 模式：底图地面投影折线/Marker 暂不渲染（仅依赖 Three 叠层）

  const totalLen = Math.max(1, pathLengthMeters3D(pathPoints))
  const durationMs = Math.min(180000, Math.max(6000, (totalLen / speedMps) * 1000))

  let animationId = null
  let isRunning = true
  let t0 = performance.now()
  let currentS = 0
  let mapViewDebounce = null
  /** 机头朝向平滑，避免前瞻过短时 atan2 抖动 */
  let smoothedHeading = 0

  const midS = Math.min(totalLen * 0.4, totalLen)
  const midPos = interpolateAlongPath(pathPoints, midS) || pathPoints[Math.floor(pathPoints.length / 2)]
  const camOffset = { x: 0, y: 0, z: 0 }
  const recalcCamOffset = () => {
    const w = lngLatAltToOverlayWorld(
      container,
      map,
      midPos.lng,
      midPos.lat,
      (midPos.alt ?? 0) + 40
    )
    camOffset.x = w.x - 10
    camOffset.y = w.y + 22
    camOffset.z = w.z + 14
  }
  recalcCamOffset()

  // 暂停动画：不启动 RAF/事件监听，仅渲染一次并将 UAV 放到起点
  if (!ENABLE_ANIMATIONS) {
    const first = pathPoints[0]
    const posWorld = lngLatAltToOverlayWorld(container, map, first.lng, first.lat, first.alt ?? 0)
    try {
      if (uav3DModel?.position?.set) {
        uav3DModel.position.set(posWorld.x, posWorld.y, posWorld.z)
      }
      camera.position.set(camOffset.x, camOffset.y, camOffset.z)
      camera.lookAt(posWorld.x, posWorld.y + 0.35, posWorld.z)
      renderThreeJS()
    } catch {}
    return () => {}
  }

  /** 仅更新无人机（每帧）：相机固定在航线侧上方俯视，避免跟拍导致的剧烈晃动 */
  const refreshUavCameraOnly = (s) => {
    const pos = interpolateAlongPath(pathPoints, s)
    if (!pos) return
    const posWorld = lngLatAltToOverlayWorld(container, map, pos.lng, pos.lat, pos.alt ?? 0)
    uav3DModel.position.set(posWorld.x, posWorld.y, posWorld.z)

    const lookAhead = Math.max(18, totalLen * 0.1)
    const lookS = Math.min(s + lookAhead, totalLen)
    const ahead = interpolateAlongPath(pathPoints, lookS)
    const wAhead = lngLatAltToOverlayWorld(container, map, ahead.lng, ahead.lat, ahead.alt ?? 0)
    const dx = wAhead.x - posWorld.x
    const dz = wAhead.z - posWorld.z
    let heading = smoothedHeading
    if (dx * dx + dz * dz > 0.0004) {
      heading = Math.atan2(dx, dz)
      smoothedHeading = smoothedHeading * 0.88 + heading * 0.12
    }
    uav3DModel.rotation.set(0, smoothedHeading, 0)

    camera.position.set(camOffset.x, camOffset.y, camOffset.z)
    camera.lookAt(posWorld.x, posWorld.y + 0.35, posWorld.z)
    renderThreeJS()
  }

  /** 地图平移/缩放后：同步空中折线顶点与当前像素投影 */
  const refreshPathLineAndUav = (s) => {
    if (pathLine) updatePathLineGeometry(pathLine, pathPoints, map, container)
    updateObstacleOverlayGroupPositions(threeScene.userData.__obstacleOverlayGroup, map, container)
    recalcCamOffset()
    refreshUavCameraOnly(s)
  }

  /** 防抖：程序化 centerAndZoom 会连续触发 moveend，避免叠层每帧重算抽搐 */
  const onMapViewChange = () => {
    if (mapViewDebounce) clearTimeout(mapViewDebounce)
    mapViewDebounce = setTimeout(() => {
      mapViewDebounce = null
      refreshPathLineAndUav(currentS)
    }, 100)
  }

  if (map.addEventListener) {
    map.addEventListener('moveend', onMapViewChange)
    map.addEventListener('zoomend', onMapViewChange)
  }

  const tick = (now) => {
    if (!isRunning) return
    const elapsed = now - t0
    currentS = (elapsed / durationMs) * totalLen
    if (currentS >= totalLen) {
      currentS = totalLen
      refreshPathLineAndUav(currentS)
      isRunning = false
      console.log('🚁 3D 飞行模拟完成')
      return
    }
    refreshUavCameraOnly(currentS)
    animationId = requestAnimationFrame(tick)
  }

  animationId = requestAnimationFrame(tick)
  console.log('🚁 3D 飞行模拟已启动（弧长约', Math.round(totalLen), 'm）')

  return () => {
    isRunning = false
    if (animationId) cancelAnimationFrame(animationId)
    if (mapViewDebounce) {
      clearTimeout(mapViewDebounce)
      mapViewDebounce = null
    }
    if (map.removeEventListener) {
      map.removeEventListener('moveend', onMapViewChange)
      map.removeEventListener('zoomend', onMapViewChange)
    }
    if (threeScene.userData.__pathLine3D) {
      disposePathLine(threeScene.userData.__pathLine3D, threeScene)
      threeScene.userData.__pathLine3D = null
    }
    disposeObstacleOverlayGroup(threeScene)
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
  
  const fv = flowAnimationRef?.value
  if (fv != null) {
    if (typeof fv === 'number') {
      cancelAnimationFrame(fv)
    } else if (typeof fv === 'object' && typeof fv.stop === 'function') {
      fv.stop()
    }
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
