/**
 * 将 Python/ Java RL 环境返回的障碍物（网格坐标）按与 PathPlanningServiceImpl 相同比例尺还原为经纬高，
 * 在 Three 叠层中绘制线框楼体，与航线、无人机同一套 pointToOverlayPixel 投影。
 */

import { lngLatAltToOverlayWorld } from './uav3DModel'

const EARTH_R = 6378137

/** 与 Java PathPlanningServiceImpl 一致 */
const GRID_N = 50
const MARGIN = 5
const SPAN = GRID_N - MARGIN * 2

const BOX_EDGE_INDEX = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7]
]

function num(v, d) {
  const x = Number(v)
  return Number.isFinite(x) ? x : d
}

function nums(arr, fallback) {
  if (!Array.isArray(arr)) return [...fallback]
  return arr.map((x, i) => num(x, fallback[Math.min(i, fallback.length - 1)]))
}

/**
 * @param {Array<{ lat: number, lng: number, alt?: number }>} pathPoints
 */
export function computeRlGridToGeoParams(pathPoints) {
  if (!pathPoints || pathPoints.length < 2) return null
  const s = pathPoints[0]
  const e = pathPoints[pathPoints.length - 1]
  const startLat = Number(s.lat)
  const startLon = Number(s.lng)
  const goalLat = Number(e.lat)
  const goalLon = Number(e.lng)
  if (![startLat, startLon, goalLat, goalLon].every(Number.isFinite)) return null

  const startAlt = Number(s.alt) || 0
  const goalAlt = Number(e.alt != null ? e.alt : startAlt)

  const lat0Rad = (startLat * Math.PI) / 180
  const dLatRad = ((goalLat - startLat) * Math.PI) / 180
  const dLonRad = ((goalLon - startLon) * Math.PI) / 180
  const dxM = dLonRad * Math.cos(lat0Rad) * EARTH_R
  const dyM = dLatRad * EARTH_R
  const dzM = goalAlt - startAlt

  const maxPlanM = Math.max(Math.abs(dxM), Math.abs(dyM), 1)
  const xyScaleMPerGrid = maxPlanM / SPAN

  const maxAltM = Math.max(Math.abs(startAlt), Math.abs(goalAlt), 1)
  let zScaleMPerGrid = Math.max(Math.abs(dzM), maxAltM * 0.2) / SPAN
  if (zScaleMPerGrid < 1) zScaleMPerGrid = 1

  return {
    startLat,
    startLon,
    lat0Rad,
    margin: MARGIN,
    gridN: GRID_N,
    xyScaleMPerGrid,
    zScaleMPerGrid
  }
}

/** 与 Java 路径点反变换一致：alt = z * zScaleMPerGrid */
export function gridToLngLatAlt(x, y, z, p) {
  if (!p) return null
  const dxM = (x - p.margin) * p.xyScaleMPerGrid
  const dyM = (y - p.margin) * p.xyScaleMPerGrid
  const alt = z * p.zScaleMPerGrid
  const lat = startLatFromDy(p.startLat, dyM)
  const lng = startLonFromDx(p.startLon, p.lat0Rad, dxM)
  return { lat, lng, alt }
}

function startLatFromDy(startLat, dyM) {
  return startLat + (dyM / EARTH_R) * (180 / Math.PI)
}

function startLonFromDx(startLon, lat0Rad, dxM) {
  return startLon + (dxM / (EARTH_R * Math.cos(lat0Rad))) * (180 / Math.PI)
}

function obstacleToGridAabb(obs) {
  const t = String(obs.type || 'cube').toLowerCase()
  const pos = nums(obs.position, [0, 0, 0])

  if (t === 'cube') {
    const sz = nums(obs.size, [6, 6, 20])
    const hx = sz[0] / 2
    const hy = sz[1] / 2
    const hz = sz[2] / 2
    return {
      min: [pos[0] - hx, pos[1] - hy, pos[2] - hz],
      max: [pos[0] + hx, pos[1] + hy, pos[2] + hz]
    }
  }

  if (t === 'sphere') {
    const r = num(obs.radius, 3)
    return {
      min: [pos[0] - r, pos[1] - r, pos[2] - r],
      max: [pos[0] + r, pos[1] + r, pos[2] + r]
    }
  }

  if (t === 'cylinder' || t === 'cone') {
    const br = num(obs.base_radius, 4)
    const h = num(obs.height, 24)
    const bz = num(obs.base_z, 0)
    const cx = pos[0]
    const cy = pos[1]
    return {
      min: [cx - br, cy - br, bz],
      max: [cx + br, cy + br, bz + h]
    }
  }

  return null
}

function gridAabbToEightCorners(minG, maxG) {
  const [xmin, ymin, zmin] = minG
  const [xmax, ymax, zmax] = maxG
  return [
    [xmin, ymin, zmin],
    [xmax, ymin, zmin],
    [xmax, ymax, zmin],
    [xmin, ymax, zmin],
    [xmin, ymin, zmax],
    [xmax, ymin, zmax],
    [xmax, ymax, zmax],
    [xmin, ymax, zmax]
  ]
}

function getTHREE() {
  return typeof window !== 'undefined' ? window.THREE : null
}

/**
 * @param {object[]} obstacles API 返回的障碍物列表
 * @param {Array<{lat,lng,alt?}>} pathPoints
 * @param {object} map AMap.Map
 * @param {HTMLElement} container 与航线相同的投影参考（左侧地图容器）
 * @returns {THREE.Group|null}
 */
export function buildObstacleOverlayGroup(obstacles, pathPoints, map, container) {
  const THREE = getTHREE()
  if (!THREE || !obstacles?.length || !map || !container) return null

  const params = computeRlGridToGeoParams(pathPoints)
  if (!params) return null

  const group = new THREE.Group()
  group.name = 'ObstacleOverlay'

  let count = 0
  const maxBoxes = 48

  for (const raw of obstacles) {
    if (count >= maxBoxes) break
    const aabb = obstacleToGridAabb(raw)
    if (!aabb) continue

    const cornersG = gridAabbToEightCorners(aabb.min, aabb.max)
    const cornerLngLats = cornersG.map(([x, y, z]) => gridToLngLatAlt(x, y, z, params)).filter(Boolean)
    if (cornerLngLats.length !== 8) continue

    const positions = new Float32Array(BOX_EDGE_INDEX.length * 2 * 3)
    let o = 0
    for (const [a, b] of BOX_EDGE_INDEX) {
      for (const idx of [a, b]) {
        const ll = cornerLngLats[idx]
        const v = lngLatAltToOverlayWorld(container, map, ll.lng, ll.lat, ll.alt)
        positions[o++] = v.x
        positions[o++] = v.y
        positions[o++] = v.z
      }
    }

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.LineBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.92,
      depthTest: true
    })
    const lines = new THREE.LineSegments(geom, mat)
    lines.frustumCulled = false
    lines.userData.cornerLngLats = cornerLngLats
    lines.userData.edgePairs = BOX_EDGE_INDEX
    group.add(lines)
    count++
  }

  if (group.children.length === 0) return null
  return group
}

/**
 * 地图平移/缩放后刷新障碍物线框顶点（与 updatePathLineGeometry 同理）
 */
export function updateObstacleOverlayGroupPositions(group, map, container) {
  if (!group || !map || !container) return

  group.traverse((child) => {
    if (!child.isLineSegments || !child.userData?.cornerLngLats) return
    const cornerLngLats = child.userData.cornerLngLats
    const positions = child.geometry.getAttribute('position')
    if (!positions || !positions.array) return
    const arr = positions.array
    let o = 0
    for (const [a, b] of BOX_EDGE_INDEX) {
      for (const idx of [a, b]) {
        const ll = cornerLngLats[idx]
        const v = lngLatAltToOverlayWorld(container, map, ll.lng, ll.lat, ll.alt)
        arr[o++] = v.x
        arr[o++] = v.y
        arr[o++] = v.z
      }
    }
    positions.needsUpdate = true
  })
}

export function disposeObstacleOverlayGroup(scene) {
  if (!scene?.userData?.__obstacleOverlayGroup) return
  const g = scene.userData.__obstacleOverlayGroup
  scene.remove(g)
  scene.userData.__obstacleOverlayGroup = null

  const THREE = getTHREE()
  if (!THREE) return
  g.traverse((child) => {
    if (child.geometry) child.geometry.dispose()
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose())
      else child.material.dispose()
    }
  })
}
