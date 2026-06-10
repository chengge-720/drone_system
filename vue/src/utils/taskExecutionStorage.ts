/** 任务执行倒计时（localStorage） */
export const TASK_EXECUTION_PREFIX = 'uav_task_execution_'

/** 任务规划页会话：路径、统计、执行参数等 */
export const TASK_PLANNING_SESSION_PREFIX = 'uav_task_planning_session_'

export interface TaskExecutionRecord {
  taskId: number
  endAt: number
  speed: number
  distanceM: number
}

export interface TaskPlanningSession {
  taskId: number
  pathPoints: Array<{ lng: number; lat: number; alt?: number }>
  pathStats: {
    totalDistance: number
    estimatedTime: number
    pointCount: number
    avgSpeed?: number
    startCoord?: string
    endCoord?: string
  }
  lastGeoStart: { lng: number; lat: number } | null
  lastGeoEnd: { lng: number; lat: number } | null
  lastAlgorithm: string
  showResult: boolean
  targetAltitudeM: number
  executionSpeedMps: number
  waterSubType?: '河流' | '湖泊'
  riverDirection?: '顺流' | '逆流'
  riverCenterOffsetM?: number
  riverBankSide?: 'left' | 'right'
  is3DMode?: boolean
  savedAt: number
}

export function executionStorageKey(taskId: number) {
  return `${TASK_EXECUTION_PREFIX}${taskId}`
}

export function planningSessionKey(taskId: number) {
  return `${TASK_PLANNING_SESSION_PREFIX}${taskId}`
}

export function loadExecutionRecord(taskId: number): TaskExecutionRecord | null {
  try {
    const raw = localStorage.getItem(executionStorageKey(taskId))
    if (!raw) return null
    const data = JSON.parse(raw) as TaskExecutionRecord
    if (!data?.endAt) return null
    return data
  } catch {
    return null
  }
}

export function saveExecutionRecord(record: TaskExecutionRecord) {
  localStorage.setItem(executionStorageKey(record.taskId), JSON.stringify(record))
}

export function clearExecutionRecord(taskId: number) {
  localStorage.removeItem(executionStorageKey(taskId))
}

export function getExecutionRemainSeconds(taskId: number): number {
  const rec = loadExecutionRecord(taskId)
  if (!rec) return 0
  return Math.max(0, Math.ceil((Number(rec.endAt) - Date.now()) / 1000))
}

export function savePlanningSession(session: TaskPlanningSession) {
  localStorage.setItem(planningSessionKey(session.taskId), JSON.stringify(session))
}

export function loadPlanningSession(taskId: number): TaskPlanningSession | null {
  try {
    const raw = localStorage.getItem(planningSessionKey(taskId))
    if (!raw) return null
    return JSON.parse(raw) as TaskPlanningSession
  } catch {
    return null
  }
}

export function clearPlanningSession(taskId: number) {
  localStorage.removeItem(planningSessionKey(taskId))
}
