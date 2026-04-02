/**
 * 禁飞区检测服务模块
 * 提供禁飞区数据管理、可视化和路径检测功能
 */

/**
 * 加载禁飞区数据
 * @param {String} apiUrl - 后端 API 地址（可选）
 * @returns {Promise<Array>} 禁飞区数组
 */
export const loadNoFlyZones = async (apiUrl = null) => {
  try {
    // 如果提供了 API 地址，从后端获取
    if (apiUrl) {
      const response = await fetch(apiUrl)
      const data = await response.json()
      return data.data || data
    }
    
    // 否则使用模拟数据
    return [
      {
        name: '机场净空区',
        center: { lng: 115.95, lat: 28.75 },
        radius: 5000, // 半径 5 公里
        level: 'high', // 警告级别：high, medium, low
        description: '机场周边净空保护区域'
      },
      {
        name: '军事管理区',
        center: { lng: 115.85, lat: 28.65 },
        radius: 2000, // 半径 2 公里
        level: 'high',
        description: '军事管理区域，禁止飞行'
      },
      {
        name: '政府机关区域',
        center: { lng: 115.89, lat: 28.68 },
        radius: 1000, // 半径 1 公里
        level: 'medium',
        description: '政府机关办公区域'
      },
      {
        name: '大型活动临时禁飞区',
        center: { lng: 115.90, lat: 28.70 },
        radius: 1500,
        level: 'low',
        description: '临时性大型活动区域'
      }
    ]
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
    // 创建圆形覆盖物表示禁飞区
    const circle = new BMap.Circle(
      new BMap.Point(zone.center.lng, zone.center.lat),
      zone.radius,
      {
        strokeColor: getZoneColor(zone.level),
        strokeWeight: 2,
        strokeOpacity: 0.8,
        fillColor: getZoneColor(zone.level),
        fillOpacity: 0.2
      }
    )
    
    // 添加标签
    const label = new BMap.Label(zone.name, {
      position: new BMap.Point(zone.center.lng, zone.center.lat),
      offset: new BMap.Size(0, 0)
    })
    
    label.setStyle({
      color: getZoneColor(zone.level),
      fontSize: '14px',
      fontWeight: 'bold',
      backgroundColor: 'rgba(255, 255, 255, 0.8)',
      border: '1px solid #ccc',
      padding: '4px 8px',
      borderRadius: '4px'
    })
    
    map.addOverlay(circle)
    map.addOverlay(label)
    
    overlays.push(circle, label)
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
    map.removeOverlay(overlay)
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
    noFlyZones.forEach(zone => {
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
  const uniqueViolations = violations.filter((v, i, arr) => 
    arr.findIndex(x => x.zoneName === v.zoneName) === i
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
  generateNoFlyWarning
}
