/**
 * 将业务任务起终点映射到 Python offline_train 的 mission_id（q_table_mission_N.npz）
 */
import { getDistanceFromLatLonInMeters } from '@/utils/pathCalculator'

const PY_MISSION_RULES = [
  { missionId: 1, keywords: ['南昌舰', '八一大桥'], startAliases: ['南昌舰', '主题公园'], endAliases: ['八一', '八一大桥', '大桥'] },
  { missionId: 2, keywords: ['秋水广场', '地铁大厦'], startAliases: ['秋水广场', '秋水'], endAliases: ['地铁大厦', '地铁', '大厦'] },
  { missionId: 3, keywords: ['南昌大学', '第一医院'], startAliases: ['南昌大学', '大学'], endAliases: ['第一医院', '医院', '第一'] },
  { missionId: 4, keywords: ['南昌航空大学', '人民政府'], startAliases: ['南昌航空大学', '航空大学', '南航'], endAliases: ['人民政府', '市政府', '政府'] },
  { missionId: 5, keywords: ['印象城', '航空大学'], startAliases: ['印象城', 'incity'], endAliases: ['航空大学', '南航', '航空'] }
] as const

const PY_MISSION_GEO = [
  { missionId: 1, start: { lat: 28.717861, lng: 115.865875 }, end: { lat: 28.692707, lng: 115.882176 } },
  { missionId: 2, start: { lat: 28.684521, lng: 115.85891 }, end: { lat: 28.681276, lng: 115.861983 } },
  { missionId: 3, start: { lat: 28.664729, lng: 115.918957 }, end: { lat: 28.675901, lng: 115.899369 } },
  { missionId: 4, start: { lat: 28.683899, lng: 115.853558 }, end: { lat: 28.683186, lng: 115.857866 } },
  { missionId: 5, start: { lat: 28.658261, lng: 115.833281 }, end: { lat: 28.653182, lng: 115.822757 } }
] as const

/** 起终点与训练锚点的最大允许偏差（米），超出则不应使用该 mission 的 Q 表 */
export const MISSION_GEO_MAX_DISTANCE_M = 5000

export const FLIGHT_SIM_SESSION_KEY = 'uav_flight_sim_session'

export interface MissionResolveInput {
  task?: {
    taskId?: number
    taskName?: string
    startLocation?: string
    endLocation?: string
    taskType?: string
  } | null
  startPointText?: string
  endPointText?: string
  startGeo?: { lat: number; lng: number } | null
  endGeo?: { lat: number; lng: number } | null
  forcedMissionId?: number
  extraTasks?: Array<{ taskName?: string; startLocation?: string; endLocation?: string }>
}

export const normalizePlaceText = (v: unknown) =>
  String(v ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[-—–_>＞→]/g, '')
    .replace(/[，,。.;；:：、]/g, '')
    .replace(/南昌市/g, '')
    .toLowerCase()

function collectPlaceTexts(input: MissionResolveInput) {
  const t = input.task
  const startFields = [input.startPointText, t?.startLocation]
    .map(normalizePlaceText)
    .filter(Boolean)
  const endFields = [input.endPointText, t?.endLocation].map(normalizePlaceText).filter(Boolean)
  const nameField = normalizePlaceText(t?.taskName)
  const allText = [...startFields, ...endFields, nameField].filter(Boolean).join('|')
  return { startFields, endFields, allText }
}

function resolveByText(input: MissionResolveInput): number {
  const { startFields, endFields, allText } = collectPlaceTexts(input)
  if (!allText) return 0

  if (allText.includes('秋水') && (allText.includes('地铁大厦') || allText.includes('地铁'))) {
    return 2
  }
  if (allText.includes('印象城') && (allText.includes('航空大学') || allText.includes('航空'))) {
    return 5
  }

  for (const rule of PY_MISSION_RULES) {
    const kws = rule.keywords.map(normalizePlaceText)
    if (kws.every((kw) => allText.includes(kw))) return rule.missionId
  }

  for (const rule of PY_MISSION_RULES) {
    const startAliases = rule.startAliases.map(normalizePlaceText)
    const endAliases = rule.endAliases.map(normalizePlaceText)
    const startHit = startFields.some((s) => startAliases.some((a) => s.includes(a)))
    const endHit = endFields.some((e) => endAliases.some((a) => e.includes(a)))
    if (startHit && endHit) return rule.missionId
  }
  return 0
}

function resolveByGeo(start?: { lat: number; lng: number } | null, end?: { lat: number; lng: number } | null, allText = '') {
  if (!start || !end) return 0
  const ranked = PY_MISSION_GEO.map((m) => {
    const dForward =
      getDistanceFromLatLonInMeters(start.lat, start.lng, m.start.lat, m.start.lng) +
      getDistanceFromLatLonInMeters(end.lat, end.lng, m.end.lat, m.end.lng)
    const dReverse =
      getDistanceFromLatLonInMeters(start.lat, start.lng, m.end.lat, m.end.lng) +
      getDistanceFromLatLonInMeters(end.lat, end.lng, m.start.lat, m.start.lng)
    return { id: m.missionId, score: Math.min(dForward, dReverse) }
  }).sort((a, b) => a.score - b.score)

  const best = ranked[0]
  if (!best || best.score > MISSION_GEO_MAX_DISTANCE_M) return 0

  const second = ranked[1]
  if (best.id === 4 && second?.id === 2 && second.score - best.score < 1500) {
    if (allText.includes('秋水') || allText.includes('地铁')) return 2
  }
  if (best.id === 4 && second?.id === 5 && second.score - best.score < 1500) {
    if (allText.includes('印象城')) return 5
  }
  if (best.id === 5 && second?.id === 4 && second.score - best.score < 1500) {
    if (allText.includes('人民政府') || allText.includes('市政府')) return 4
  }
  if (best.id === 2 && second?.id === 4 && second.score - best.score < 1500) {
    if (allText.includes('航空') || allText.includes('南航') || allText.includes('人民政府')) return 4
  }
  return best.id
}

/** 起终点与指定 mission 训练锚点的综合距离（米，含正反向） */
export function getMissionGeoDistance(
  missionId: number,
  start?: { lat: number; lng: number } | null,
  end?: { lat: number; lng: number } | null
): number {
  const anchor = PY_MISSION_GEO.find((m) => m.missionId === missionId)
  if (!anchor || !start || !end) return Number.POSITIVE_INFINITY
  const dForward =
    getDistanceFromLatLonInMeters(start.lat, start.lng, anchor.start.lat, anchor.start.lng) +
    getDistanceFromLatLonInMeters(end.lat, end.lng, anchor.end.lat, anchor.end.lng)
  const dReverse =
    getDistanceFromLatLonInMeters(start.lat, start.lng, anchor.end.lat, anchor.end.lng) +
    getDistanceFromLatLonInMeters(end.lat, end.lng, anchor.start.lat, anchor.start.lng)
  return Math.min(dForward, dReverse)
}

export function isMissionGeoMatch(
  missionId: number,
  start?: { lat: number; lng: number } | null,
  end?: { lat: number; lng: number } | null,
  maxM = MISSION_GEO_MAX_DISTANCE_M
): boolean {
  if (!missionId || !start || !end) return false
  return getMissionGeoDistance(missionId, start, end) <= maxM
}

/** 解析应加载的 Python Q-table mission_id（有坐标时必须通过地理锚点校验） */
export function resolvePythonMissionId(input: MissionResolveInput = {}): number {
  const forced = Number(input.forcedMissionId ?? 0)
  if (Number.isFinite(forced) && forced > 0) {
    if (input.startGeo && input.endGeo && !isMissionGeoMatch(forced, input.startGeo, input.endGeo)) {
      return 0
    }
    return forced
  }

  const { allText } = collectPlaceTexts(input)
  const hasGeo = Boolean(input.startGeo && input.endGeo)

  if (hasGeo) {
    const byGeo = resolveByGeo(input.startGeo ?? null, input.endGeo ?? null, allText)
    if (byGeo > 0) return byGeo

    const byText = resolveByText(input)
    if (byText > 0 && isMissionGeoMatch(byText, input.startGeo!, input.endGeo!)) return byText
    return 0
  }

  const byText = resolveByText(input)
  if (byText > 0) return byText

  for (const t of input.extraTasks || []) {
    const mid = resolveByText({ task: t })
    if (mid > 0) return mid
  }
  return 0
}

export function getMissionLabel(missionId: number): string {
  const labels: Record<number, string> = {
    1: 'Mission 1 · 南昌舰 → 八一大桥',
    2: 'Mission 2 · 秋水广场 → 地铁大厦',
    3: 'Mission 3 · 南昌大学 → 第一医院',
    4: 'Mission 4 · 南航 → 市政府',
    5: 'Mission 5 · 印象城 → 航空大学'
  }
  return labels[missionId] || `Mission ${missionId}`
}

export const PY_MISSION_OPTIONS = [
  { id: 1, label: getMissionLabel(1) },
  { id: 2, label: getMissionLabel(2) },
  { id: 3, label: getMissionLabel(3) },
  { id: 4, label: getMissionLabel(4) },
  { id: 5, label: getMissionLabel(5) }
] as const

/** 解析 "lat,lng" 或地址缓存中的坐标文本 */
export function parseCoordPair(text: unknown): { lat: number; lng: number } | null {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  const parts = raw.split(/[,，\s]+/).map(Number).filter(Number.isFinite)
  if (parts.length < 2) return null
  let lat = parts[0]
  let lng = parts[1]
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    const t = lat
    lat = lng
    lng = t
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

/** 从 uav_route_data 缓存字段推断 Python mission id（须通过地理校验） */
export function resolvePythonMissionIdFromRouteCache(data: Record<string, any> = {}): number {
  const startGeo = parseCoordPair(data.startCoord)
  const endGeo = parseCoordPair(data.endCoord)

  return resolvePythonMissionId({
    task: data.businessTaskId
      ? {
          taskId: Number(data.businessTaskId),
          startLocation: data.startPoint,
          endLocation: data.endPoint
        }
      : null,
    startPointText: data.startPoint || data.startCoord,
    endPointText: data.endPoint || data.endCoord,
    startGeo,
    endGeo,
    forcedMissionId: Number(data.pyMissionId || data.missionId || 0) || undefined
  })
}
