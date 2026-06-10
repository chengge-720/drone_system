/**
 * 任务规划页 — 路径节点标记与悬停飞行信息
 */
import { getDistanceFromLatLonInMeters } from '@/utils/pathCalculator'

export interface PathWaypointHoverInfo {
  index: number
  total: number
  lng: number
  lat: number
  alt: number
  speedMps: number
  distFromStartM: number
  etaSeconds: number
}

export interface DrawWaypointMarkersOptions {
  speedMps: number
  maxMarkers?: number
  altitudeM?: number
}

const formatEta = (sec: number) => {
  if (!sec || sec <= 0) return '0 秒'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`
}

const buildHoverHtml = (info: PathWaypointHoverInfo) => `
  <div class="tp-path-tooltip">
    <div class="tp-path-tooltip__title">航点 #${info.index + 1} / ${info.total}</div>
    <div class="tp-path-tooltip__row"><span>飞行高度</span><strong>${info.alt.toFixed(0)} m</strong></div>
    <div class="tp-path-tooltip__row"><span>飞行速度</span><strong>${info.speedMps.toFixed(1)} m/s</strong></div>
    <div class="tp-path-tooltip__row"><span>距起点</span><strong>${Math.round(info.distFromStartM)} m</strong></div>
    <div class="tp-path-tooltip__row"><span>预计到达</span><strong>${formatEta(info.etaSeconds)}</strong></div>
  </div>
`

const buildWaypointHtml = (kind: 'start' | 'end' | 'mid') => {
  const cls =
    kind === 'start' ? 'tp-waypoint tp-waypoint--start' : kind === 'end' ? 'tp-waypoint tp-waypoint--end' : 'tp-waypoint'
  return `<div class="${cls}"><span class="tp-waypoint__ring"></span><span class="tp-waypoint__core"></span></div>`
}

const sampleIndices = (total: number, max: number) => {
  if (total <= max) return Array.from({ length: total }, (_, i) => i)
  const out: number[] = []
  for (let i = 0; i < max; i++) {
    out.push(Math.round((i * (total - 1)) / (max - 1)))
  }
  return [...new Set(out)]
}

export const clearStaticTaskPath = (polylineRef: { value: any }) => {
  const prev = polylineRef?.value
  if (Array.isArray(prev)) {
    prev.forEach((p) => p?.setMap?.(null))
  } else if (prev?.setMap) {
    prev.setMap(null)
  }
  polylineRef.value = null
}

export const drawStaticTaskPath = (
  map: any,
  flatCoords: Array<{ lng: number; lat: number; alt?: number }>,
  polylineRef: { value: any }
) => {
  clearStaticTaskPath(polylineRef)
  if (!map || !flatCoords?.length || flatCoords.length < 2) return

  const path = flatCoords.map((p) => [p.lng, p.lat])
  const layers = [
    { width: 12, opacity: 0.14, color: '#93c5fd' },
    { width: 7, opacity: 0.38, color: '#3b82f6' },
    { width: 4, opacity: 0.98, color: '#1d4ed8' }
  ]

  polylineRef.value = layers.map(
    (layer) =>
      new AMap.Polyline({
        path,
        strokeColor: layer.color,
        strokeWeight: layer.width,
        strokeOpacity: layer.opacity,
        lineJoin: 'round',
        lineCap: 'round',
        zIndex: 50 + layer.width,
        map
      })
  )
}

export const clearPathWaypointMarkers = (markersRef: { value: any[] }) => {
  const list = markersRef?.value
  if (!Array.isArray(list)) return
  list.forEach((m) => {
    try {
      m?.setMap?.(null)
    } catch {}
  })
  markersRef.value = []
}

export const drawPathWaypointMarkers = (
  map: any,
  flatCoords: Array<{ lng: number; lat: number; alt?: number }>,
  markersRef: { value: any[] },
  options: DrawWaypointMarkersOptions
) => {
  if (!map || !flatCoords?.length) return
  clearPathWaypointMarkers(markersRef)

  const speed = Math.max(1, Number(options.speedMps || 10))
  const maxMarkers = options.maxMarkers ?? 22
  const indices = sampleIndices(flatCoords.length, maxMarkers)
  const cumulative: number[] = [0]
  for (let i = 1; i < flatCoords.length; i++) {
    const prev = flatCoords[i - 1]
    const curr = flatCoords[i]
    const horiz = getDistanceFromLatLonInMeters(prev.lat, prev.lng, curr.lat, curr.lng)
    const dv = (curr.alt ?? 0) - (prev.alt ?? 0)
    cumulative.push(cumulative[i - 1] + Math.sqrt(horiz * horiz + dv * dv))
  }

  const infoWindow = new AMap.InfoWindow({
    isCustom: true,
    offset: new AMap.Pixel(0, -16),
    closeWhenClickMap: true
  })

  const created: any[] = []
  for (const idx of indices) {
    const p = flatCoords[idx]
    const dist = cumulative[idx] || 0
    const info: PathWaypointHoverInfo = {
      index: idx,
      total: flatCoords.length,
      lng: p.lng,
      lat: p.lat,
      alt: Number(p.alt ?? options.altitudeM ?? 0),
      speedMps: speed,
      distFromStartM: dist,
      etaSeconds: dist / speed
    }

    const kind = idx === 0 ? 'start' : idx === flatCoords.length - 1 ? 'end' : 'mid'
    const marker = new AMap.Marker({
      position: [p.lng, p.lat],
      content: buildWaypointHtml(kind),
      offset: new AMap.Pixel(-9, -9),
      zIndex: kind === 'mid' ? 120 : 130,
      cursor: 'pointer',
      map
    })

    marker.on('mouseover', () => {
      infoWindow.setContent(buildHoverHtml(info))
      infoWindow.open(map, [p.lng, p.lat])
    })
    marker.on('mouseout', () => {
      infoWindow.close()
    })

    created.push(marker)
  }

  markersRef.value = created
}
