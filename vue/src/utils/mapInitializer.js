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
    // 倾角过大时默认 3D 载体（楼块等）可能与 Three 叠层航线混淆
    tilt: 42
  },
  /** 3D 下楼块图层（AMap.Buildings）默认缩放区间与高度比例，见高德「楼块图层」示例 */
  BUILDINGS_3D: {
    zooms: [14, 20],
    heightFactor: 2,
    zIndex: 10,
    /** 侧面 / 顶面着色，避免默认近纯白与底图糊成一片（支持 hex / rgb / rgba / [r,g,b,a]） */
    wallColor: '#8aa0b8',
    roofColor: '#4d627a'
  }
}

/**
 * 替换 3D 地图上的矢量楼块图层（隐藏标准图层默认楼块后由本图层渲染，可设 heightFactor）
 * @param {Object} map AMap.Map
 * @param {{ heightFactor?: number, zooms?: [number, number], wallColor?: string|number[], roofColor?: string|number[], disabled?: boolean }} opts
 */
export const replaceBuildingsLayer = (map, opts = {}) => {
  if (!map || typeof AMap === 'undefined') return

  try {
    const prev = map.__amapBuildingsLayer
    if (prev) {
      try {
        map.remove(prev)
      } catch {}
      try {
        prev.setMap?.(null)
      } catch {}
      map.__amapBuildingsLayer = null
    }
  } catch {}

  if (opts.disabled || typeof AMap.Buildings !== 'function') {
    if (!opts.disabled && typeof AMap.Buildings !== 'function') {
      console.warn('AMap.Buildings 不可用（请确认 JSAPI 2.x 已加载）')
    }
    return
  }

  const cfg = MAP_CONFIG.BUILDINGS_3D
  const zooms = Array.isArray(opts.zooms) && opts.zooms.length >= 2 ? opts.zooms : cfg.zooms
  let heightFactor = Number(opts.heightFactor ?? cfg.heightFactor)
  if (!Number.isFinite(heightFactor) || heightFactor <= 0) heightFactor = cfg.heightFactor

  const wallColor = opts.wallColor != null ? opts.wallColor : cfg.wallColor
  const roofColor = opts.roofColor != null ? opts.roofColor : cfg.roofColor

  try {
    const layer = new AMap.Buildings({
      zooms,
      zIndex: cfg.zIndex,
      heightFactor,
      wallColor,
      roofColor
    })
    map.add(layer)
    map.__amapBuildingsLayer = layer
  } catch (e) {
    console.warn('楼块图层添加失败:', e)
  }
}

/**
 * 创建 2D 地图实例
 * @param {HTMLElement} container - 地图容器元素
 * @param {{ center?: [number, number], zoom?: number, satellite?: boolean, lightSatellite?: boolean, mapStyle?: string }} [options]
 * @returns {Object} AMap 地图实例
 */
export const create2DMap = (container, options = {}) => {
  if (!container || typeof AMap === 'undefined') {
    console.error('❌ 无法创建 2D 地图：容器不存在或 AMap API 未加载')
    return null
  }
  
  try {
    const center = options.center || [MAP_CONFIG.DEFAULT_CENTER.lng, MAP_CONFIG.DEFAULT_CENTER.lat]
    const zoom = options.zoom || MAP_CONFIG.DEFAULT_ZOOM
    const useSatellite = Boolean(options.satellite || options.lightSatellite)

    /** @type {Record<string, unknown>} */
    const mapOptions = {
      viewMode: '2D',
      center,
      zoom,
      resizeEnable: true
    }

    // 与「地图展示」页一致：layers 指定卫星 + 路网，不用默认矢量底图
    if (useSatellite && typeof AMap.TileLayer?.Satellite === 'function') {
      const satellite = new AMap.TileLayer.Satellite()
      const layers = [satellite]
      if (typeof AMap.TileLayer?.RoadNet === 'function') {
        layers.push(new AMap.TileLayer.RoadNet())
      }
      mapOptions.layers = layers
    } else {
      mapOptions.mapStyle = options.mapStyle || 'amap://styles/normal'
    }

    const map = new AMap.Map(container, mapOptions)
    
    // 基础控件：不同 JSAPI 版本下 Scale 可能不可用/不可 new，做保护避免阻断地图创建
    try {
      const ScaleCtor = AMap.Scale || AMap.ScaleControl
      if (typeof ScaleCtor === 'function') {
        map.addControl(new ScaleCtor())
      }
    } catch (e) {
      console.warn('AMap Scale 控件不可用，已跳过:', e)
    }
    
    console.log('✅ 2D 地图创建成功', useSatellite ? '（卫星底图）' : '')
    return map
  } catch (error) {
    console.error('❌ 创建 2D 地图失败:', error)
    return null
  }
}

/** 高德卫星图 + 路网（与地图展示页相同） */
export const createSatelliteMap = (container, options = {}) => {
  return create2DMap(container, { ...options, satellite: true })
}

/**
 * 创建 3D 地图实例
 * @param {HTMLElement} container - 地图容器元素
 * @param {{ buildingHeightFactor?: number, buildingZooms?: [number, number], buildingWallColor?: string|number[], buildingRoofColor?: string|number[], disableBuildingsLayer?: boolean }} [options]
 * @returns {Object} AMap 地图实例
 */
export const create3DMap = (container, options = {}) => {
  if (!container || typeof AMap === 'undefined') {
    console.error('❌ 无法创建 3D 地图：容器不存在或 AMap API 未加载')
    return null
  }
  
  try {
    // 不含默认楼块要素，由 AMap.Buildings 单独控制（可 heightFactor），与高德楼块图层示例一致
    const withoutDefaultBuildings = ['bg', 'road', 'point']

    const map = new AMap.Map(container, {
      viewMode: '3D',
      center: [MAP_CONFIG.DEFAULT_CENTER.lng, MAP_CONFIG.DEFAULT_CENTER.lat],
      zoom: MAP_CONFIG.DEFAULT_ZOOM,
      rotation: MAP_CONFIG.VIEW_3D.heading,
      pitch: MAP_CONFIG.VIEW_3D.tilt,
      rotateEnable: true,
      pitchEnable: true,
      resizeEnable: true,
      features: withoutDefaultBuildings
    })

    // Scale 控件同样做保护
    try {
      const ScaleCtor = AMap.Scale || AMap.ScaleControl
      if (typeof ScaleCtor === 'function') {
        map.addControl(new ScaleCtor())
      }
    } catch (e) {
      console.warn('AMap Scale 控件不可用，已跳过:', e)
    }
    
    try {
      if (typeof map.setFeatures === 'function') {
        map.setFeatures(withoutDefaultBuildings)
      }
    } catch (e) {
      console.warn('AMap setFeatures(隐藏默认楼块) 跳过:', e)
    }

    replaceBuildingsLayer(map, {
      heightFactor: options.buildingHeightFactor,
      zooms: options.buildingZooms,
      wallColor: options.buildingWallColor,
      roofColor: options.buildingRoofColor,
      disabled: !!options.disableBuildingsLayer
    })
    
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
    try {
      currentMap.clearMap?.()
    } catch {}
    try {
      currentMap.destroy?.()
    } catch {}
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
  
  const center = [MAP_CONFIG.DEFAULT_CENTER.lng, MAP_CONFIG.DEFAULT_CENTER.lat]
  try {
    map.setZoomAndCenter?.(MAP_CONFIG.DEFAULT_ZOOM, center)
  } catch {
    try {
      map.setCenter?.(center)
      map.setZoom?.(MAP_CONFIG.DEFAULT_ZOOM)
    } catch {}
  }
  
  if (is3DMode) {
    try { map.setRotation?.(MAP_CONFIG.VIEW_3D.heading) } catch {}
    try { map.setPitch?.(MAP_CONFIG.VIEW_3D.tilt) } catch {}
  }
}

/**
 * 调整地图视野以适应路径
 * @param {Object} map - 地图实例
 * @param {Array} pathPoints - 路径点数组
 */
export const adjustMapViewport = (map, pathPoints) => {
  if (!map || !pathPoints || pathPoints.length === 0) return
  const safe = (pathPoints || []).filter((p) => {
    const lng = Number(p?.lng)
    const lat = Number(p?.lat)
    return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  })
  if (safe.length === 0) return

  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const p of safe) {
    minLng = Math.min(minLng, p.lng)
    maxLng = Math.max(maxLng, p.lng)
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
  }
  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return

  const center = [(minLng + maxLng) / 2, (minLat + maxLat) / 2]

  try {
    if (typeof AMap !== 'undefined' && typeof AMap.Bounds === 'function' && typeof map.setBounds === 'function') {
      map.setBounds(new AMap.Bounds([minLng, minLat], [maxLng, maxLat]), false, [48, 48, 48, 48])
      return
    }
  } catch {}

  try {
    map.setZoomAndCenter?.(15, center)
  } catch {
    try {
      map.setCenter?.(center)
      map.setZoom?.(15)
    } catch {}
  }
}

/**
 * 安全适配地图视野（避免 setFitView 在无效坐标时抛出 LngLat(NaN, NaN)）
 * @param {Object} map
 * @param {Array} overlays
 * @param {Array} pathPoints
 * @param {[number, number, number, number]} [padding]
 */
export const safeFitMapView = (map, overlays, pathPoints, padding = [48, 48, 48, 48]) => {
  if (!map) return

  if (Array.isArray(overlays) && overlays.length && typeof map.setFitView === 'function') {
    try {
      map.setFitView(overlays, false, padding)
      return
    } catch (e) {
      console.warn('setFitView 失败，回退 adjustMapViewport:', e)
    }
  }

  adjustMapViewport(map, pathPoints)
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
    
    try {
      // AMap v2：Geocoder 通常需要通过 AMap.plugin 动态加载
      const ensureGeocoder = () => {
        if (!AMap || typeof AMap.plugin !== 'function') return Promise.resolve()
        return new Promise((r) => {
          AMap.plugin(['AMap.Geocoder'], () => r())
        })
      }

      ensureGeocoder()
        .then(() => {
          if (!AMap || typeof AMap.Geocoder !== 'function') {
            reject(new Error('AMap.Geocoder 未就绪（可能未成功加载 Geocoder 插件）'))
            return
          }

          const geocoder = new AMap.Geocoder({ city: city || undefined })
          geocoder.getLocation(address, (status, result) => {
            if (
              status === 'complete' &&
              result &&
              Array.isArray(result.geocodes) &&
              result.geocodes.length
            ) {
              const loc = result.geocodes[0].location
              const lng = typeof loc?.getLng === 'function' ? loc.getLng() : loc?.lng
              const lat = typeof loc?.getLat === 'function' ? loc.getLat() : loc?.lat
              resolve({ lng: Number(lng), lat: Number(lat) })
            } else {
              reject(new Error('地址解析失败'))
            }
          })
        })
        .catch((e) => reject(e))
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * 创建地理编码标记
 * @param {Object} map - 地图实例
 * @param {Object} point - { lng, lat } 对象
 * @param {Boolean} is3DMode - 是否为 3D模式
 * @returns {Object} 标记对象
 */
export const createGeoMarker = (map, point, is3DMode = false) => {
  if (!map || !point) return null
  
  const lng = point?.lng ?? point?.getLng?.()
  const lat = point?.lat ?? point?.getLat?.()
  if (!Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) return null
  
  const marker = new AMap.Marker({
    position: [Number(lng), Number(lat)],
    map
  })
  return marker
}

/**
 * 从地图上移除单个覆盖物（Marker / Polyline 等）。
 * 高德 JSAPI 使用 setMap(null) 或 map.remove；不要使用百度系的 removeOverlay。
 * @param {Object} map AMap.Map
 * @param {any} overlay 单个覆盖物，或覆盖物数组
 */
export const removeOverlayFromMap = (map, overlay) => {
  if (!map || overlay == null) return
  if (Array.isArray(overlay)) {
    for (const o of overlay) removeOverlayFromMap(map, o)
    return
  }
  try {
    if (typeof overlay.setMap === 'function') {
      overlay.setMap(null)
      return
    }
  } catch {}
  try {
    if (typeof map.remove === 'function') map.remove(overlay)
  } catch {}
}

/**
 * 清除地图上的所有覆盖物
 * @param {Object} map - 地图实例
 */
export const clearMapOverlays = (map) => {
  if (!map) return
  try {
    map.clearMap?.()
  } catch {
    try {
      map.clearOverlays?.()
    } catch {}
  }
}

/**
 * 默认导出所有方法
 */
export default {
  create2DMap,
  createSatelliteMap,
  create3DMap,
  replaceBuildingsLayer,
  switchMapMode,
  resetMapView,
  adjustMapViewport,
  safeFitMapView,
  getGeoPoint,
  createGeoMarker,
  removeOverlayFromMap,
  clearMapOverlays,
  MAP_CONFIG
}
