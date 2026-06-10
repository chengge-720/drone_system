/**
 * 任务类型对应的“轨迹点生成器”
 * 这些生成器输出的都是统一结构：[{ lng, lat, alt }]
 *
 * 说明：
 * - 当前第一版水域巡检没有真实水文/边界数据，因此采用“近似几何生成”：
 *   - 河流：用起终点连线当作河道中心线，顺/逆通过点序控制
 *   - 湖泊：以直径 100m 的覆盖要求，在起终点向量方向上生成“割草线”覆盖轨迹
 */

const EARTH_MEAN_LAT_M_PER_DEG = 111111 // 粗略近似：纬度每度对应约 111.111km

const metersToLatDeg = (meters) => meters / EARTH_MEAN_LAT_M_PER_DEG

const metersToLngDeg = (meters, latDeg) => {
  const latRad = (latDeg * Math.PI) / 180
  const cos = Math.cos(latRad)
  if (Math.abs(cos) < 1e-6) return 0
  return meters / (EARTH_MEAN_LAT_M_PER_DEG * cos)
}

/**
 * 从中心点做局部平面偏移（east/north in meters）得到新的 lng/lat。
 */
const offsetLatLng = (center, eastMeters, northMeters) => {
  const lat = center.lat + metersToLatDeg(northMeters)
  const lng = center.lng + metersToLngDeg(eastMeters, center.lat)
  return { lng, lat }
}

const interpolate = (a, b, t) => a + (b - a) * t

const buildStraightLinePoints = (start, end, pointsCount, altM) => {
  const n = Math.max(2, Math.floor(pointsCount))
  const out = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    out.push({
      lng: interpolate(start.lng, end.lng, t),
      lat: interpolate(start.lat, end.lat, t),
      alt: altM
    })
  }
  return out
}

/**
 * 航拍：高空直线插值轨迹
 */
export function planAerialStraightLineRoute({ start, end, targetAltitudeM = 180, pointsCount = 80 }) {
  return buildStraightLinePoints(start, end, pointsCount, targetAltitudeM)
}

/**
 * 河流巡检：近似河道中心线（起终点连线），顺/逆通过点序控制
 * direction: '顺流' | '逆流'
 */
export function planRiverWaterRoute({
  start,
  end,
  direction = '顺流',
  targetAltitudeM = 120,
  pointsCount = 120
}) {
  const s = direction === '逆流' ? end : start
  const e = direction === '逆流' ? start : end
  return buildStraightLinePoints(s, e, pointsCount, targetAltitudeM)
}

/**
 * 湖泊覆盖：以直径覆盖范围在平面生成“割草线”轨迹
 * - center：湖泊中心近似点（用任务起点）
 * - reference：参考方向点（用任务终点）
 */
export function planLakeCoverRoute({
  center,
  reference,
  targetAltitudeM = 120,
  coverageDiameterM = 100,
  stripeSpacingM = 20,
  pointsPerStripe = 24
}) {
  const halfWidth = coverageDiameterM / 2
  const halfLength = coverageDiameterM / 2 // 第一版用同宽度覆盖矩形，足以覆盖直径 100m 圆形的大部分区域

  // 以中心点为原点，reference 向量构建平面坐标系（east/north）
  const dxLng = reference.lng - center.lng
  const dyLat = reference.lat - center.lat

  const eastMetersDirect = dxLng * (EARTH_MEAN_LAT_M_PER_DEG * Math.cos((center.lat * Math.PI) / 180))
  const northMetersDirect = dyLat * EARTH_MEAN_LAT_M_PER_DEG

  const len = Math.sqrt(eastMetersDirect * eastMetersDirect + northMetersDirect * northMetersDirect)
  const u = len < 1e-6 ? { east: 1, north: 0 } : { east: eastMetersDirect / len, north: northMetersDirect / len }
  // v 为与 u 垂直的方向（顺/逆手性不影响覆盖，这里取左法向）
  const v = { east: -u.north, north: u.east }

  const stripeCount = Math.max(1, Math.ceil((2 * halfWidth) / stripeSpacingM))
  const out = []

  for (let i = 0; i <= stripeCount; i++) {
    const tY = stripeCount === 0 ? 0 : i / stripeCount
    const y = -halfWidth + 2 * halfWidth * tY

    // 蛇形走线：偶数条从 -halfLength -> +halfLength，奇数条反过来
    const even = i % 2 === 0
    const xStart = even ? -halfLength : halfLength
    const xEnd = even ? halfLength : -halfLength

    for (let j = 0; j < pointsPerStripe; j++) {
      const tX = pointsPerStripe === 1 ? 0 : j / (pointsPerStripe - 1)
      const x = interpolate(xStart, xEnd, tX)

      const globalEast = u.east * x + v.east * y
      const globalNorth = u.north * x + v.north * y

      const pt = offsetLatLng(center, globalEast, globalNorth)
      out.push({ lng: pt.lng, lat: pt.lat, alt: targetAltitudeM })
    }
  }

  // 避免重复首尾点导致 3D 折线顶点过密
  if (out.length >= 2) {
    const a = out[0]
    const b = out[1]
    if (a.lng === b.lng && a.lat === b.lat) out.shift()
  }

  return out
}

