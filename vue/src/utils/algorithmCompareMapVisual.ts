/**
 * 算法对比看板 — 三路线地图绘制（企业级 · 青/橙/紫）
 */
import { normalizeGeoPathPoints } from '@/utils/geoPathNormalize'
import { getDashboardAlgoColor, type TripleAlgoRow } from '@/utils/tripleAlgoAnalysis'

export type ComparePathStore = { value: any[] | null }

const stores: ComparePathStore[] = []

function clearStore(store: ComparePathStore) {
  const list = store?.value
  if (Array.isArray(list)) {
    list.forEach((p) => {
      try {
        p?.setMap?.(null)
      } catch {}
    })
  }
  store.value = null
}

export function clearDashboardComparePaths() {
  stores.forEach(clearStore)
  stores.length = 0
}

export function drawDashboardComparePaths(
  map: any,
  rows: TripleAlgoRow[],
  options?: { visibleAlgorithms?: string[] }
) {
  if (!map || !rows?.length) return
  clearDashboardComparePaths()

  const visible = new Set(options?.visibleAlgorithms || rows.map((r) => r.algorithm))
  const created: any[] = []

  for (const row of rows) {
    if (!visible.has(row.algorithm)) continue
    const pts = normalizeGeoPathPoints(row.pathPoints || [])
    if (pts.length < 2) continue

    const path = pts.map((p) => [p.lng, p.lat])
    const color = getDashboardAlgoColor(row.algorithm)
    const store: ComparePathStore = { value: null }

    const layers = [
      { width: 8, opacity: 0.16 },
      { width: 4, opacity: 0.92 }
    ]

    store.value = layers.map(
      (layer) =>
        new AMap.Polyline({
          path,
          strokeColor: color,
          strokeWeight: layer.width,
          strokeOpacity: layer.opacity,
          lineJoin: 'round',
          lineCap: 'round',
          zIndex: 40 + layer.width,
          map
        })
    )

    stores.push(store)
    created.push(...(store.value || []))
  }

  return created
}
