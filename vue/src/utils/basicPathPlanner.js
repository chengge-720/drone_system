/**
 * 前端基本路径规划：二维平面规则网格 + 迪杰斯特拉（无障碍权重视为等权，用于后端不可用时的演示）
 */
import { getDistanceFromLatLonInMeters } from './pathCalculator'

function segmentLength3D(a, b) {
  const h = getDistanceFromLatLonInMeters(a.lat, a.lng, b.lat, b.lng)
  const va = a.alt ?? 0
  const vb = b.alt ?? 0
  const v = vb - va
  return Math.sqrt(h * h + v * v)
}

// 射线法：判断点是否在多边形内（lng/lat 平面近似）
function pointInPolygon(lng, lat, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i][0])
    const yi = Number(polygon[i][1])
    const xj = Number(polygon[j][0])
    const yj = Number(polygon[j][1])
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function isBlockedByPolygons(p, polygons) {
  if (!polygons || !polygons.length) return false
  for (const poly of polygons) {
    if (pointInPolygon(p.lng, p.lat, poly)) return true
  }
  return false
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  // 快速排斥
  const minAx = Math.min(ax, bx), maxAx = Math.max(ax, bx)
  const minAy = Math.min(ay, by), maxAy = Math.max(ay, by)
  const minCx = Math.min(cx, dx), maxCx = Math.max(cx, dx)
  const minCy = Math.min(cy, dy), maxCy = Math.max(cy, dy)
  if (maxAx < minCx || maxCx < minAx || maxAy < minCy || maxCy < minAy) return false

  const cross = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px)
  const d1 = cross(ax, ay, bx, by, cx, cy)
  const d2 = cross(ax, ay, bx, by, dx, dy)
  const d3 = cross(cx, cy, dx, dy, ax, ay)
  const d4 = cross(cx, cy, dx, dy, bx, by)

  const onSeg = (px, py, qx, qy, rx, ry) =>
    Math.min(px, qx) <= rx + 1e-12 &&
    rx <= Math.max(px, qx) + 1e-12 &&
    Math.min(py, qy) <= ry + 1e-12 &&
    ry <= Math.max(py, qy) + 1e-12

  // 一般相交
  if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) {
    if ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)) return true
  }

  // 共线/端点相交
  if (Math.abs(d1) < 1e-12 && onSeg(ax, ay, bx, by, cx, cy)) return true
  if (Math.abs(d2) < 1e-12 && onSeg(ax, ay, bx, by, dx, dy)) return true
  if (Math.abs(d3) < 1e-12 && onSeg(cx, cy, dx, dy, ax, ay)) return true
  if (Math.abs(d4) < 1e-12 && onSeg(cx, cy, dx, dy, bx, by)) return true
  return false
}

function segmentIntersectsPolygon(a, b, polygon) {
  if (!polygon || polygon.length < 3) return false
  // 任一点在内也视为相交（更保守，保证绕开）
  if (pointInPolygon(a.lng, a.lat, polygon) || pointInPolygon(b.lng, b.lat, polygon)) return true
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const c = { lng: Number(polygon[j][0]), lat: Number(polygon[j][1]) }
    const d = { lng: Number(polygon[i][0]), lat: Number(polygon[i][1]) }
    if (
      segmentsIntersect(
        a.lng,
        a.lat,
        b.lng,
        b.lat,
        c.lng,
        c.lat,
        d.lng,
        d.lat
      )
    ) {
      return true
    }
  }
  return false
}

function segmentBlockedByPolygons(a, b, polygons) {
  if (!polygons || !polygons.length) return false
  for (const poly of polygons) {
    if (segmentIntersectsPolygon(a, b, poly)) return true
  }
  return false
}

/**
 * @param {{ lng: number, lat: number }} start
 * @param {{ lng: number, lat: number }} end
 * @param {{ cols?: number, rows?: number, paddingDeg?: number }} options
 * @returns {Array<{ lng: number, lat: number }>}
 */
export function planPathDijkstraGrid(start, end, options = {}) {
  const cols = options.cols ?? 16
  const rows = options.rows ?? 16
  const pad = options.paddingDeg ?? 0.018

  const minLng = Math.min(start.lng, end.lng) - pad
  const maxLng = Math.max(start.lng, end.lng) + pad
  const minLat = Math.min(start.lat, end.lat) - pad
  const maxLat = Math.max(start.lat, end.lat) + pad

  const dLng = cols <= 1 ? 0 : (maxLng - minLng) / (cols - 1)
  const dLat = rows <= 1 ? 0 : (maxLat - minLat) / (rows - 1)

  const idx = (c, r) => r * cols + c
  const lngLat = (i) => {
    const r = Math.floor(i / cols)
    const c = i % cols
    return { lng: minLng + c * dLng, lat: minLat + r * dLat }
  }

  const snap = (lng, lat) => {
    const c = Math.round((lng - minLng) / (dLng || 1))
    const r = Math.round((lat - minLat) / (dLat || 1))
    const cc = Math.max(0, Math.min(cols - 1, c))
    const rr = Math.max(0, Math.min(rows - 1, r))
    return idx(cc, rr)
  }

  const n = cols * rows
  const startId = snap(start.lng, start.lat)
  const endId = snap(end.lng, end.lat)

  const dist = new Array(n).fill(Infinity)
  const prev = new Array(n).fill(-1)
  dist[startId] = 0

  const visited = new Array(n).fill(false)

  for (let k = 0; k < n; k++) {
    let u = -1
    let best = Infinity
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[i] < best) {
        best = dist[i]
        u = i
      }
    }
    if (u < 0 || best === Infinity) break
    visited[u] = true
    if (u === endId) break

    const c = u % cols
    const r = Math.floor(u / cols)
    const neighbors = []
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue
        const nc = c + dc
        const nr = r + dr
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
        neighbors.push(idx(nc, nr))
      }
    }

    const pu = lngLat(u)
    for (const v of neighbors) {
      const pv = lngLat(v)
      const w = getDistanceFromLatLonInMeters(pu.lat, pu.lng, pv.lat, pv.lng)
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w
        prev[v] = u
      }
    }
  }

  if (!Number.isFinite(dist[endId])) {
    return [
      { lng: start.lng, lat: start.lat },
      { lng: end.lng, lat: end.lat }
    ]
  }

  const chain = []
  let at = endId
  for (let guard = 0; guard < n + 5 && at !== -1; guard++) {
    chain.push(lngLat(at))
    if (at === startId) break
    at = prev[at]
  }
  chain.reverse()
  if (chain.length === 0) {
    return [
      { lng: start.lng, lat: start.lat },
      { lng: end.lng, lat: end.lat }
    ]
  }
  chain[0] = { lng: start.lng, lat: start.lat }
  chain[chain.length - 1] = { lng: end.lng, lat: end.lat }
  return chain
}

/**
 * 网格 Dijkstra（避开禁飞多边形）
 * @param {{ lng: number, lat: number }} start
 * @param {{ lng: number, lat: number }} end
 * @param {Array<Array<[number, number]>>} blockedPolygons 多边形数组（[lng,lat][]）
 * @param {{ cols?: number, rows?: number, paddingDeg?: number }} options
 * @returns {Array<{ lng: number, lat: number }>}
 */
export function planPathDijkstraGridAvoidPolygons(start, end, blockedPolygons = [], options = {}) {
  // 分辨率更高，避免“网格点在外但线段穿越”的漏判
  const cols = options.cols ?? 45
  const rows = options.rows ?? 45
  const pad = options.paddingDeg ?? 0.03

  const minLng = Math.min(start.lng, end.lng) - pad
  const maxLng = Math.max(start.lng, end.lng) + pad
  const minLat = Math.min(start.lat, end.lat) - pad
  const maxLat = Math.max(start.lat, end.lat) + pad

  const dLng = cols <= 1 ? 0 : (maxLng - minLng) / (cols - 1)
  const dLat = rows <= 1 ? 0 : (maxLat - minLat) / (rows - 1)

  const idx = (c, r) => r * cols + c
  const lngLat = (i) => {
    const r = Math.floor(i / cols)
    const c = i % cols
    return { lng: minLng + c * dLng, lat: minLat + r * dLat }
  }

  const snap = (lng, lat) => {
    const c = Math.round((lng - minLng) / (dLng || 1))
    const r = Math.round((lat - minLat) / (dLat || 1))
    const cc = Math.max(0, Math.min(cols - 1, c))
    const rr = Math.max(0, Math.min(rows - 1, r))
    return idx(cc, rr)
  }

  const n = cols * rows
  const startId = snap(start.lng, start.lat)
  const endId = snap(end.lng, end.lat)

  // 预计算 blocked
  const blocked = new Array(n).fill(false)
  if (blockedPolygons && blockedPolygons.length) {
    for (let i = 0; i < n; i++) {
      const p = lngLat(i)
      blocked[i] = isBlockedByPolygons(p, blockedPolygons)
    }
    // 起终点永远可用
    blocked[startId] = false
    blocked[endId] = false
  }

  const dist = new Array(n).fill(Infinity)
  const prev = new Array(n).fill(-1)
  dist[startId] = 0
  const visited = new Array(n).fill(false)

  for (let k = 0; k < n; k++) {
    let u = -1
    let best = Infinity
    for (let i = 0; i < n; i++) {
      if (!visited[i] && !blocked[i] && dist[i] < best) {
        best = dist[i]
        u = i
      }
    }
    if (u < 0 || best === Infinity) break
    visited[u] = true
    if (u === endId) break

    const c = u % cols
    const r = Math.floor(u / cols)
    const neighbors = []
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue
        const nc = c + dc
        const nr = r + dr
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
        const v = idx(nc, nr)
        if (blocked[v]) continue
        neighbors.push(v)
      }
    }

    const pu = lngLat(u)
    for (const v of neighbors) {
      const pv = lngLat(v)
      // 关键：禁止任何穿越禁飞多边形的边
      if (segmentBlockedByPolygons(pu, pv, blockedPolygons)) continue
      const w = getDistanceFromLatLonInMeters(pu.lat, pu.lng, pv.lat, pv.lng)
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w
        prev[v] = u
      }
    }
  }

  if (!Number.isFinite(dist[endId])) {
    // 兜底：直线
    return [
      { lng: start.lng, lat: start.lat },
      { lng: end.lng, lat: end.lat }
    ]
  }

  const chain = []
  let at = endId
  for (let guard = 0; guard < n + 5 && at !== -1; guard++) {
    chain.push(lngLat(at))
    if (at === startId) break
    at = prev[at]
  }
  chain.reverse()
  if (chain.length === 0) {
    return [
      { lng: start.lng, lat: start.lat },
      { lng: end.lng, lat: end.lat }
    ]
  }
  chain[0] = { lng: start.lng, lat: start.lat }
  chain[chain.length - 1] = { lng: end.lng, lat: end.lat }
  return chain
}

/**
 * 前端基本路径规划：二维平面规则网格 + A*
 * @param {{ lng: number, lat: number }} start
 * @param {{ lng: number, lat: number }} end
 * @param {{ cols?: number, rows?: number, paddingDeg?: number }} options
 * @returns {Array<{ lng: number, lat: number }>}
 */
export function planPathAStarGrid(start, end, options = {}) {
  const cols = options.cols ?? 16
  const rows = options.rows ?? 16
  const pad = options.paddingDeg ?? 0.018

  const minLng = Math.min(start.lng, end.lng) - pad
  const maxLng = Math.max(start.lng, end.lng) + pad
  const minLat = Math.min(start.lat, end.lat) - pad
  const maxLat = Math.max(start.lat, end.lat) + pad

  const dLng = cols <= 1 ? 0 : (maxLng - minLng) / (cols - 1)
  const dLat = rows <= 1 ? 0 : (maxLat - minLat) / (rows - 1)

  const idx = (c, r) => r * cols + c
  const lngLat = (i) => {
    const r = Math.floor(i / cols)
    const c = i % cols
    return { lng: minLng + c * dLng, lat: minLat + r * dLat }
  }

  const snap = (lng, lat) => {
    const c = Math.round((lng - minLng) / (dLng || 1))
    const r = Math.round((lat - minLat) / (dLat || 1))
    const cc = Math.max(0, Math.min(cols - 1, c))
    const rr = Math.max(0, Math.min(rows - 1, r))
    return idx(cc, rr)
  }

  const startId = snap(start.lng, start.lat)
  const endId = snap(end.lng, end.lat)
  const n = cols * rows

  const gScore = new Array(n).fill(Infinity)
  const fScore = new Array(n).fill(Infinity)
  const prev = new Array(n).fill(-1)
  const open = new Set([startId])
  const closed = new Set()

  const heuristic = (a, b) => {
    const pa = lngLat(a)
    const pb = lngLat(b)
    return getDistanceFromLatLonInMeters(pa.lat, pa.lng, pb.lat, pb.lng)
  }

  gScore[startId] = 0
  fScore[startId] = heuristic(startId, endId)

  while (open.size > 0) {
    let current = -1
    let currentF = Infinity
    for (const id of open) {
      if (fScore[id] < currentF) {
        currentF = fScore[id]
        current = id
      }
    }

    if (current < 0) break
    if (current === endId) break

    open.delete(current)
    closed.add(current)

    const c = current % cols
    const r = Math.floor(current / cols)

    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue
        const nc = c + dc
        const nr = r + dr
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue

        const neighbor = idx(nc, nr)
        if (closed.has(neighbor)) continue

        const pCur = lngLat(current)
        const pNext = lngLat(neighbor)
        const stepCost = getDistanceFromLatLonInMeters(pCur.lat, pCur.lng, pNext.lat, pNext.lng)
        const tentativeG = gScore[current] + stepCost

        if (!open.has(neighbor)) open.add(neighbor)
        if (tentativeG >= gScore[neighbor]) continue

        prev[neighbor] = current
        gScore[neighbor] = tentativeG
        fScore[neighbor] = tentativeG + heuristic(neighbor, endId)
      }
    }
  }

  if (!Number.isFinite(gScore[endId])) {
    return [
      { lng: start.lng, lat: start.lat },
      { lng: end.lng, lat: end.lat }
    ]
  }

  const chain = []
  let at = endId
  for (let guard = 0; guard < n + 5 && at !== -1; guard++) {
    chain.push(lngLat(at))
    if (at === startId) break
    at = prev[at]
  }
  chain.reverse()
  if (chain.length === 0) {
    return [
      { lng: start.lng, lat: start.lat },
      { lng: end.lng, lat: end.lat }
    ]
  }
  chain[0] = { lng: start.lng, lat: start.lat }
  chain[chain.length - 1] = { lng: end.lng, lat: end.lat }
  return chain
}

/**
 * 网格 A*（避开禁飞多边形），边穿越多边形视为阻塞
 * @param {{ lng: number, lat: number }} start
 * @param {{ lng: number, lat: number }} end
 * @param {Array<Array<[number, number]>>} blockedPolygons
 * @param {{ cols?: number, rows?: number, paddingDeg?: number }} options
 * @returns {Array<{ lng: number, lat: number }>}
 */
export function planPathAStarGridAvoidPolygons(start, end, blockedPolygons = [], options = {}) {
  const cols = options.cols ?? 45
  const rows = options.rows ?? 45
  const pad = options.paddingDeg ?? 0.03

  const minLng = Math.min(start.lng, end.lng) - pad
  const maxLng = Math.max(start.lng, end.lng) + pad
  const minLat = Math.min(start.lat, end.lat) - pad
  const maxLat = Math.max(start.lat, end.lat) + pad

  const dLng = cols <= 1 ? 0 : (maxLng - minLng) / (cols - 1)
  const dLat = rows <= 1 ? 0 : (maxLat - minLat) / (rows - 1)

  const idx = (c, r) => r * cols + c
  const lngLat = (i) => {
    const r = Math.floor(i / cols)
    const c = i % cols
    return { lng: minLng + c * dLng, lat: minLat + r * dLat }
  }

  const snap = (lng, lat) => {
    const c = Math.round((lng - minLng) / (dLng || 1))
    const r = Math.round((lat - minLat) / (dLat || 1))
    const cc = Math.max(0, Math.min(cols - 1, c))
    const rr = Math.max(0, Math.min(rows - 1, r))
    return idx(cc, rr)
  }

  const n = cols * rows
  const startId = snap(start.lng, start.lat)
  const endId = snap(end.lng, end.lat)

  const blocked = new Array(n).fill(false)
  if (blockedPolygons && blockedPolygons.length) {
    for (let i = 0; i < n; i++) {
      const p = lngLat(i)
      blocked[i] = isBlockedByPolygons(p, blockedPolygons)
    }
    blocked[startId] = false
    blocked[endId] = false
  }

  const gScore = new Array(n).fill(Infinity)
  const fScore = new Array(n).fill(Infinity)
  const prev = new Array(n).fill(-1)
  const open = new Set([startId])
  const closed = new Set()

  const heuristic = (a, b) => {
    const pa = lngLat(a)
    const pb = lngLat(b)
    return getDistanceFromLatLonInMeters(pa.lat, pa.lng, pb.lat, pb.lng)
  }

  gScore[startId] = 0
  fScore[startId] = heuristic(startId, endId)

  while (open.size > 0) {
    let current = -1
    let bestF = Infinity
    for (const id of open) {
      if (fScore[id] < bestF) {
        bestF = fScore[id]
        current = id
      }
    }
    if (current < 0) break
    if (current === endId) break

    open.delete(current)
    closed.add(current)

    const c = current % cols
    const r = Math.floor(current / cols)

    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue
        const nc = c + dc
        const nr = r + dr
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue

        const neighbor = idx(nc, nr)
        if (closed.has(neighbor)) continue
        if (blocked[neighbor]) continue

        const pCur = lngLat(current)
        const pNext = lngLat(neighbor)
        if (blockedPolygons && blockedPolygons.length && segmentBlockedByPolygons(pCur, pNext, blockedPolygons)) {
          continue
        }

        const stepCost = getDistanceFromLatLonInMeters(pCur.lat, pCur.lng, pNext.lat, pNext.lng)
        const tentativeG = gScore[current] + stepCost

        if (!open.has(neighbor)) open.add(neighbor)
        if (tentativeG >= gScore[neighbor]) continue

        prev[neighbor] = current
        gScore[neighbor] = tentativeG
        fScore[neighbor] = tentativeG + heuristic(neighbor, endId)
      }
    }
  }

  if (!Number.isFinite(gScore[endId])) {
    return [
      { lng: start.lng, lat: start.lat },
      { lng: end.lng, lat: end.lat }
    ]
  }

  const chain = []
  let at = endId
  for (let guard = 0; guard < n + 5 && at !== -1; guard++) {
    chain.push(lngLat(at))
    if (at === startId) break
    at = prev[at]
  }
  chain.reverse()
  if (chain.length === 0) {
    return [
      { lng: start.lng, lat: start.lat },
      { lng: end.lng, lat: end.lat }
    ]
  }
  chain[0] = { lng: start.lng, lat: start.lat }
  chain[chain.length - 1] = { lng: end.lng, lat: end.lat }
  return chain
}

/** 8 邻域方向（与 A* 邻居展开顺序一致） */
const GA_DIRS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
]

function decodeGeneticChromosome(chromo, cols, rows, startId, endId, idx, lngLat, blocked, blockedPolygons) {
  let pos = startId
  const cells = [pos]
  let distM = 0
  const ec = endId % cols

  for (let i = 0; i < chromo.length; i++) {
    if (pos === endId) break
    const d = chromo[i] % 8
    const [dc, dr] = GA_DIRS[d]
    const c = pos % cols
    const r = Math.floor(pos / cols)
    const nc = c + dc
    const nr = r + dr
    if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
    const next = idx(nc, nr)
    if (blocked && blocked[next]) continue
    const pu = lngLat(pos)
    const pv = lngLat(next)
    if (blockedPolygons && blockedPolygons.length && segmentBlockedByPolygons(pu, pv, blockedPolygons)) continue
    distM += getDistanceFromLatLonInMeters(pu.lat, pu.lng, pv.lat, pv.lng)
    pos = next
    if (cells[cells.length - 1] !== pos) cells.push(pos)
  }

  const reached = pos === endId
  const pl = lngLat(pos)
  const pe = lngLat(endId)
  const missM = getDistanceFromLatLonInMeters(pl.lat, pl.lng, pe.lat, pe.lng)
  const gc = pos % cols
  const gr = Math.floor(pos / cols)
  const er = Math.floor(endId / cols)
  const gridMiss = Math.abs(gc - ec) + Math.abs(gr - er)
  return { cells, distM, reached, missM, gridMiss }
}

function randomInt(n) {
  return Math.floor(Math.random() * n)
}

function tournamentPick(pop, fitness, k) {
  let best = pop[randomInt(pop.length)]
  let bestF = fitness(best)
  for (let i = 1; i < k; i++) {
    const c = pop[randomInt(pop.length)]
    const fc = fitness(c)
    if (fc < bestF) {
      best = c
      bestF = fc
    }
  }
  return best
}

function crossoverSinglePoint(a, b) {
  if (a.length < 2) return [a.slice(), b.slice()]
  const pt = 1 + randomInt(a.length - 1)
  const c1 = a.slice(0, pt).concat(b.slice(pt))
  const c2 = b.slice(0, pt).concat(a.slice(pt))
  return [c1, c2]
}

function mutateChromo(chromo, rate) {
  const out = chromo.slice()
  for (let i = 0; i < out.length; i++) {
    if (Math.random() < rate) out[i] = randomInt(8)
  }
  return out
}

function buildGeneticGridContext(start, end, blockedPolygons, options) {
  const cols = options.cols ?? 16
  const rows = options.rows ?? 16
  const pad = options.paddingDeg ?? 0.018

  const minLng = Math.min(start.lng, end.lng) - pad
  const maxLng = Math.max(start.lng, end.lng) + pad
  const minLat = Math.min(start.lat, end.lat) - pad
  const maxLat = Math.max(start.lat, end.lat) + pad

  const dLng = cols <= 1 ? 0 : (maxLng - minLng) / (cols - 1)
  const dLat = rows <= 1 ? 0 : (maxLat - minLat) / (rows - 1)

  const idx = (c, r) => r * cols + c
  const lngLat = (i) => {
    const rr = Math.floor(i / cols)
    const cc = i % cols
    return { lng: minLng + cc * dLng, lat: minLat + rr * dLat }
  }

  const snap = (lng, lat) => {
    const c = Math.round((lng - minLng) / (dLng || 1))
    const r = Math.round((lat - minLat) / (dLat || 1))
    const cc = Math.max(0, Math.min(cols - 1, c))
    const rr = Math.max(0, Math.min(rows - 1, r))
    return idx(cc, rr)
  }

  const n = cols * rows
  const startId = snap(start.lng, start.lat)
  const endId = snap(end.lng, end.lat)

  const blocked = new Array(n).fill(false)
  const polys = blockedPolygons && blockedPolygons.length ? blockedPolygons : null
  if (polys) {
    for (let i = 0; i < n; i++) {
      const p = lngLat(i)
      blocked[i] = isBlockedByPolygons(p, polys)
    }
    blocked[startId] = false
    blocked[endId] = false
  }

  const chromoLen = Math.min(160, Math.max(24, 4 * (cols + rows)))

  return { cols, rows, startId, endId, idx, lngLat, blocked: polys ? blocked : null, blockedPolygons: polys, chromoLen }
}

function runGeneticPathfinder(ctx) {
  const { cols, rows, startId, endId, idx, lngLat, blocked, blockedPolygons, chromoLen } = ctx

  const fitness = (chromo) => {
    const { distM, reached, missM, gridMiss } = decodeGeneticChromosome(
      chromo,
      cols,
      rows,
      startId,
      endId,
      idx,
      lngLat,
      blocked,
      blockedPolygons
    )
    if (reached) return distM
    return distM + missM * 60 + gridMiss * 120
  }

  const popSize = cols * rows > 400 ? 48 : 64
  const generations = cols * rows > 400 ? 100 : 140
  const mutRate = 0.12

  const population = []
  for (let i = 0; i < popSize; i++) {
    population.push(Array.from({ length: chromoLen }, () => randomInt(8)))
  }

  const goalLng = lngLat(endId).lng
  const goalLat = lngLat(endId).lat

  const makeGreedyBiasedChromosome = () => {
    const chrom = []
    let pos = startId
    for (let g = 0; g < chromoLen; g++) {
      if (pos === endId) {
        chrom.push(randomInt(8))
        continue
      }
      const c = pos % cols
      const r = Math.floor(pos / cols)
      const candidates = []
      let bestScore = -Infinity
      for (let d = 0; d < 8; d++) {
        const [dc, dr] = GA_DIRS[d]
        const nc = c + dc
        const nr = r + dr
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
        const next = idx(nc, nr)
        if (blocked && blocked[next]) continue
        const pu = lngLat(pos)
        const pv = lngLat(next)
        if (blockedPolygons && blockedPolygons.length && segmentBlockedByPolygons(pu, pv, blockedPolygons)) continue
        const vx = pv.lng - pu.lng
        const vy = pv.lat - pu.lat
        const tx = goalLng - pu.lng
        const ty = goalLat - pu.lat
        const score = vx * tx + vy * ty
        if (score > bestScore + 1e-9) {
          bestScore = score
          candidates.length = 0
          candidates.push(d)
        } else if (Math.abs(score - bestScore) <= 1e-9) {
          candidates.push(d)
        }
      }
      const dPick = candidates.length ? candidates[randomInt(candidates.length)] : randomInt(8)
      chrom.push(dPick)
      const [dc, dr] = GA_DIRS[dPick]
      const nc = c + dc
      const nr = r + dr
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
        const next = idx(nc, nr)
        const pu = lngLat(pos)
        const pv = lngLat(next)
        if (
          !(blocked && blocked[next]) &&
          !(blockedPolygons && blockedPolygons.length && segmentBlockedByPolygons(pu, pv, blockedPolygons))
        ) {
          pos = next
        }
      }
    }
    return chrom
  }

  for (let i = 0; i < Math.floor(popSize / 2); i++) {
    population[i] = makeGreedyBiasedChromosome()
  }

  let bestEver = population[0].slice()
  let bestFit = fitness(bestEver)

  for (let gen = 0; gen < generations; gen++) {
    const scored = population.map((p) => ({ p, f: fitness(p) }))
    scored.sort((a, b) => a.f - b.f)
    if (scored[0].f < bestFit) {
      bestFit = scored[0].f
      bestEver = scored[0].p.slice()
    }

    const nextGen = []
    const eliteN = 2
    for (let e = 0; e < eliteN; e++) nextGen.push(scored[e].p.slice())

    while (nextGen.length < popSize) {
      const pa = tournamentPick(population, fitness, 3)
      const pb = tournamentPick(population, fitness, 3)
      let [c1, c2] = crossoverSinglePoint(pa, pb)
      c1 = mutateChromo(c1, mutRate)
      c2 = mutateChromo(c2, mutRate)
      nextGen.push(c1)
      if (nextGen.length < popSize) nextGen.push(c2)
    }
    population.length = 0
    population.push(...nextGen)
  }

  const decoded = decodeGeneticChromosome(bestEver, cols, rows, startId, endId, idx, lngLat, blocked, blockedPolygons)
  return { cells: decoded.cells, reached: decoded.reached, fitness: bestFit }
}

function cellsToGeoPath(cells, lngLat, start, end) {
  if (!cells || cells.length === 0) {
    return [
      { lng: start.lng, lat: start.lat },
      { lng: end.lng, lat: end.lat }
    ]
  }
  const chain = cells.map((id) => lngLat(id))
  chain[0] = { lng: start.lng, lat: start.lat }
  chain[chain.length - 1] = { lng: end.lng, lat: end.lat }
  return chain
}

/**
 * 规则网格上的遗传算法路径：染色体为固定长度 8 向基因序列，适应度为路径长度（未到达终点加大罚项）
 * @param {{ lng: number, lat: number }} start
 * @param {{ lng: number, lat: number }} end
 * @param {{ cols?: number, rows?: number, paddingDeg?: number }} options
 * @returns {Array<{ lng: number, lat: number }>}
 */
export function planPathGeneticGrid(start, end, options = {}) {
  const ctx = buildGeneticGridContext(start, end, [], options)
  const { reached, cells } = runGeneticPathfinder(ctx)
  if (!reached) {
    return planPathAStarGrid(start, end, options)
  }
  return cellsToGeoPath(cells, ctx.lngLat, start, end)
}

/**
 * 遗传算法 + 禁飞多边形（与网格 Dijkstra 避障规则一致）
 */
export function planPathGeneticGridAvoidPolygons(start, end, blockedPolygons = [], options = {}) {
  const ctx = buildGeneticGridContext(start, end, blockedPolygons, {
    cols: options.cols ?? 40,
    rows: options.rows ?? 40,
    paddingDeg: options.paddingDeg ?? 0.03
  })
  const { reached, cells } = runGeneticPathfinder(ctx)
  if (!reached) {
    return planPathAStarGridAvoidPolygons(start, end, blockedPolygons, {
      cols: ctx.cols,
      rows: ctx.rows,
      paddingDeg: options.paddingDeg ?? 0.03
    })
  }
  return cellsToGeoPath(cells, ctx.lngLat, start, end)
}

/**
 * 路径弧长（水平 + 高度差）
 * @param {Array<{ lng: number, lat: number, alt?: number }>} pathPoints
 */
export function pathLengthMeters3D(pathPoints) {
  if (!pathPoints || pathPoints.length < 2) return 0
  let sum = 0
  for (let i = 1; i < pathPoints.length; i++) {
    sum += segmentLength3D(pathPoints[i - 1], pathPoints[i])
  }
  return sum
}

/**
 * 沿路径按距离插值（米）
 * @param {Array<{ lng: number, lat: number, alt: number }>} pathPoints
 * @param {number} s distance from start
 */
export function interpolateAlongPath(pathPoints, s) {
  if (!pathPoints || pathPoints.length === 0) return null
  if (pathPoints.length === 1) {
    const p = pathPoints[0]
    return { lng: p.lng, lat: p.lat, alt: p.alt ?? 0 }
  }
  let acc = 0
  for (let i = 1; i < pathPoints.length; i++) {
    const a = pathPoints[i - 1]
    const b = pathPoints[i]
    const seg = segmentLength3D(
      { ...a, alt: a.alt ?? 0 },
      { ...b, alt: b.alt ?? 0 }
    )
    if (acc + seg >= s || i === pathPoints.length - 1) {
      const t = seg < 1e-6 ? 0 : Math.min(1, Math.max(0, (s - acc) / seg))
      return {
        lng: a.lng + t * (b.lng - a.lng),
        lat: a.lat + t * (b.lat - a.lat),
        alt: (a.alt ?? 0) + t * ((b.alt ?? 0) - (a.alt ?? 0))
      }
    }
    acc += seg
  }
  const last = pathPoints[pathPoints.length - 1]
  return { lng: last.lng, lat: last.lat, alt: last.alt ?? 0 }
}
