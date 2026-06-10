/**
 * RL 栅格路径 ↔ WGS84 转换（与 Python offline_train / Java GridTransform 一致）
 */
import { convertPathWgs84ToGcj02, gcj02ToWgs84 } from '@/utils/coordTransform'
import { getDistanceFromLatLonInMeters } from '@/utils/pathCalculator'
import { getMissionTrainAnchor, warpOfflineRlPathToUserAnchors } from '@/utils/offlineRlPathWarp'

const EARTH_R_M = 6378137.0
const OFFLINE_GRID_N = 54
const OFFLINE_MARGIN = 6
const OFFLINE_Z_SCALE = 2.0

export type GridTransformMeta = {
  originLat: number
  originLon: number
  xyScaleMPerGrid: number
  zScaleMPerGrid: number
  gridN?: number
  gridCenter?: number
}

export function looksLikeGeoCoord(a: number, b: number, gridN = OFFLINE_GRID_N): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  if (a >= 3 && a <= 54.5 && b >= 70 && b <= 136) return true
  if (Math.abs(b) > 70 && Math.abs(a) <= gridN + 5) return true
  return false
}

function normalizeTriple(raw: unknown): [number, number, number] | null {
  if (Array.isArray(raw) && raw.length >= 2) {
    const a = Number(raw[0])
    const b = Number(raw[1])
    const c = raw.length >= 3 ? Number(raw[2]) : 0
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null
    return [a, b, Number.isFinite(c) ? c : 0]
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, number>
    const lat = Number(o.lat ?? o.latitude)
    const lng = Number(o.lng ?? o.lon ?? o.longitude)
    const alt = Number(o.alt ?? o.altitude ?? 0)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return [lat, lng, Number.isFinite(alt) ? alt : 0]
  }
  return null
}

export function isGridPathTriple(triple: [number, number, number], gridN = OFFLINE_GRID_N): boolean {
  const [a, b] = triple
  if (looksLikeGeoCoord(a, b, gridN)) return false
  return a >= 0 && a <= gridN + 2 && b >= 0 && b <= gridN + 2
}

export function gridTripleToWgs84(
  x: number,
  y: number,
  z: number,
  meta: GridTransformMeta
): { lat: number; lng: number; alt: number } {
  const gridN = meta.gridN ?? OFFLINE_GRID_N
  const center = meta.gridCenter ?? gridN / 2
  const lat0Rad = (meta.originLat * Math.PI) / 180
  const dx = (x - center) * meta.xyScaleMPerGrid
  const dy = (y - center) * meta.xyScaleMPerGrid
  const lat = meta.originLat + (dy / EARTH_R_M) * (180 / Math.PI)
  const lng = meta.originLon + (dx / (EARTH_R_M * Math.cos(lat0Rad))) * (180 / Math.PI)
  return { lat, lng, alt: z * meta.zScaleMPerGrid }
}

/** 与 Java/Python offline mission 栅格对齐（无 API 元数据时的兜底） */
export function buildMissionGridTransform(missionId: number): GridTransformMeta | null {
  const anchor = getMissionTrainAnchor(missionId)
  if (!anchor) return null
  const originLat = (anchor.start.lat + anchor.goal.lat) / 2
  const originLon = (anchor.start.lng + anchor.goal.lng) / 2
  const center = OFFLINE_GRID_N / 2
  const halfUsable = Math.max(2, center - OFFLINE_MARGIN - 2)
  const dLatM = getDistanceFromLatLonInMeters(anchor.start.lat, anchor.start.lng, anchor.goal.lat, anchor.start.lng)
  const requiredScale = Math.max(dLatM, 260) / halfUsable
  const xyScaleMPerGrid = Math.max(8, requiredScale * 1.12)
  return {
    originLat,
    originLon,
    xyScaleMPerGrid,
    zScaleMPerGrid: OFFLINE_Z_SCALE,
    gridN: OFFLINE_GRID_N,
    gridCenter: center
  }
}

export function extractGridTransform(data: Record<string, unknown> | null | undefined, missionId: number): GridTransformMeta | null {
  if (!data) return buildMissionGridTransform(missionId)
  const gt = (data.gridTransform || data.grid_transform) as Record<string, unknown> | undefined
  const num = (v: unknown, fallback = NaN) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const originLat = num(gt?.originLat ?? gt?.origin_lat ?? data.originLat ?? data.origin_lat)
  const originLon = num(gt?.originLon ?? gt?.origin_lon ?? data.originLon ?? data.origin_lon)
  const xyScaleMPerGrid = num(
    gt?.xyScaleMPerGrid ?? gt?.xy_scale_m_per_grid ?? data.xyScaleMPerGrid ?? data.xy_scale_m_per_grid
  )
  const zScaleMPerGrid = num(
    gt?.zScaleMPerGrid ?? gt?.z_scale_m_per_grid ?? data.zScaleMPerGrid ?? data.z_scale_m_per_grid,
    OFFLINE_Z_SCALE
  )
  if (Number.isFinite(originLat) && Number.isFinite(originLon) && Number.isFinite(xyScaleMPerGrid)) {
    return {
      originLat,
      originLon,
      xyScaleMPerGrid,
      zScaleMPerGrid,
      gridN: num(gt?.gridN ?? gt?.grid_n ?? data.gridN ?? data.grid_n, OFFLINE_GRID_N),
      gridCenter: num(gt?.gridCenter ?? gt?.grid_center ?? data.gridCenter ?? data.grid_center, OFFLINE_GRID_N / 2)
    }
  }
  return buildMissionGridTransform(missionId)
}

function triplesToWgs84(rawArr: unknown[], meta: GridTransformMeta | null, gridN: number) {
  const out: Array<{ lat: number; lng: number; alt: number }> = []
  for (const raw of rawArr) {
    const t = normalizeTriple(raw)
    if (!t) continue
    if (looksLikeGeoCoord(t[0], t[1], gridN)) {
      out.push({ lat: t[0], lng: t[1], alt: t[2] })
    } else if (meta) {
      out.push(gridTripleToWgs84(t[0], t[1], t[2], meta))
    }
  }
  return out
}

function anchorEndpoints(
  pts: Array<{ lat: number; lng: number; alt: number }>,
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
  defaultAlt: number
) {
  if (!pts.length) return pts
  const out = pts.map((p) => ({ ...p }))
  out[0] = { lat: start.lat, lng: start.lng, alt: Number(out[0].alt ?? defaultAlt) }
  out[out.length - 1] = { lat: end.lat, lng: end.lng, alt: Number(out[out.length - 1].alt ?? defaultAlt) }
  return out
}

/**
 * 解析 Java/Python RL 规划响应 → 高德 GCJ-02 路径点
 */
export type DecodeRlPathOptions = {
  /** 将训练锚点系 WGS84 路径仿射对齐到用户起终点（高德 GCJ-02 输入） */
  warpToUserAnchors?: boolean
  defaultAlt?: number
}

export function decodeRlApiPathToGcj02(
  data: Record<string, unknown> | null | undefined,
  missionId: number,
  userStartGcj: { lat: number; lng: number },
  userEndGcj: { lat: number; lng: number },
  defaultAlt: number,
  options: DecodeRlPathOptions = {}
): Array<{ lat: number; lng: number; alt: number }> {
  const cruiseAlt = Number(options.defaultAlt ?? defaultAlt) || defaultAlt
  const shouldWarp = options.warpToUserAnchors !== false && missionId > 0
  const meta = extractGridTransform(data, missionId)
  const gridN = meta?.gridN ?? OFFLINE_GRID_N

  const wgsRaw = (data?.path_wgs84 || data?.pathWgs84) as unknown[] | undefined
  const gridRaw = (data?.pathGrid || data?.path_grid) as unknown[] | undefined
  const pathRaw = data?.path as unknown[] | undefined

  let wgsPts: Array<{ lat: number; lng: number; alt: number }> = []

  if (Array.isArray(wgsRaw) && wgsRaw.length) {
    wgsPts = triplesToWgs84(wgsRaw, null, gridN)
  } else if (Array.isArray(gridRaw) && gridRaw.length && meta) {
    wgsPts = triplesToWgs84(gridRaw, meta, gridN)
  } else if (Array.isArray(pathRaw) && pathRaw.length) {
    const triples = pathRaw.map(normalizeTriple).filter(Boolean) as [number, number, number][]
    const allGrid = triples.length > 0 && triples.every((t) => isGridPathTriple(t, gridN))
    const allGeo = triples.length > 0 && triples.every((t) => looksLikeGeoCoord(t[0], t[1], gridN))
    if (allGrid && meta) {
      wgsPts = triplesToWgs84(pathRaw, meta, gridN)
    } else if (allGeo) {
      wgsPts = triplesToWgs84(pathRaw, null, gridN)
    } else if (meta) {
      wgsPts = triplesToWgs84(pathRaw, meta, gridN)
    }
  }

  if (wgsPts.length < 2) return []

  let alignedWgs = wgsPts
  if (shouldWarp) {
    const anchor = getMissionTrainAnchor(missionId)
    if (anchor) {
      const userStartWgs = gcj02ToWgs84({ lng: userStartGcj.lng, lat: userStartGcj.lat })
      const userEndWgs = gcj02ToWgs84({ lng: userEndGcj.lng, lat: userEndGcj.lat })
      alignedWgs = warpOfflineRlPathToUserAnchors(
        wgsPts.map((p) => ({ lat: p.lat, lng: p.lng, alt: p.alt ?? cruiseAlt })),
        { ...anchor.start, alt: anchor.start.alt ?? cruiseAlt },
        { ...anchor.goal, alt: anchor.goal.alt ?? cruiseAlt },
        { lat: userStartWgs.lat, lng: userStartWgs.lng, alt: cruiseAlt },
        { lat: userEndWgs.lat, lng: userEndWgs.lng, alt: cruiseAlt }
      )
    }
  }

  const gcj = convertPathWgs84ToGcj02(
    alignedWgs.map((p) => ({ lat: p.lat, lng: p.lng, alt: p.alt ?? cruiseAlt }))
  ).map((p) => ({
    lat: p.lat,
    lng: p.lng,
    alt: Number(p.alt ?? cruiseAlt)
  }))

  if (shouldWarp) return gcj
  return anchorEndpoints(gcj, userStartGcj, userEndGcj, cruiseAlt)
}
