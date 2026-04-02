/**
 * 地图初始化与管理模块
 * 负责 2D/3D 地图的创建、配置和切换
 */

/**
 * 地图配置选项
 */
export const MAP_CONFIG = {
  // 默认中心点（南昌）
  DEFAULT_CENTER: {
    lng: 115.892151,
    lat: 28.676493
  },
  // 默认缩放级别
  DEFAULT_ZOOM: 13,
  // 3D 视角参数
  VIEW_3D: {
    heading: 45, // 旋转角度
    tilt: 60     // 倾斜角度
  }
}

/**
 * 创建 2D 地图实例
 * @param {HTMLElement} container - 地图容器元素
 * @returns {Object} BMap 地图实例
 */
export const create2DMap = (container) => {
  if (!container || typeof BMap === 'undefined') {
    console.error('❌ 无法创建 2D 地图：容器不存在或 BMap API 未加载')
    return null
  }
  
  try {
    const map = new BMap.Map(container, {
      enableMapClick: false // 禁用底图点击
    })
    
    // 设置中心和缩放
    const centerPoint = new BMap.Point(MAP_CONFIG.DEFAULT_CENTER.lng, MAP_CONFIG.DEFAULT_CENTER.lat)
    map.centerAndZoom(centerPoint, MAP_CONFIG.DEFAULT_ZOOM)
    
    // 启用滚轮缩放
    map.enableScrollWheelZoom(true)
    
    // 添加控件
    map.addControl(new BMap.NavigationControl())
    map.addControl(new BMap.ScaleControl())
    
    console.log('✅ 2D 地图创建成功')
    return map
  } catch (error) {
    console.error('❌ 创建 2D 地图失败:', error)
    return null
  }
}

/**
 * 创建 3D 地图实例
 * @param {HTMLElement} container - 地图容器元素
 * @returns {Object} BMapGL 地图实例
 */
export const create3DMap = (container) => {
  if (!container || typeof BMapGL === 'undefined') {
    console.error('❌ 无法创建 3D 地图：容器不存在或 BMapGL API 未加载')
    return null
  }
  
  try {
    const map = new BMapGL.Map(container, {
      enableMapClick: false
    })
    
    // 设置中心和缩放
    const centerPoint = new BMapGL.Point(MAP_CONFIG.DEFAULT_CENTER.lng, MAP_CONFIG.DEFAULT_CENTER.lat)
    map.centerAndZoom(centerPoint, MAP_CONFIG.DEFAULT_ZOOM)
    
    // 启用滚轮缩放
    map.enableScrollWheelZoom(true)
    
    // 添加控件
    map.addControl(new BMapGL.NavigationControl())
    map.addControl(new BMapGL.ScaleControl())
    
    // 设置 3D 视角
    map.setHeading(MAP_CONFIG.VIEW_3D.heading)
    map.setTilt(MAP_CONFIG.VIEW_3D.tilt)
    
    console.log('✅ 3D 地图创建成功')
    return map
  } catch (error) {
    console.error('❌ 创建 3D 地图失败:', error)
    return null
  }
}

/**
 * 切换地图模式（2D <-> 3D）
 * @param {Boolean} is3DMode - 是否为 3D模式
 * @param {HTMLElement} container - 地图容器
 * @param {Object} currentMap - 当前地图实例
 * @returns {Object} 新的地图实例
 */
export const switchMapMode = (is3DMode, container, currentMap) => {
  // 清理旧地图
  if (currentMap) {
    currentMap.clearOverlays()
  }
  
  // 创建新地图
  if (is3DMode) {
    return create3DMap(container)
  } else {
    return create2DMap(container)
  }
}

/**
 * 重置地图视角到默认状态
 * @param {Object} map - 地图实例
 * @param {Boolean} is3DMode - 是否为 3D模式
 */
export const resetMapView = (map, is3DMode = false) => {
  if (!map) return
  
  const centerPoint = is3DMode 
    ? new BMapGL.Point(MAP_CONFIG.DEFAULT_CENTER.lng, MAP_CONFIG.DEFAULT_CENTER.lat)
    : new BMap.Point(MAP_CONFIG.DEFAULT_CENTER.lng, MAP_CONFIG.DEFAULT_CENTER.lat)
  
  map.centerAndZoom(centerPoint, MAP_CONFIG.DEFAULT_ZOOM)
  
  if (is3DMode) {
    map.setHeading(MAP_CONFIG.VIEW_3D.heading)
    map.setTilt(MAP_CONFIG.VIEW_3D.tilt)
  }
}

/**
 * 调整地图视野以适应路径
 * @param {Object} map - 地图实例
 * @param {Array} pathPoints - 路径点数组
 */
export const adjustMapViewport = (map, pathPoints) => {
  if (!map || !pathPoints || pathPoints.length === 0) return
  
  const startPoint = pathPoints[0]
  const endPoint = pathPoints[pathPoints.length - 1]
  
  const centerLng = (startPoint.lng + endPoint.lng) / 2
  const centerLat = (startPoint.lat + endPoint.lat) / 2
  
  map.centerAndZoom(new BMap.Point(centerLng, centerLat), 15)
}

/**
 * 获取地理编码点
 * @param {String} address - 地址字符串
 * @param {Object} map - 地图实例
 * @param {String} city - 城市名称
 * @returns {Promise<Object>} 地理编码结果
 */
export const getGeoPoint = (address, map, city = '') => {
  return new Promise((resolve, reject) => {
    if (!map || !address) {
      reject(new Error('地图实例或地址为空'))
      return
    }
    
    const geocoder = map instanceof BMapGL.Map ? new BMapGL.Geocoder() : new BMap.Geocoder()
    
    geocoder.getPoint(address, (point) => {
      if (point) {
        resolve(point)
      } else {
        reject(new Error('地址解析失败'))
      }
    }, city)
  })
}

/**
 * 创建地理编码标记
 * @param {Object} map - 地图实例
 * @param {Object} point - BMap.Point 对象
 * @param {Boolean} is3DMode - 是否为 3D模式
 * @returns {Object} 标记对象
 */
export const createGeoMarker = (map, point, is3DMode = false) => {
  if (!map || !point) return null
  
  const MarkerClass = is3DMode ? BMapGL.Marker : BMap.Marker
  const marker = new MarkerClass(point)
  
  map.addOverlay(marker)
  return marker
}

/**
 * 清除地图上的所有覆盖物
 * @param {Object} map - 地图实例
 */
export const clearMapOverlays = (map) => {
  if (!map) return
  map.clearOverlays()
}

/**
 * 默认导出所有方法
 */
export default {
  create2DMap,
  create3DMap,
  switchMapMode,
  resetMapView,
  adjustMapViewport,
  getGeoPoint,
  createGeoMarker,
  clearMapOverlays,
  MAP_CONFIG
}
