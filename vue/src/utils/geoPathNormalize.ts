export type GeoPathInput = { lng?: number; lat?: number; alt?: number } | number[]

/** 将 API / 存储中的路径点统一为 { lng, lat, alt? } */
export function normalizeGeoPathPoints(rawPath: GeoPathInput[]) {
  const out: Array<{ lng: number; lat: number; alt?: number }> = []
  for (const p of rawPath || []) {
    let lat = Number(Array.isArray(p) ? p[0] : p?.lat)
    let lng = Number(Array.isArray(p) ? p[1] : p?.lng)
    const alt = Number(Array.isArray(p) ? p[2] : p?.alt)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
      const t = lat
      lat = lng
      lng = t
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue
    out.push({ lat, lng, alt: Number.isFinite(alt) ? alt : undefined })
  }
  return out
}
