/**
 * 水域巡检（河流）：高德无「沿河道/流域」专用路径 API，此处用起终点之间
 * `AMap.Walking` 步行路网做近似——城市中滨江步道、沿河绿道常落在步行网里，
 * 比「起终点直线」更接近沿岸飞行；若步行规划失败则回退为直线插值。
 *
 * 步行轨迹多在单岸绿道，再沿路径前进方向的法向平移若干米，可近似「向河道内侧 /
 * 中心线」偏移（默认 50m、默认向路径左侧；无河矢量时侧向需人工用 riverBankSide 校正）。
 */

import { planRiverWaterRoute } from './taskRouteGenerators'

const okStatus = (status, result) =>
  status === 'complete' || result?.info === 'OK' || result?.info === 'OK.'

function metersPerDegLat(lat) {
  return { mPerDegLat: 111320, mPerDegLng: 111320 * Math.cos((lat * Math.PI) / 180) }
}

/**
 * 将折线各点沿局部切线法向平移 offsetM 米（ENU：东、北）。
 * @param {Array<{ lng:number, lat:number, alt?:number }>} pts
 * @param {number} offsetM 平移距离（米），取绝对值
 * @param {'left'|'right'} side 相对飞行前进方向（点序）的左/右侧
 */
function offsetPolylinePerpendicularMeters(pts, offsetM, side = 'left') {
  const m = Math.abs(Number(offsetM))
  if (!m || !pts || pts.length < 2) return pts

  const n = pts.length
  const out = []
  const useRight = side === 'right'

  for (let i = 0; i < n; i++) {
    const lat = pts[i].lat
    const { mPerDegLng, mPerDegLat } = metersPerDegLat(lat)

    let te = 0
    let tn = 0
    if (i === 0) {
      te = (pts[1].lng - pts[0].lng) * mPerDegLng
      tn = (pts[1].lat - pts[0].lat) * mPerDegLat
    } else if (i === n - 1) {
      te = (pts[n - 1].lng - pts[n - 2].lng) * mPerDegLng
      tn = (pts[n - 1].lat - pts[n - 2].lat) * mPerDegLat
    } else {
      te = (pts[i + 1].lng - pts[i - 1].lng) * mPerDegLng
      tn = (pts[i + 1].lat - pts[i - 1].lat) * mPerDegLat
    }

    const len = Math.hypot(te, tn) || 1
    te /= len
    tn /= len
    // 左法向（东-北平面、沿前进方向看左侧）：(-tn, te)
    let ne = -tn
    let nn = te
    if (useRight) {
      ne = tn
      nn = -te
    }

    const dLng = (m * ne) / mPerDegLng
    const dLat = (m * nn) / mPerDegLat
    out.push({
      lng: pts[i].lng + dLng,
      lat: pts[i].lat + dLat,
      alt: pts[i].alt
    })
  }
  return out
}

function pathFromSteps(result) {
  const steps = result?.routes?.[0]?.steps || []
  const raw = []
  for (const step of steps) {
    const path = step?.path || []
    for (const p of path) {
      const lng = Array.isArray(p) ? p[0] : typeof p?.getLng === 'function' ? p.getLng() : p?.lng
      const lat = Array.isArray(p) ? p[1] : typeof p?.getLat === 'function' ? p.getLat() : p?.lat
      if (lng != null && lat != null && !Number.isNaN(Number(lng)) && !Number.isNaN(Number(lat))) {
        raw.push({ lng: Number(lng), lat: Number(lat) })
      }
    }
  }
  return raw
}

function ensureWalking() {
  return new Promise((resolve) => {
    if (typeof AMap === 'undefined' || typeof AMap.plugin !== 'function') return resolve()
    AMap.plugin(['AMap.Walking'], () => resolve())
  })
}

/**
 * @param {object} _context 预留（与 planTaskRoute 入参一致；步行规划可不绑 map）
 * @param {{ lng:number, lat:number }} start
 * @param {{ lng:number, lat:number }} end
 * @param {{ targetAltitudeM?: number, direction?: '顺流'|'逆流', pointsCount?: number, riverCenterOffsetM?: number, riverBankSide?: 'left'|'right' }} opts
 * @returns {Promise<{ pathPoints: Array<{ lng, lat, alt }>, source: 'walking'|'fallback_straight' }>}
 */
export async function planRiverPathWithAmapWalking(_context, start, end, opts = {}) {
  const targetAltitudeM = Number(opts.targetAltitudeM ?? 120)
  const direction = opts.direction ?? '顺流'
  const pointsCount = opts.pointsCount ?? 120
  const riverCenterOffsetM = Number(opts.riverCenterOffsetM ?? 50)
  const riverBankSide = opts.riverBankSide === 'right' ? 'right' : 'left'

  const fallback = () => ({
    pathPoints: planRiverWaterRoute({ start, end, direction, targetAltitudeM, pointsCount }),
    source: 'fallback_straight'
  })

  if (typeof AMap === 'undefined') {
    return fallback()
  }

  await ensureWalking()
  if (typeof AMap.Walking !== 'function') {
    return fallback()
  }

  let walking
  try {
    walking = new AMap.Walking({ map: null })
  } catch {
    return fallback()
  }

  const raw = await new Promise((resolve) => {
    walking.search(
      [Number(start.lng), Number(start.lat)],
      [Number(end.lng), Number(end.lat)],
      (status, result) => {
        if (!okStatus(status, result)) {
          resolve([])
          return
        }
        resolve(pathFromSteps(result))
      }
    )
  })

  if (!raw || raw.length < 2) {
    return fallback()
  }

  let pts = raw.map((p) => ({ ...p, alt: targetAltitudeM }))
  if (direction === '逆流') {
    pts = pts.slice().reverse()
  }
  pts = offsetPolylinePerpendicularMeters(pts, riverCenterOffsetM, riverBankSide)
  return { pathPoints: pts, source: 'walking' }
}
