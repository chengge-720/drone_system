import * as Cesium from 'cesium'
import { flyCameraToPathBounds } from '@/utils/cesiumFlightViewer'

export interface FlightPathPoint {
  lng: number
  lat: number
  alt?: number
}

export interface DrawFlightPathOptions {
  pathColor?: string
  pathWidth?: number
  showEndpoints?: boolean
  maxRenderPoints?: number
  glow?: boolean
}

export interface FlightPlaybackOptions {
  speedMps?: number
  trailSeconds?: number
  followDrone?: boolean
  loop?: boolean
  maxRenderPoints?: number
  maxAnimationPoints?: number
  onProgress?: (info: { index: number; total: number; distanceM: number }) => void
  onComplete?: () => void
}

export interface FlightPlaybackHandle {
  stop: () => void
  pause: () => void
  resume: () => void
  setSpeedMultiplier: (n: number) => void
  isPaused: () => boolean
}

export interface FlightSceneEntities {
  pathEntity: Cesium.Entity | null
  pathGlowEntity: Cesium.Entity | null
  startEntity: Cesium.Entity | null
  endEntity: Cesium.Entity | null
  droneEntity: Cesium.Entity | null
}

function sanitizePath(points: FlightPathPoint[]): FlightPathPoint[] {
  const out: FlightPathPoint[] = []
  for (const p of points || []) {
    let lat = Number(p?.lat)
    let lng = Number(p?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
      const t = lat
      lat = lng
      lng = t
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue
    const alt = Number(p?.alt)
    out.push({ lng, lat, alt: Number.isFinite(alt) ? alt : 0 })
  }
  return out
}

function samplePath(points: FlightPathPoint[], maxPoints: number) {
  if (points.length <= maxPoints) return points
  const out: FlightPathPoint[] = []
  const last = points.length - 1
  const step = last / (maxPoints - 1)
  for (let i = 0; i < maxPoints; i++) {
    out.push(points[Math.round(i * step)])
  }
  return out
}

function segmentMeters(a: FlightPathPoint, b: FlightPathPoint) {
  const mPerDegLat = 111320
  const midLat = (a.lat + b.lat) / 2
  const mPerDegLng = 111320 * Math.cos((midLat * Math.PI) / 180)
  const dx = (b.lng - a.lng) * mPerDegLng
  const dy = (b.lat - a.lat) * mPerDegLat
  const dz = (b.alt ?? 0) - (a.alt ?? 0)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function buildDistances(points: FlightPathPoint[]) {
  const distances: number[] = [0]
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += segmentMeters(points[i - 1], points[i])
    distances.push(total)
  }
  return { distances, total }
}

function interpolatePoint(a: FlightPathPoint, b: FlightPathPoint, t: number): FlightPathPoint {
  return {
    lng: a.lng + (b.lng - a.lng) * t,
    lat: a.lat + (b.lat - a.lat) * t,
    alt: (a.alt ?? 0) + ((b.alt ?? 0) - (a.alt ?? 0)) * t
  }
}

function toCartesian(p: FlightPathPoint) {
  return Cesium.Cartesian3.fromDegrees(p.lng, p.lat, Math.max(p.alt ?? 0, 1))
}

export function clearFlightEntities(viewer: Cesium.Viewer, entities: FlightSceneEntities) {
  const list = [
    entities.pathGlowEntity,
    entities.pathEntity,
    entities.startEntity,
    entities.endEntity,
    entities.droneEntity
  ]
  for (const e of list) {
    if (!e) continue
    try {
      viewer.entities.remove(e)
    } catch {}
  }
  entities.pathGlowEntity = null
  entities.pathEntity = null
  entities.startEntity = null
  entities.endEntity = null
  entities.droneEntity = null
}

export function drawFlightPathOnViewer(
  viewer: Cesium.Viewer,
  rawPoints: FlightPathPoint[],
  entities: FlightSceneEntities,
  options: DrawFlightPathOptions = {}
): FlightPathPoint[] {
  clearFlightEntities(viewer, entities)
  const points = samplePath(sanitizePath(rawPoints), options.maxRenderPoints ?? 240)
  if (points.length < 2) return points

  const positions = points.map(toCartesian)
  const color = Cesium.Color.fromCssColorString(options.pathColor || '#22d3ee')
  const useGlow = options.glow !== false

  if (useGlow) {
    entities.pathGlowEntity = viewer.entities.add({
      polyline: {
        positions,
        width: (options.pathWidth ?? 5) + 8,
        clampToGround: false,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.22,
          color: color.withAlpha(0.28)
        })
      }
    })
  }

  entities.pathEntity = viewer.entities.add({
    polyline: {
      positions,
      width: options.pathWidth ?? 5,
      clampToGround: false,
      material: useGlow
        ? new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.35,
            color: color.withAlpha(0.96)
          })
        : color.withAlpha(0.92)
    }
  })

  if (options.showEndpoints !== false) {
    const start = points[0]
    const end = points[points.length - 1]
    entities.startEntity = viewer.entities.add({
      position: toCartesian(start),
      point: {
        pixelSize: 12,
        color: Cesium.Color.fromCssColorString('#34d399'),
        outlineColor: Cesium.Color.fromCssColorString('#064e3b'),
        outlineWidth: 2
      },
      label: {
        text: '起点',
        font: '12px sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#ecfdf5'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14)
      }
    })
    entities.endEntity = viewer.entities.add({
      position: toCartesian(end),
      point: {
        pixelSize: 12,
        color: Cesium.Color.fromCssColorString('#f97316'),
        outlineColor: Cesium.Color.fromCssColorString('#7c2d12'),
        outlineWidth: 2
      },
      label: {
        text: '终点',
        font: '12px sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#fff7ed'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14)
      }
    })
  }

  try {
    flyCameraToPathBounds(viewer, points, { duration: 1.2, pitchDeg: -45 })
  } catch {}
  viewer.scene.requestRender()

  return points
}

export function startFlightPlayback(
  viewer: Cesium.Viewer,
  rawPoints: FlightPathPoint[],
  entities: FlightSceneEntities,
  options: FlightPlaybackOptions = {}
): FlightPlaybackHandle | null {
  const renderPoints = drawFlightPathOnViewer(viewer, rawPoints, entities, {
    pathColor: '#22d3ee',
    pathWidth: 5,
    showEndpoints: true,
    maxRenderPoints: options.maxRenderPoints ?? 240,
    glow: true
  })
  const points = samplePath(renderPoints, options.maxAnimationPoints ?? 120)
  if (points.length < 2) return null

  const speedMps = Math.max(options.speedMps ?? 14, 2)
  const { distances, total } = buildDistances(points)
  const totalSec = Math.max(total / speedMps, 1)

  if (entities.droneEntity) {
    try {
      viewer.entities.remove(entities.droneEntity)
    } catch {}
  }

  entities.droneEntity = viewer.entities.add({
    position: toCartesian(points[0]),
    point: {
      pixelSize: 14,
      color: Cesium.Color.YELLOW,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2
    },
    label: {
      text: 'UAV',
      font: '12px sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -18)
    }
  })

  let completed = false
  let paused = false
  let speedMul = 1
  let rafId = 0
  let startedAt = performance.now()
  let pausedAt = 0
  let accumulatedPauseMs = 0
  let lastRenderMs = 0

  const locate = (distanceM: number) => {
    let idx = 0
    while (idx < distances.length - 2 && distances[idx + 1] < distanceM) idx++
    const segStart = distances[idx]
    const segEnd = distances[idx + 1] || segStart + 1
    const t = Cesium.Math.clamp((distanceM - segStart) / Math.max(segEnd - segStart, 1), 0, 1)
    return { idx, point: interpolatePoint(points[idx], points[idx + 1] || points[idx], t) }
  }

  const tick = (now: number) => {
    if (!entities.droneEntity) return
    if (paused) {
      return
    }
    const elapsedSec = ((now - startedAt - accumulatedPauseMs) / 1000) * speedMul
    const nextDistance = options.loop ? (elapsedSec * speedMps) % total : Math.min(elapsedSec * speedMps, total)
    const { idx, point } = locate(nextDistance)
    entities.droneEntity.position = new Cesium.ConstantPositionProperty(toCartesian(point))

    if (now - lastRenderMs > 66) {
      lastRenderMs = now
      options.onProgress?.({ index: idx, total: points.length - 1, distanceM: nextDistance })
      viewer.scene.requestRender()
    }

    if (!options.loop && !completed && nextDistance >= total) {
      completed = true
      options.onComplete?.()
      return
    }
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)

  return {
    stop: () => {
      if (rafId) cancelAnimationFrame(rafId)
      viewer.trackedEntity = undefined
      if (entities.droneEntity) {
        try {
          viewer.entities.remove(entities.droneEntity)
        } catch {}
        entities.droneEntity = null
      }
      viewer.scene.requestRender()
    },
    pause: () => {
      if (paused) return
      paused = true
      pausedAt = performance.now()
    },
    resume: () => {
      if (!paused) return
      paused = false
      accumulatedPauseMs += performance.now() - pausedAt
      rafId = requestAnimationFrame(tick)
    },
    setSpeedMultiplier: (n: number) => {
      speedMul = Math.max(0.25, Math.min(8, n))
    },
    isPaused: () => paused
  }
}
