/**
 * 为路径点补充 / 规范化高度 alt（米）
 */

/**
 * @param {any} p
 * @returns {{ lng: number, lat: number, alt?: number }}
 */
export function normalizePathPoint(p) {
  const lng = Number(p.lng ?? p.longitude)
  const lat = Number(p.lat ?? p.latitude)
  const altRaw = p.alt ?? p.height ?? p.elevation
  const alt = altRaw != null && !Number.isNaN(Number(altRaw)) ? Number(altRaw) : undefined
  return { lng, lat, ...(alt !== undefined ? { alt } : {}) }
}

/**
 * @param {Array<{ lng: number, lat: number, alt?: number }>} points
 * @param {{ cruiseAlt?: number, preserveExistingAlt?: boolean }} options
 * @returns {Array<{ lng: number, lat: number, alt: number }>}
 */
export function enrichPathWithAltitude(points, options = {}) {
  const cruiseAlt = options.cruiseAlt ?? 85
  const preserve = options.preserveExistingAlt === true
  if (!points || points.length === 0) return []

  const n = points.length
  return points.map((raw, i) => {
    const p = normalizePathPoint(raw)
    if (preserve && p.alt !== undefined) {
      return { lng: p.lng, lat: p.lat, alt: Number(p.alt.toFixed(2)) }
    }
    const t = n <= 1 ? 1 : i / (n - 1)
    const ramp = 0.12
    let blend = 1
    if (t < ramp) blend = t / ramp
    else if (t > 1 - ramp) blend = (1 - t) / ramp
    const alt = cruiseAlt * Math.max(0.12, blend)
    return { lng: p.lng, lat: p.lat, alt: Number(alt.toFixed(2)) }
  })
}
