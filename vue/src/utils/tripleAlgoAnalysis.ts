/**
 * 三算法（RL / A* / GA）对比分析与推荐
 */
import { getDistanceFromLatLonInMeters } from '@/utils/pathCalculator'
import { getAlgorithmColor } from '@/utils/pathCalculator'
import { normalizeGeoPathPoints } from '@/utils/geoPathNormalize'

export interface TripleAlgoRow {
  algorithm: string
  pathPoints: Array<{ lng: number; lat: number; alt?: number }>
  totalDistance: number
  estimatedTime: number
  pointCount: number
  computationTime?: number
  note?: string
}

export interface TripleRecommendation {
  algorithm: string
  score: number
  reasons: string[]
  pathPoints: Array<{ lng: number; lat: number; alt?: number }>
}

export interface CumulativeSeries {
  algorithm: string
  color: string
  distances: number[]
}

const ALGO_KEYS = ['强化学习', 'A*算法', '遗传算法'] as const

export function buildCumulativeDistanceSeries(rows: TripleAlgoRow[]): CumulativeSeries[] {
  return rows.map((row) => {
    const pts = row.pathPoints || []
    const distances = [0]
    for (let i = 1; i < pts.length; i++) {
      const d = getDistanceFromLatLonInMeters(
        pts[i - 1].lat,
        pts[i - 1].lng,
        pts[i].lat,
        pts[i].lng
      )
      distances.push(distances[i - 1] + d)
    }
    return {
      algorithm: row.algorithm,
      color: getDashboardAlgoColor(row.algorithm),
      distances
    }
  })
}

/** 综合评分：距离 50% + 时间 30% + 计算耗时 10% + 点数精简 10%（均越小越好） */
export function recommendTripleAlgorithm(
  rows: TripleAlgoRow[],
  pathType = ''
): TripleRecommendation | null {
  if (!rows?.length) return null

  const scored = rows.map((r) => {
    const maxDist = Math.max(...rows.map((x) => x.totalDistance || 1), 1)
    const maxTime = Math.max(...rows.map((x) => x.estimatedTime || 1), 1)
    const maxComp = Math.max(...rows.map((x) => x.computationTime || 0), 1) || 1
    const maxPts = Math.max(...rows.map((x) => x.pointCount || 1), 1)

    let score =
      (r.totalDistance / maxDist) * 0.5 +
      (r.estimatedTime / maxTime) * 0.3 +
      ((r.computationTime ?? 0) / maxComp) * 0.1 +
      (r.pointCount / maxPts) * 0.1

    if (r.algorithm === '强化学习' && /未到达|失败|降级/.test(r.note || '')) {
      score += 0.35
    }
    if (pathType === '道路巡检' && r.algorithm === 'A*算法') {
      score -= 0.05
    }
    if (pathType === '水域巡检' && r.algorithm === 'A*算法') {
      score -= 0.03
    }

    return { row: r, score }
  })

  scored.sort((a, b) => a.score - b.score)
  const best = scored[0]
  const reasons: string[] = []

  const others = scored.slice(1)
  if (others.length) {
    const dSave = others[0].row.totalDistance - best.row.totalDistance
    if (dSave > 5) {
      reasons.push(`总距离较短（约少 ${Math.round(dSave)} m）`)
    }
  }
  if (best.row.computationTime != null && best.row.computationTime < 500) {
    reasons.push('计算耗时较低，适合实时任务')
  }
  if (pathType) {
    reasons.push(`结合路径类型「${pathType}」的综合表现`)
  }
  if (!reasons.length) {
    reasons.push('综合距离、时间与计算效率最优')
  }

  return {
    algorithm: best.row.algorithm,
    score: Math.round((1 - best.score) * 100),
    reasons,
    pathPoints: best.row.pathPoints || []
  }
}

export function tripleAlgoPieData(rows: TripleAlgoRow[]) {
  const total = rows.reduce((s, r) => s + (r.totalDistance || 0), 0) || 1
  return rows.map((r) => ({
    name: r.algorithm,
    value: r.totalDistance,
    percent: ((r.totalDistance / total) * 100).toFixed(1),
    itemStyle: { color: getAlgorithmColor(r.algorithm) }
  }))
}

export function tripleAlgoBarMetrics(rows: TripleAlgoRow[]) {
  return {
    algorithms: rows.map((r) => r.algorithm),
    distances: rows.map((r) => r.totalDistance),
    times: rows.map((r) => r.estimatedTime),
    points: rows.map((r) => r.pointCount),
    computeMs: rows.map((r) => r.computationTime ?? 0),
    colors: rows.map((r) => getAlgorithmColor(r.algorithm))
  }
}

export const ROUTE_STORAGE_KEY = 'uav_route_data'

export interface TripleStoragePack {
  tripleAlgoResults: TripleAlgoRow[]
  pathType: string
  missionId: number
  uavModel: string
  uavMaxFlightTime?: number
  cruiseAltitudeM?: number
  startPoint?: string
  endPoint?: string
  savedAt?: number
}

/** 看板路线色：青 / 橙 / 紫 */
export const DASHBOARD_ALGO_COLORS: Record<string, string> = {
  强化学习: '#06b6d4',
  'A*算法': '#f97316',
  遗传算法: '#8b5cf6'
}

export function getDashboardAlgoColor(algorithm: string) {
  return DASHBOARD_ALGO_COLORS[algorithm] || '#64748b'
}

export function estimatePowerMetrics(estSeconds: number, maxFlightMinutes?: number) {
  const maxMinutes = Number(maxFlightMinutes) || 0
  const maxSeconds = maxMinutes * 60
  const sec = Math.max(0, Number(estSeconds) || 0)
  if (!maxSeconds || !sec) {
    return {
      powerPercent: 0,
      remainPercent: 100,
      remainMinutes: maxMinutes || null as number | null
    }
  }
  const powerPercent = Math.min(100, Math.round((sec / maxSeconds) * 100))
  return {
    powerPercent,
    remainPercent: Math.max(0, 100 - powerPercent),
    remainMinutes: Math.max(0, Math.round(maxMinutes - sec / 60))
  }
}

export interface DashboardAlgoCard extends TripleAlgoRow {
  color: string
  distancePct: number
  timePct: number
  pointsPct: number
  powerPercent: number
  remainPercent: number
  remainMinutes: number | null
}

export function buildDashboardAlgoCards(
  rows: TripleAlgoRow[],
  maxFlightMinutes?: number
): DashboardAlgoCard[] {
  if (!rows?.length) return []
  const maxDistance = Math.max(...rows.map((r) => r.totalDistance || 0), 1)
  const maxTime = Math.max(...rows.map((r) => r.estimatedTime || 0), 1)
  const maxPoints = Math.max(...rows.map((r) => r.pointCount || 0), 1)
  return rows.map((row) => {
    const power = estimatePowerMetrics(row.estimatedTime, maxFlightMinutes)
    return {
      ...row,
      color: getDashboardAlgoColor(row.algorithm),
      distancePct: Math.round(((row.totalDistance || 0) / maxDistance) * 100),
      timePct: Math.round(((row.estimatedTime || 0) / maxTime) * 100),
      pointsPct: Math.round(((row.pointCount || 0) / maxPoints) * 100),
      ...power
    }
  })
}

export function loadTripleFromStorage(): TripleStoragePack | null {
  try {
    const raw = localStorage.getItem(ROUTE_STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    const triple = data?.tripleAlgoResults
    if (!Array.isArray(triple) || !triple.length) return null
    return {
      tripleAlgoResults: triple.map((row: TripleAlgoRow) => ({
        ...row,
        pathPoints: normalizeGeoPathPoints(row.pathPoints || [])
      })),
      pathType: data.pathType || '',
      missionId: Number(data.pyMissionId || data.missionId || 0),
      uavModel: data.uavModel || '',
      uavMaxFlightTime: Number(data.uavMaxFlightTime) || undefined,
      cruiseAltitudeM: Number(data.cruiseAltitudeM) || undefined,
      startPoint: data.startPoint || data.startCoord || '',
      endPoint: data.endPoint || data.endCoord || '',
      savedAt: Number(data.savedAt) || undefined
    }
  } catch {
    return null
  }
}
