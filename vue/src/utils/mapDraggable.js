/**
 * 可拖拽路径点管理模块
 * 提供路径点标记的创建、拖拽和更新功能
 */

/**
 * 创建可拖拽的路径点标记
 * @param {Object} map - 百度地图实例
 * @param {Array} pathPoints - 路径点数组
 * @param {Function} onMarkerDragEnd - 拖拽结束回调函数
 * @returns {Array} 标记数组
 */
export const createDraggableMarkers = (map, pathPoints, onMarkerDragEnd) => {
  if (!map || !pathPoints || pathPoints.length === 0) return []
  
  const pathMarkers = []
  
  // 每隔一定距离创建一个可拖拽标记（避免太密集）
  const step = Math.max(1, Math.floor(pathPoints.length / 20))
  
  for (let i = 0; i < pathPoints.length; i += step) {
    const point = pathPoints[i]
    const marker = new BMap.Marker(new BMap.Point(point.lng, point.lat), {
      enableDragging: true,
      raiseOnDrag: true
    })
    
    // 设置标记样式
    marker.setOffset(new BMap.Size(-5, -5))
    
    // 绑定拖拽开始事件
    marker.addEventListener('dragstart', () => {
      console.log('🎯 开始拖拽标记', i)
    })
    
    // 绑定拖拽结束事件
    marker.addEventListener('dragend', async (e) => {
      const newPoint = e.target.getPosition()
      console.log('✅ 标记拖拽完成，新位置:', newPoint.lng, newPoint.lat)
      
      // 更新路径点
      pathPoints[i] = {
        lng: newPoint.lng,
        lat: newPoint.lat
      }
      
      // 执行回调
      if (onMarkerDragEnd) {
        await onMarkerDragEnd(i, pathPoints)
      }
    })
    
    map.addOverlay(marker)
    pathMarkers.push(marker)
  }
  
  return pathMarkers
}

/**
 * 清除所有路径标记
 * @param {Array} pathMarkers - 标记数组
 * @param {Object} map - 百度地图实例
 */
export const clearPathMarkers = (pathMarkers, map) => {
  if (!pathMarkers || !map) return
  
  pathMarkers.forEach(marker => {
    map.removeOverlay(marker)
  })
  
  return []
}

/**
 * 拖拽后重新计算路径
 * @param {Boolean} is3DMode - 是否为 3D 模式
 * @param {Array} pathPoints - 路径点数组
 * @param {Function} calculatePathWithBaiduMap - 百度地图路径计算方法
 * @param {Function} drawPathOnMap - 绘制路径方法
 * @param {Function} flattenPathCoordinatesLocal - 扁平化路径坐标方法
 * @param {Function} calculatePathStats - 计算路径统计方法
 * @returns {Object} 更新后的路径统计信息
 */
export const recalculatePathAfterDrag = async (
  is3DMode,
  pathPoints,
  calculatePathWithBaiduMap,
  drawPathOnMap,
  flattenPathCoordinatesLocal,
  calculatePathStats
) => {
  try {
    // 如果是百度地图路径，重新调用百度 API
    if (!is3DMode) {
      const start = pathPoints[0]
      const end = pathPoints[pathPoints.length - 1]
      
      await calculatePathWithBaiduMap(
        new BMap.Point(start.lng, start.lat),
        new BMap.Point(end.lng, end.lat)
      )
    } else {
      // 3D 模式：简单重绘路径
      drawPathOnMap()
    }
    
    // 更新统计信息
    const flatPathCoords = flattenPathCoordinatesLocal()
    const pathStats = calculatePathStats(flatPathCoords)
    
    return { success: true, pathStats }
  } catch (error) {
    console.error('重新计算路径失败:', error)
    return { success: false, error }
  }
}

/**
 * 默认导出所有方法
 */
export default {
  createDraggableMarkers,
  clearPathMarkers,
  recalculatePathAfterDrag
}
