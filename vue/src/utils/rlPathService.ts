import { planPath } from '@/api/system/pathPlanning'
import { enrichPathWithAltitude } from '@/utils/pathAltitude'
import { decodeRlApiPathToGcj02 } from '@/utils/rlGridGeo'

export interface RlPathRequest {
  start: { lat: number; lng: number }
  end: { lat: number; lng: number }
  cruiseAlt: number
  missionId?: number
  qOnly?: boolean
}

export interface RlPathResult {
  pathPoints: Array<{ lng: number; lat: number; alt: number }>
  rlMeta: Record<string, unknown> | null
  missionId: number
}

/** 调用 Java → Python 复现离线训练缓存路径（默认）或 Q-table 推理 */
export async function fetchRlPath(req: RlPathRequest): Promise<RlPathResult> {
  const mid = Number(req.missionId ?? 0)
  const cruiseAlt = Number(req.cruiseAlt) || 120
  const useReplay = mid > 0 && req.qOnly !== false
  const rlResp = await planPath({
    startPoint: [req.start.lat, req.start.lng, cruiseAlt],
    endPoint: [req.end.lat, req.end.lng, cruiseAlt],
    qOnly: req.qOnly !== false,
    replayCachedPath: useReplay,
    missionId: mid > 0 ? mid : undefined
  })
  if (rlResp?.code !== 200) {
    throw new Error(rlResp?.msg || '强化学习路径规划失败')
  }
  const data = rlResp.data as Record<string, unknown>
  const raw =
    mid > 0
      ? decodeRlApiPathToGcj02(
          data,
          mid,
          { lat: req.start.lat, lng: req.start.lng },
          { lat: req.end.lat, lng: req.end.lng },
          cruiseAlt,
          { warpToUserAnchors: true, defaultAlt: cruiseAlt }
        )
      : []
  if (raw.length < 2 && Array.isArray(data?.path) && (data.path as unknown[]).length) {
    throw new Error(rlResp?.msg || '强化学习路径坐标转换失败')
  }
  if (raw.length < 2) {
    throw new Error(rlResp?.msg || '强化学习路径规划失败')
  }
  const enriched = enrichPathWithAltitude(
    raw.map((p) => ({ lat: p.lat, lng: p.lng, alt: p.alt })),
    { cruiseAlt, preserveExistingAlt: true }
  )
  return {
    pathPoints: enriched,
    rlMeta: rlResp.data,
    missionId: mid
  }
}
