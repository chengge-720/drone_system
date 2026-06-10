/**
 * 在起点–终点直线段两侧各 widthM/2 的平面走廊内筛选建筑 POI（米制距离，平面近似）。
 */

const EARTH_R = 6378137

function toEnuMeters(lat, lng, refLat, refLng) {
  const dy = ((lat - refLat) * Math.PI) / 180 * EARTH_R
  const dx = ((lng - refLng) * Math.PI) / 180 * EARTH_R * Math.cos((refLat * Math.PI) / 180)
  return { x: dx, y: dy }
}

/**
 * @param {{ lat: number, lng: number }} start
 * @param {{ lat: number, lng: number }} end
 * @param {Array<{ lat: number, lng: number }>} buildings
 * @param {number} widthM 走廊总宽度（米）
 */
export function filterBuildingsInCorridor(start, end, buildings, widthM = 100) {
  if (!buildings?.length || !start || !end) return []
  const half = widthM / 2
  const refLat = start.lat
  const refLng = start.lng
  const a = toEnuMeters(start.lat, start.lng, refLat, refLng)
  const b = toEnuMeters(end.lat, end.lng, refLat, refLng)
  const abx = b.x - a.x
  const aby = b.y - a.y
  const ab2 = abx * abx + aby * aby
  if (ab2 < 1e-6) return []

  const out = []
  for (const bld of buildings) {
    const lat = Number(bld.lat)
    const lng = Number(bld.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const p = toEnuMeters(lat, lng, refLat, refLng)
    const apx = p.x - a.x
    const apy = p.y - a.y
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2))
    const projx = a.x + t * abx
    const projy = a.y + t * aby
    const dist = Math.hypot(p.x - projx, p.y - projy)
    if (dist <= half + 1e-3) out.push(bld)
  }
  return out
}
