/**
 * 沿已有折线走廊（步行路网 / 河道近似 / 湖泊覆盖线）的算法辅助：
 * - 遗传：在法向走廊内进化横向偏移
 * - 分段点：供 RL 按走廊逐段推理
 */

const EARTH_M_PER_DEG_LAT = 111320

function metersPerDeg(lat) {
  return {
    mPerDegLat: EARTH_M_PER_DEG_LAT,
    mPerDegLng: EARTH_M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)
  }
}

export function pathLengthMeters(pts) {
  if (!pts || pts.length < 2) return 0
  let sum = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const midLat = (a.lat + b.lat) / 2
    const { mPerDegLat, mPerDegLng } = metersPerDeg(midLat)
    const dx = (b.lng - a.lng) * mPerDegLng
    const dy = (b.lat - a.lat) * mPerDegLat
    sum += Math.hypot(dx, dy)
  }
  return sum
}

function cumulativeLengths(pts) {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + segmentMeters(pts[i - 1], pts[i]))
  }
  return cum
}

function segmentMeters(a, b) {
  const midLat = (a.lat + b.lat) / 2
  const { mPerDegLat, mPerDegLng } = metersPerDeg(midLat)
  const dx = (b.lng - a.lng) * mPerDegLng
  const dy = (b.lat - a.lat) * mPerDegLat
  return Math.hypot(dx, dy)
}

/** 按弧长均匀重采样 */
export function resamplePolylineByCount(pts, count) {
  const n = Math.max(2, Math.floor(count))
  if (!pts || pts.length === 0) return []
  if (pts.length === 1) return Array.from({ length: n }, () => ({ ...pts[0] }))
  const cum = cumulativeLengths(pts)
  const total = cum[cum.length - 1] || 1
  const out = []
  for (let i = 0; i < n; i++) {
    const target = (total * i) / (n - 1)
    out.push(interpolateAlong(pts, cum, target))
  }
  return out
}

function interpolateAlong(pts, cum, targetM) {
  if (targetM <= 0) return { lng: pts[0].lng, lat: pts[0].lat }
  const total = cum[cum.length - 1]
  if (targetM >= total) return { lng: pts[pts.length - 1].lng, lat: pts[pts.length - 1].lat }
  let i = 1
  while (i < cum.length && cum[i] < targetM) i++
  const i0 = i - 1
  const segLen = cum[i] - cum[i0] || 1
  const t = (targetM - cum[i0]) / segLen
  return {
    lng: pts[i0].lng + (pts[i].lng - pts[i0].lng) * t,
    lat: pts[i0].lat + (pts[i].lat - pts[i0].lat) * t
  }
}

/** RL 分段：沿走廊取若干中间航点（含起终点） */
export function subsamplePolylineForSegments(pts, maxVertices = 8) {
  const k = Math.max(2, Math.min(maxVertices, 12))
  return resamplePolylineByCount(pts, k)
}

function nearestIndex(pts, p) {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].lng - p.lng
    const dy = pts[i].lat - p.lat
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** 在基础折线上截取从 a 到 b 的片段（用于 RL 段失败降级） */
export function slicePolylineBetween(basePath, a, b) {
  if (!basePath?.length) return []
  const i0 = nearestIndex(basePath, a)
  const i1 = nearestIndex(basePath, b)
  const lo = Math.min(i0, i1)
  const hi = Math.max(i0, i1)
  const slice = basePath.slice(lo, hi + 1).map((p) => ({ lng: p.lng, lat: p.lat }))
  if (i0 > i1) slice.reverse()
  return slice
}

function offsetPointPerpendicular(pt, tangentE, tangentN, offsetM, side = 'left') {
  const len = Math.hypot(tangentE, tangentN) || 1
  const te = tangentE / len
  const tn = tangentN / len
  let ne = -tn
  let nn = te
  if (side === 'right') {
    ne = tn
    nn = -te
  }
  const { mPerDegLat, mPerDegLng } = metersPerDeg(pt.lat)
  return {
    lng: pt.lng + (offsetM * ne) / mPerDegLng,
    lat: pt.lat + (offsetM * nn) / mPerDegLat
  }
}

/**
 * 将控制点法向偏移（米）沿弧长插值到完整折线
 */
function applyVariableLateralOffsets(basePath, controlOffsetsM, side = 'left') {
  if (!basePath?.length) return []
  const controls = resamplePolylineByCount(basePath, controlOffsetsM.length)
  const cum = cumulativeLengths(basePath)
  const ctrlCum = cumulativeLengths(controls)
  const total = cum[cum.length - 1] || 1

  const offsetAt = (targetM) => {
    if (ctrlCum.length <= 1) return controlOffsetsM[0] || 0
    const t = Math.max(0, Math.min(total, targetM))
    let j = 1
    while (j < ctrlCum.length && ctrlCum[j] < t) j++
    const j0 = Math.max(0, j - 1)
    const seg = ctrlCum[j] - ctrlCum[j0] || 1
    const u = (t - ctrlCum[j0]) / seg
    const o0 = controlOffsetsM[j0] ?? 0
    const o1 = controlOffsetsM[Math.min(j, controlOffsetsM.length - 1)] ?? o0
    return o0 + (o1 - o0) * u
  }

  const out = []
  const n = basePath.length
  for (let i = 0; i < n; i++) {
    const lat = basePath[i].lat
    const { mPerDegLng, mPerDegLat } = metersPerDeg(lat)
    let te = 0
    let tn = 0
    if (i === 0) {
      te = (basePath[1].lng - basePath[0].lng) * mPerDegLng
      tn = (basePath[1].lat - basePath[0].lat) * mPerDegLat
    } else if (i === n - 1) {
      te = (basePath[n - 1].lng - basePath[n - 2].lng) * mPerDegLng
      tn = (basePath[n - 1].lat - basePath[n - 2].lat) * mPerDegLat
    } else {
      te = (basePath[i + 1].lng - basePath[i - 1].lng) * mPerDegLng
      tn = (basePath[i + 1].lat - basePath[i - 1].lat) * mPerDegLat
    }
    const off = offsetAt(cum[i])
    out.push(offsetPointPerpendicular(basePath[i], te, tn, off, side))
  }
  return out
}

function random01() {
  return Math.random()
}

function tournamentPick(pop, fitness, k = 3) {
  let best = pop[randomInt(pop.length)]
  let bestF = fitness(best)
  for (let i = 1; i < k; i++) {
    const p = pop[randomInt(pop.length)]
    const f = fitness(p)
    if (f < bestF) {
      best = p
      bestF = f
    }
  }
  return best
}

function randomInt(n) {
  return Math.floor(Math.random() * n)
}

function crossoverFloat(a, b) {
  const i = randomInt(a.length)
  const c1 = a.slice(0, i).concat(b.slice(i))
  const c2 = b.slice(0, i).concat(a.slice(i))
  return [c1, c2]
}

function mutateFloat(chromo, rate, sigma = 0.08) {
  return chromo.map((v) => {
    if (Math.random() > rate) return v
    let nv = v + (Math.random() - 0.5) * 2 * sigma
    return Math.max(0, Math.min(1, nv))
  })
}

function meanDeviationFromBase(path, base) {
  if (!path?.length || !base?.length) return 0
  let sum = 0
  for (const p of path) {
    let minD = Infinity
    for (const b of base) {
      const midLat = (p.lat + b.lat) / 2
      const { mPerDegLat, mPerDegLng } = metersPerDeg(midLat)
      const dx = (p.lng - b.lng) * mPerDegLng
      const dy = (p.lat - b.lat) * mPerDegLat
      minD = Math.min(minD, Math.hypot(dx, dy))
    }
    sum += minD
  }
  return sum / path.length
}

/**
 * 沿基础折线做法向偏移的遗传优化（保持在步行/河道走廊附近）
 * @param {Array<{ lng, lat }>} basePath
 * @param {{ maxLateralM?: number, controlCount?: number, riverBankSide?: 'left'|'right' }} options
 */
export function planPathGeneticAlongPolyline(basePath, options = {}) {
  if (!basePath || basePath.length < 2) return basePath || []

  const maxLateralM = Math.max(5, Number(options.maxLateralM ?? 28))
  const controlCount = Math.min(
    16,
    Math.max(6, Number(options.controlCount ?? Math.round(basePath.length / 10)))
  )
  const side = options.riverBankSide === 'right' ? 'right' : 'left'
  const popSize = 40
  const generations = 70
  const mutRate = 0.15

  const decode = (chromo) => {
    const offsets = chromo.map((g) => (g - 0.5) * 2 * maxLateralM)
    return applyVariableLateralOffsets(basePath, offsets, side)
  }

  const fitness = (chromo) => {
    const path = decode(chromo)
    const len = pathLengthMeters(path)
    const dev = meanDeviationFromBase(path, basePath)
    return len + dev * 3.5
  }

  const chromoLen = controlCount
  const population = []
  for (let i = 0; i < popSize; i++) {
    population.push(Array.from({ length: chromoLen }, () => 0.5 + (Math.random() - 0.5) * 0.1))
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
    const nextGen = [scored[0].p.slice(), scored[1].p.slice()]
    while (nextGen.length < popSize) {
      const pa = tournamentPick(population, fitness)
      const pb = tournamentPick(population, fitness)
      let [c1, c2] = crossoverFloat(pa, pb)
      c1 = mutateFloat(c1, mutRate)
      c2 = mutateFloat(c2, mutRate)
      nextGen.push(c1)
      if (nextGen.length < popSize) nextGen.push(c2)
    }
    population.length = 0
    population.push(...nextGen)
  }

  return decode(bestEver)
}
