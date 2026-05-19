/**
 * 禁飞区检测服务模块
 * 提供禁飞区数据管理、可视化和路径检测功能
 */

const VECTOR_REGION_STORAGE_KEY = 'uav_vector_regions_v1'

/**
 * 暂时关闭禁飞区对「驾车路径规划 / 道路巡检规划 / 增强模块禁飞提示」的影响，便于单独验证沿路规划。
 * 恢复禁飞参与：改为 `false`。
 */
export const DISABLE_NOFLY_ON_DRIVING_PLAN = true

const loadNoFlyPolygonsFromStorage = () => {
  try {
    const raw = localStorage.getItem(VECTOR_REGION_STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x) => x && x.type === 'noFly' && Array.isArray(x.path) && x.path.length >= 3)
      .map((x) => {
        const path = x.path
          .map((p) => (Array.isArray(p) && p.length >= 2 ? [Number(p[0]), Number(p[1])] : null))
          .filter(Boolean)
          .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
        if (path.length < 3) return null
        return {
          name: String(x.name || '自定义禁飞区'),
          level: 'high',
          description: '用户自定义禁飞多边形',
          path
        }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

const polygonCentroid = (path) => {
  if (!Array.isArray(path) || path.length === 0) return null
  let sx = 0
  let sy = 0
  for (const p of path) {
    sx += Number(p[0])
    sy += Number(p[1])
  }
  return { lng: sx / path.length, lat: sy / path.length }
}

// 射线法：判断点是否在多边形内（lng/lat 平面近似）
const pointInPolygon = (lng, lat, polygon) => {
  if (!Array.isArray(polygon) || polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1]
    const xj = polygon[j][0], yj = polygon[j][1]
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * 加载禁飞区数据
 * @param {String} apiUrl - 后端 API 地址（可选）
 * @returns {Promise<Array>} 禁飞区数组
 */
export const loadNoFlyZones = async (apiUrl = null) => {
  try {
    const polygonZones = loadNoFlyPolygonsFromStorage()
    // 如果提供了 API 地址，从后端获取
    if (apiUrl) {
      const response = await fetch(apiUrl)
      const data = await response.json()
      const zones = data.data || data
      return Array.isArray(zones) ? [...zones, ...polygonZones] : polygonZones
    }

    // 无后端地址时：仅使用用户在路径规划里绘制的禁飞多边形（localStorage）。
    // 不再注入大面积「演示圆形」禁飞区，否则南昌市常见任务路线会一直被判穿区，
    // 并在删除自定义多边形后仍出现「已自动绕行（本地网格）」等误导提示。
    return polygonZones
  } catch (error) {
    console.error('加载禁飞区失败:', error)
    return []
  }
}

/**
 * 在地图上绘制禁飞区
 * @param {Object} map - 百度地图实例
 * @param {Array} noFlyZones - 禁飞区数组
 * @returns {Array} 覆盖物数组
 */
export const drawNoFlyZones = (map, noFlyZones) => {
  if (!map || !noFlyZones) return []
  
  const overlays = []
  
  noFlyZones.forEach(zone => {
    const isPolygon = Array.isArray(zone?.path) && zone.path.length >= 3
    const overlay = isPolygon
      ? new AMap.Polygon({
          path: zone.path,
          strokeColor: getZoneColor(zone.level),
          strokeWeight: 2,
          strokeOpacity: 0.9,
          fillColor: getZoneColor(zone.level),
          fillOpacity: 0.22,
          map
        })
      : new AMap.Circle({
          center: [zone.center.lng, zone.center.lat],
          radius: zone.radius,
          strokeColor: getZoneColor(zone.level),
          strokeWeight: 2,
          strokeOpacity: 0.8,
          fillColor: getZoneColor(zone.level),
          fillOpacity: 0.2,
          map
        })
    
    // 标签优先使用 AMap.Text，兼容性不够则退回 Marker 内容
    let label = null
    const labelPos = isPolygon
      ? polygonCentroid(zone.path)
      : zone.center
    if (!labelPos || !Number.isFinite(labelPos.lng) || !Number.isFinite(labelPos.lat)) {
      overlays.push(overlay)
      return
    }
    try {
      label = new AMap.Text({
        text: zone.name,
        position: [labelPos.lng, labelPos.lat],
        offset: new AMap.Pixel(0, 0),
        style: {
          color: getZoneColor(zone.level),
          fontSize: 14,
          fontWeight: 'bold',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          border: '1px solid #ccc',
          padding: '4px 8px',
          borderRadius: '4px'
        },
        map
      })
    } catch {
      // eslint-disable-next-line no-new
      label = new AMap.Marker({
        position: [labelPos.lng, labelPos.lat],
        map,
        content: `<div style="color:${getZoneColor(zone.level)};font-size:14px;font-weight:bold;background:rgba(255,255,255,0.8);border:1px solid #ccc;padding:4px 8px;border-radius:4px;white-space:nowrap;">${zone.name}</div>`
      })
    }
    
    overlays.push(overlay, label)
  })
  
  return overlays
}

/**
 * 根据禁飞区级别获取颜色
 * @param {String} level - 警告级别
 * @returns {String} 颜色值
 */
const getZoneColor = (level) => {
  switch (level) {
    case 'high':
      return '#ff0000' // 红色 - 高危
    case 'medium':
      return '#ff8800' // 橙色 - 中等
    case 'low':
      return '#ffcc00' // 黄色 - 低危
    default:
      return '#ff0000'
  }
}

/**
 * 清除禁飞区覆盖物
 * @param {Array} overlays - 覆盖物数组
 * @param {Object} map - 百度地图实例
 */
export const clearNoFlyZoneOverlays = (overlays, map) => {
  if (!overlays || !map) return
  
  overlays.forEach(overlay => {
    overlay?.setMap?.(null)
  })
}

/**
 * 检测路径是否穿越禁飞区
 * @param {Array} pathPoints - 路径点数组
 * @param {Array} noFlyZones - 禁飞区数组
 * @returns {Object} 检测结果
 */
export const checkNoFlyZoneIntersection = (pathPoints, noFlyZones) => {
  if (!pathPoints || !noFlyZones) {
    return { hasViolation: false, violations: [] }
  }

  const violations = []

  pathPoints.forEach((point, index) => {
    noFlyZones.forEach((zone) => {
      const isPolygon = Array.isArray(zone?.path) && zone.path.length >= 3
      if (isPolygon) {
        const inside = pointInPolygon(Number(point.lng), Number(point.lat), zone.path)
        if (inside) {
          violations.push({
            pointIndex: index,
            zoneName: zone.name,
            distance: '0',
            level: zone.level || 'high',
            description: zone.description || '多边形禁飞区'
          })
        }
        return
      }

      const distance = getDistanceFromLatLonInM(
        point.lat,
        point.lng,
        zone.center.lat,
        zone.center.lng
      )

      if (distance < zone.radius) {
        violations.push({
          pointIndex: index,
          zoneName: zone.name,
          distance: distance.toFixed(0),
          level: zone.level,
          description: zone.description
        })
      }
    })
  })

  // 去重（同一个禁飞区只记录一次）
  const uniqueViolations = violations.filter(
    (v, i, arr) => arr.findIndex((x) => x.zoneName === v.zoneName) === i
  )

  return {
    hasViolation: uniqueViolations.length > 0,
    violations: uniqueViolations,
    violationCount: uniqueViolations.length
  }
}

/**
 * 计算两点间距离（Haversine 公式）
 * @param {Number} lat1 - 点 1 纬度
 * @param {Number} lon1 - 点 1 经度
 * @param {Number} lat2 - 点 2 纬度
 * @param {Number} lon2 - 点 2 经度
 * @returns {Number} 距离（米）
 */
export const getDistanceFromLatLonInM = (lat1, lon1, lat2, lon2) => {
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

/**
 * 角度转弧度
 * @param {Number} deg - 角度
 * @returns {Number} 弧度
 */
const deg2rad = (deg) => {
  return deg * (Math.PI / 180)
}

/**
 * 生成禁飞区警告信息
 * @param {Array} violations - 违规记录数组
 * @returns {String} 警告信息
 */
export const generateNoFlyWarning = (violations) => {
  if (!violations || violations.length === 0) return ''
  
  const highLevelViolations = violations.filter(v => v.level === 'high')
  const mediumLevelViolations = violations.filter(v => v.level === 'medium')
  const lowLevelViolations = violations.filter(v => v.level === 'low')
  
  let warning = '⚠️ 路径穿越禁飞区：\n'
  
  if (highLevelViolations.length > 0) {
    warning += `\n❌ 高危禁飞区 (${highLevelViolations.length}个):\n`
    highLevelViolations.forEach(v => {
      warning += `   - ${v.zoneName} (距离中心${v.distance}米)\n`
    })
  }
  
  if (mediumLevelViolations.length > 0) {
    warning += `\n⚠️ 中等限制区 (${mediumLevelViolations.length}个):\n`
    mediumLevelViolations.forEach(v => {
      warning += `   - ${v.zoneName} (距离中心${v.distance}米)\n`
    })
  }
  
  if (lowLevelViolations.length > 0) {
    warning += `\n⚡ 注意区域 (${lowLevelViolations.length}个):\n`
    lowLevelViolations.forEach(v => {
      warning += `   - ${v.zoneName} (距离中心${v.distance}米)\n`
    })
  }
  
  return warning.trim()
}

/**
 * 默认导出所有方法
 */
export default {
  loadNoFlyZones,
  drawNoFlyZones,
  clearNoFlyZoneOverlays,
  checkNoFlyZoneIntersection,
  getDistanceFromLatLonInM,
  generateNoFlyWarning,
  DISABLE_NOFLY_ON_DRIVING_PLAN
}
