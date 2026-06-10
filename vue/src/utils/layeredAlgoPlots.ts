/**
 * 分层算法图 — 路径级 / RL 核心（会话生成，不依赖离线 Q 表 mission）
 */
import { normalizeGeoPathPoints } from '@/utils/geoPathNormalize'
import { getDashboardAlgoColor, type TripleAlgoRow } from '@/utils/tripleAlgoAnalysis'

type GeoPt = { lng: number; lat: number }

const RL_ALGO = '强化学习'

function pickRow(rows: TripleAlgoRow[], algorithm: string) {
  return rows.find((r) => r.algorithm === algorithm) || null
}

function normalizeRows(rows: TripleAlgoRow[]): TripleAlgoRow[] {
  return (rows || []).map((r) => ({
    ...r,
    pathPoints: normalizeGeoPathPoints(r.pathPoints || [])
  }))
}

function collectBounds(paths: GeoPt[][]) {
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const pts of paths) {
    for (const p of pts) {
      minLng = Math.min(minLng, p.lng)
      maxLng = Math.max(maxLng, p.lng)
      minLat = Math.min(minLat, p.lat)
      maxLat = Math.max(maxLat, p.lat)
    }
  }
  if (!Number.isFinite(minLng)) {
    return { minLng: 0, maxLng: 1, minLat: 0, maxLat: 1 }
  }
  const padLng = Math.max((maxLng - minLng) * 0.08, 0.0003)
  const padLat = Math.max((maxLat - minLat) * 0.08, 0.0003)
  return {
    minLng: minLng - padLng,
    maxLng: maxLng + padLng,
    minLat: minLat - padLat,
    maxLat: maxLat + padLat
  }
}

function projectPoint(
  p: GeoPt,
  bounds: ReturnType<typeof collectBounds>,
  w: number,
  h: number,
  pad: number
) {
  const bw = bounds.maxLng - bounds.minLng || 1
  const bh = bounds.maxLat - bounds.minLat || 1
  const x = pad + ((p.lng - bounds.minLng) / bw) * (w - pad * 2)
  const y = pad + (1 - (p.lat - bounds.minLat) / bh) * (h - pad * 2)
  return { x, y }
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  pts: GeoPt[],
  bounds: ReturnType<typeof collectBounds>,
  w: number,
  h: number,
  color: string,
  lineWidth = 2.4,
  dash: number[] = []
) {
  if (pts.length < 2) return
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (dash.length) ctx.setLineDash(dash)
  ctx.beginPath()
  pts.forEach((p, i) => {
    const { x, y } = projectPoint(p, bounds, w, h, 36)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()
  const start = projectPoint(pts[0], bounds, w, h, 36)
  const end = projectPoint(pts[pts.length - 1], bounds, w, h, 36)
  ctx.fillStyle = '#16a34a'
  ctx.beginPath()
  ctx.arc(start.x, start.y, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.arc(end.x, end.y, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function canvasToDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/png')
}

function computeTurnAngles(pts: GeoPt[]) {
  const angles: number[] = []
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const v1x = b.lng - a.lng
    const v1y = b.lat - a.lat
    const v2x = c.lng - b.lng
    const v2y = c.lat - b.lat
    const dot = v1x * v2x + v1y * v2y
    const m1 = Math.hypot(v1x, v1y) || 1
    const m2 = Math.hypot(v2x, v2y) || 1
    const cos = Math.max(-1, Math.min(1, dot / (m1 * m2)))
    angles.push(Math.acos(cos))
  }
  return angles
}

export interface SessionPlotPack {
  pathCompare: string
  metricsBar: string
  pathCurvature: string
  hasRlPath: boolean
}

export function buildSessionPlotsFromTriple(rows: TripleAlgoRow[]): SessionPlotPack | null {
  const normalized = normalizeRows(rows).filter((r) => (r.pathPoints || []).length >= 2)
  if (!normalized.length) return null

  const rl = pickRow(normalized, RL_ALGO)
  const astar = pickRow(normalized, 'A*算法')
  const ga = pickRow(normalized, '遗传算法')

  const allPaths = normalized.map((r) => r.pathPoints as GeoPt[])
  const bounds = collectBounds(allPaths)

  // --- 三算法路径对比 ---
  const cmpCanvas = document.createElement('canvas')
  cmpCanvas.width = 880
  cmpCanvas.height = 620
  const cmpCtx = cmpCanvas.getContext('2d')!
  cmpCtx.fillStyle = '#f8fafc'
  cmpCtx.fillRect(0, 0, cmpCanvas.width, cmpCanvas.height)
  cmpCtx.fillStyle = '#334155'
  cmpCtx.font = '600 15px Inter, sans-serif'
  cmpCtx.fillText('三算法路径对比（当前任务）', 36, 32)

  const legend: Array<{ label: string; color: string }> = []
  if (rl) {
    drawPath(cmpCtx, rl.pathPoints, bounds, cmpCanvas.width, cmpCanvas.height, getDashboardAlgoColor(RL_ALGO))
    legend.push({ label: RL_ALGO, color: getDashboardAlgoColor(RL_ALGO) })
  }
  if (astar) {
    drawPath(cmpCtx, astar.pathPoints, bounds, cmpCanvas.width, cmpCanvas.height, getDashboardAlgoColor('A*算法'), 2, [8, 5])
    legend.push({ label: 'A*算法', color: getDashboardAlgoColor('A*算法') })
  }
  if (ga) {
    drawPath(cmpCtx, ga.pathPoints, bounds, cmpCanvas.width, cmpCanvas.height, getDashboardAlgoColor('遗传算法'), 2, [4, 4])
    legend.push({ label: '遗传算法', color: getDashboardAlgoColor('遗传算法') })
  }
  legend.forEach((item, i) => {
    const x = 36 + i * 150
    const y = 56
    cmpCtx.fillStyle = item.color
    cmpCtx.fillRect(x, y, 18, 3)
    cmpCtx.fillStyle = '#64748b'
    cmpCtx.font = '11px Inter, sans-serif'
    cmpCtx.fillText(item.label, x + 24, y + 4)
  })

  // --- 指标柱状 ---
  const barCanvas = document.createElement('canvas')
  barCanvas.width = 880
  barCanvas.height = 420
  const barCtx = barCanvas.getContext('2d')!
  barCtx.fillStyle = '#f8fafc'
  barCtx.fillRect(0, 0, barCanvas.width, barCanvas.height)
  barCtx.fillStyle = '#334155'
  barCtx.font = '600 15px Inter, sans-serif'
  barCtx.fillText('算法指标对比（距离 m）', 36, 32)

  const metrics = normalized.map((r) => ({
    label: r.algorithm,
    value: r.totalDistance || 0,
    color: getDashboardAlgoColor(r.algorithm)
  }))
  const maxVal = Math.max(...metrics.map((m) => m.value), 1)
  const barW = 56
  const gap = 48
  const baseY = 340
  metrics.forEach((m, i) => {
    const x = 80 + i * (barW + gap)
    const h = (m.value / maxVal) * 240
    barCtx.fillStyle = m.color
    barCtx.fillRect(x, baseY - h, barW, h)
    barCtx.fillStyle = '#64748b'
    barCtx.font = '10px Inter, sans-serif'
    barCtx.save()
    barCtx.translate(x + barW / 2, baseY + 14)
    barCtx.rotate(-0.4)
    barCtx.textAlign = 'right'
    barCtx.fillText(m.label, 0, 0)
    barCtx.restore()
    barCtx.fillStyle = '#334155'
    barCtx.font = '11px Inter, sans-serif'
    barCtx.textAlign = 'center'
    barCtx.fillText(String(Math.round(m.value)), x + barW / 2, baseY - h - 8)
  })

  // --- 曲率对比 ---
  const curvCanvas = document.createElement('canvas')
  curvCanvas.width = 880
  curvCanvas.height = 420
  const curvCtx = curvCanvas.getContext('2d')!
  curvCtx.fillStyle = '#f8fafc'
  curvCtx.fillRect(0, 0, curvCanvas.width, curvCanvas.height)
  curvCtx.fillStyle = '#334155'
  curvCtx.font = '600 15px Inter, sans-serif'
  curvCtx.fillText('路径转角分布（弧度）', 36, 32)

  normalized.forEach((r, idx) => {
    const angles = computeTurnAngles(r.pathPoints as GeoPt[])
    if (!angles.length) return
    const color = getDashboardAlgoColor(r.algorithm)
    curvCtx.strokeStyle = color
    curvCtx.lineWidth = 1.8
    curvCtx.beginPath()
    angles.forEach((a, i) => {
      const x = 48 + (i / Math.max(angles.length - 1, 1)) * (curvCanvas.width - 96)
      const y = 360 - (a / Math.PI) * 280
      if (i === 0) curvCtx.moveTo(x, y)
      else curvCtx.lineTo(x, y)
    })
    curvCtx.stroke()
    curvCtx.fillStyle = color
    curvCtx.font = '11px Inter, sans-serif'
    curvCtx.fillText(r.algorithm, 48, 56 + idx * 18)
  })

  return {
    pathCompare: canvasToDataUrl(cmpCanvas),
    metricsBar: canvasToDataUrl(barCanvas),
    pathCurvature: canvasToDataUrl(curvCanvas),
    hasRlPath: Boolean(rl && rl.pathPoints.length >= 2)
  }
}

export const PATH_LEVEL_PLOT_DEFS = [
  { id: 'path_compare', title: '三算法路径对比图', key: 'pathCompare' as const },
  { id: 'metrics_bar', title: 'RL / A* / GA 指标柱状对比', key: 'metricsBar' as const },
  { id: 'path_curvature', title: 'RL / A* / GA 路径曲率对比', key: 'pathCurvature' as const }
]

export const RL_CORE_PLOT_DEFS = [
  { id: 'training_progress', title: '全局训练进度', ext: 'png' as const, global: true as const }
]

/** 路径信息页请求的离线深度图（不含 path_evolution，避免 404 弹窗） */
export const OFFLINE_DEEP_PLOT_DEFS = [
  { name: 'state_value_heatmap', title: '状态价值热力图', ext: 'png' },
  { name: 'policy_quiver', title: '策略箭头图', ext: 'png' }
] as const

/**
 * 仅由 python_service/offline_train.py 在完整训练后写入 mission_<id>/path_evolution.gif；
 * 不在 Web 路径信息页展示，逻辑保留供离线产物与论文插图使用。
 */
export const OFFLINE_TRAINING_ARTIFACT_PLOTS = [
  { name: 'path_evolution', title: '路径演化（训练阶段）', ext: 'gif' as const }
] as const
