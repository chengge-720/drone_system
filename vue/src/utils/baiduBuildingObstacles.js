/**
 * 使用高德地图 POI 搜索在起终点矩形范围内检索建筑类 POI，
 * 转为后端可识别的近似长方体障碍物（经纬度中心 + 米制尺寸）。
 *
 * 注意：为了不改动上层 import，这里仍保留函数名
 * `fetchBaiduBuildingPoiObstacles`（但内部已改为 AMap）。
 */
const DEFAULT_QUERIES = ['写字楼', '大厦', '商场']

function hashString(s) {
  let h = 0
  const str = String(s || '')
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function heightMFromName(name) {
  const n = String(name || '')
  if (/超高层|双子塔|国际中心|金融中心/.test(n)) return 72
  if (/酒店|宾馆|Hospital|医院/.test(n)) return 55
  if (/商场|购物|广场|Mall|mall/.test(n)) return 28
  const h = 38 + (hashString(n) % 22)
  return h
}

function footprintMFromName(name) {
  const base = 30 + (hashString(name) % 18)
  return { widthM: base, depthM: base + (hashString(name + 'd') % 10) }
}

export function buildBaiduSearchBounds(start, end, padDeg = 0.01) {
  const swLat = Math.min(start.lat, end.lat) - padDeg
  const swLng = Math.min(start.lng, end.lng) - padDeg
  const neLat = Math.max(start.lat, end.lat) + padDeg
  const neLng = Math.max(start.lng, end.lng) + padDeg
  // 兼容：如 AMap 未加载则降级为旧字符串
  try {
    return new AMap.Bounds([swLng, swLat], [neLng, neLat])
  } catch {
    return `${swLat},${swLng},${neLat},${neLng}`
  }
}

function getLngLatFromPoiLocation(loc) {
  if (!loc) return null
  const lng =
    typeof loc?.getLng === 'function' ? loc.getLng() : typeof loc?.lng === 'number' ? loc.lng : Number(loc?.lng)
  const lat =
    typeof loc?.getLat === 'function' ? loc.getLat() : typeof loc?.lat === 'number' ? loc.lat : Number(loc?.lat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { lng, lat }
}

/**
 * @param {{ lat: number, lng: number }} start
 * @param {{ lat: number, lng: number }} end
 * @param {{ maxTotal?: number, queries?: string[], padDeg?: number }} options
 * @returns {Promise<Array<{ type: string, lat: number, lng: number, widthM: number, depthM: number, heightM: number, name?: string }>>}
 */
export async function fetchBaiduBuildingPoiObstacles(start, end, options = {}) {
  const maxTotal = options.maxTotal ?? 24
  const queries = options.queries ?? DEFAULT_QUERIES
  const bounds = buildBaiduSearchBounds(start, end, options.padDeg ?? 0.012)

  const seen = new Set()
  const out = []

  for (const q of queries) {
    if (out.length >= maxTotal) break

    // AMap PlaceSearch：一次查询取一页（20 条），不足则继续下一个关键词直到 maxTotal
    try {
      if (typeof AMap === 'undefined' || typeof AMap.PlaceSearch === 'undefined') {
        throw new Error('AMap PlaceSearch 未加载')
      }

      const placeSearch = new AMap.PlaceSearch({
        pageSize: 20,
        pageIndex: 1,
        bounds
      })

      const result = await new Promise((resolve, reject) => {
        placeSearch.search(q, (status, res) => {
          // status 多为 'complete' / 'error' 等
          if (status === 'complete' && res) resolve(res)
          else reject(new Error(`AMap PlaceSearch failed: ${status}`))
        })
      })

      const pois = result?.pois || result?.poiList?.pois || []
      if (!Array.isArray(pois)) continue

      for (const poi of pois) {
        if (out.length >= maxTotal) break
        const name = poi?.name || poi?.title || 'poi'
        const loc = poi?.location || poi?.point
        const ll = getLngLatFromPoiLocation(loc)
        if (!ll) continue

        const { lng, lat } = ll
        const uid = poi?.id || poi?.uid || `${name}_${lng.toFixed(5)}_${lat.toFixed(5)}`
        if (seen.has(uid)) continue
        seen.add(uid)

        const { widthM, depthM } = footprintMFromName(name)
        out.push({
          type: 'cube',
          lat,
          lng,
          widthM,
          depthM,
          heightM: heightMFromName(name),
          name
        })
      }
    } catch {
      // 单次关键词失败不影响整体：继续尝试下一个关键词
      continue
    }
  }

  return out
}
