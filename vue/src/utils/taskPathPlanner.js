/**
 * 任务类型 -> 规划策略分发器
 *
 * 输出：
 * - pathPoints: [{ lng, lat, alt }]
 * - algorithm: 用于路线信息展示/缓存（字符串）
 */

import { planAerialStraightLineRoute, planLakeCoverRoute } from './taskRouteGenerators'
import { planRiverPathWithAmapWalking } from './waterwayAmapPlanner'
import { normalizePathPoint, enrichPathWithAltitude } from './pathAltitude'
import { planPathDijkstraGrid, planPathDijkstraGridAvoidPolygons } from './basicPathPlanner'
import { loadNoFlyZones, checkNoFlyZoneIntersection, DISABLE_NOFLY_ON_DRIVING_PLAN } from './noFlyZoneService'

const ROAD_TASK_TYPES = new Set(['巡检', '道路巡检'])

export async function planTaskRoute(task, context) {
  const taskType = String(task?.taskType ?? '')
  const start = context.start // { lng, lat }
  const end = context.end // { lng, lat }
  const targetAltitudeM = Number(context.targetAltitudeM ?? 120)
  const uavId = context.uavId ?? null

  // ===== 航拍：高空直线 =====
  if (taskType === '航拍') {
    const pathPoints = planAerialStraightLineRoute({
      start,
      end,
      targetAltitudeM,
      pointsCount: context.pointsCount?.aerial ?? 80
    })
    return { pathPoints, algorithm: '航拍直线高空' }
  }

  // ===== 水域巡检：河流顺/逆 & 湖泊 100m 覆盖 =====
  if (taskType === '水域巡检') {
    if (context.waterSubType === '河流') {
      const { pathPoints, source } = await planRiverPathWithAmapWalking(context, start, end, {
        targetAltitudeM,
        direction: context.riverDirection ?? '顺流',
        pointsCount: context.pointsCount?.river ?? 120,
        riverCenterOffsetM: Number(context.riverCenterOffsetM ?? 50),
        riverBankSide: context.riverBankSide === 'right' ? 'right' : 'left'
      })
      const algorithm =
        source === 'walking'
          ? '水域巡检(河流·步行+法向偏移)'
          : '水域巡检(河流·直线降级)'
      return { pathPoints, algorithm }
    }

    const pathPoints = planLakeCoverRoute({
      center: start,
      reference: end,
      targetAltitudeM,
      coverageDiameterM: 100,
      stripeSpacingM: context.stripeSpacingM ?? 20,
      pointsPerStripe: context.pointsCount?.lakeStripe ?? 24
    })
    return { pathPoints, algorithm: '水域巡检(湖泊覆盖100m)' }
  }

  // ===== 道路巡检：沿道路规划（DrivingRoute）=====
  if (ROAD_TASK_TYPES.has(taskType)) {
    return await planRoadInspectionRoute(context, start, end, targetAltitudeM)
  }

  // ===== 其他任务：默认高空避障（后端规划）=====
  return await planObstacleAvoidanceRoute(context, start, end, targetAltitudeM, uavId)
}

/**
 * 水域巡检专用：河流走高德步行路网+法向偏移，湖泊走覆盖航线
 */
export async function planWaterInspectionRoute(context, start, end, targetAltitudeM, waterOpts = {}) {
  const sub = waterOpts.waterSubType === '湖泊' ? '湖泊' : '河流'

  if (sub === '湖泊') {
    const pathPoints = planLakeCoverRoute({
      center: start,
      reference: end,
      targetAltitudeM,
      coverageDiameterM: Number(waterOpts.coverageDiameterM ?? 100),
      stripeSpacingM: Number(waterOpts.stripeSpacingM ?? 20),
      pointsPerStripe: Number(waterOpts.pointsPerStripe ?? 24)
    })
    return { pathPoints, algorithm: '水域巡检(湖泊覆盖100m)', source: 'lake_cover' }
  }

  const { pathPoints, source } = await planRiverPathWithAmapWalking(context, start, end, {
    targetAltitudeM,
    direction: waterOpts.riverDirection ?? '顺流',
    pointsCount: waterOpts.pointsCount ?? 120,
    riverCenterOffsetM: Number(waterOpts.riverCenterOffsetM ?? 50),
    riverBankSide: waterOpts.riverBankSide === 'right' ? 'right' : 'left'
  })
  const algorithm =
    source === 'walking'
      ? '水域巡检(河流·步行+法向偏移)'
      : '水域巡检(河流·直线降级)'
  return { pathPoints, algorithm, source }
}

export async function planRoadInspectionRoute(context, start, end, targetAltitudeM) {
  // 需要 AMap 实例（AMap Driving）
  const map = context.map
  if (!map || typeof AMap === 'undefined') {
    throw new Error('道路规划需要 AMap 实例')
  }

  return new Promise((resolve, reject) => {
    try {
      const ensureDriving = () =>
        new Promise((r) => {
          if (!AMap || typeof AMap.plugin !== 'function') return r()
          AMap.plugin(['AMap.Driving'], () => r())
        })

      ensureDriving().then(() => {
        if (typeof AMap.Driving !== 'function') {
          // 降级：Driving 不可用时用直线
          const pathPoints = [
            { ...start, alt: targetAltitudeM },
            { ...end, alt: targetAltitudeM }
          ]
          resolve({ pathPoints, algorithm: '沿道路规划(降级直线)' })
          return
        }

        const metersToLngLatDelta = (lng, lat, dxM, dyM) => {
          const mPerDegLat = 111320
          const dLat = dyM / mPerDegLat
          const dLng = dxM / (mPerDegLat * Math.cos((lat * Math.PI) / 180))
          return { lng: lng + dLng, lat: lat + dLat }
        }

        const polygonCentroid = (poly) => {
          if (!Array.isArray(poly) || poly.length < 3) return null
          let sx = 0
          let sy = 0
          for (const p of poly) {
            sx += Number(p[0])
            sy += Number(p[1])
          }
          return { lng: sx / poly.length, lat: sy / poly.length }
        }

        const polygonRadiusMetersApprox = (poly) => {
          if (!Array.isArray(poly) || poly.length < 3) return 500
          let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
          for (const p of poly) {
            const lng = Number(p[0])
            const lat = Number(p[1])
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
            minLng = Math.min(minLng, lng)
            maxLng = Math.max(maxLng, lng)
            minLat = Math.min(minLat, lat)
            maxLat = Math.max(maxLat, lat)
          }
          if (!Number.isFinite(minLng)) return 500
          const mPerDegLat = 111320
          const dyM = (maxLat - minLat) * mPerDegLat
          const dxM =
            (maxLng - minLng) *
            mPerDegLat *
            Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
          return Math.max(200, Math.sqrt(dxM * dxM + dyM * dyM) / 2)
        }

        const buildDetourCandidates = (polygons, s, e) => {
          const all = []
          const vx = Number(e.lng) - Number(s.lng)
          const vy = Number(e.lat) - Number(s.lat)
          const len = Math.sqrt(vx * vx + vy * vy) || 1
          const ux = vx / len
          const uy = vy / len
          const nx = -uy
          const ny = ux

          for (const poly of polygons || []) {
            const c = polygonCentroid(poly)
            if (!c) continue
            const r = polygonRadiusMetersApprox(poly) + 300
            const angles = [0, 45, 90, 135, 180, 225, 270, 315]
            for (const deg of angles) {
              const rad = (deg * Math.PI) / 180
              const dx = Math.cos(rad) * r
              const dy = Math.sin(rad) * r
              all.push(metersToLngLatDelta(c.lng, c.lat, dx, dy))
            }
            const side = r * 1.1
            all.push(metersToLngLatDelta(c.lng, c.lat, nx * side, ny * side))
            all.push(metersToLngLatDelta(c.lng, c.lat, -nx * side, -ny * side))
            all.push(
              metersToLngLatDelta(
                c.lng,
                c.lat,
                ux * side * 0.6 + nx * side,
                uy * side * 0.6 + ny * side
              )
            )
            all.push(
              metersToLngLatDelta(
                c.lng,
                c.lat,
                ux * side * 0.6 - nx * side,
                uy * side * 0.6 - ny * side
              )
            )
          }
          const uniq = new Map()
          for (const p of all) {
            const k = `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`
            if (!uniq.has(k)) uniq.set(k, p)
          }
          return Array.from(uniq.values())
        }

        const driving = new AMap.Driving({
          city: '南昌市',
          map: null // 不在内部直接渲染（只取路径点用于后续动画/叠层）
        })

        const extractRoutePoints = (steps = []) => {
          const raw = []
          for (const step of steps || []) {
            const path = step?.path || []
            for (const p of path) {
              const lng = Array.isArray(p) ? p[0] : typeof p?.getLng === 'function' ? p.getLng() : p?.lng
              const lat = Array.isArray(p) ? p[1] : typeof p?.getLat === 'function' ? p.getLat() : p?.lat
              if (lng != null && lat != null && !Number.isNaN(Number(lng)) && !Number.isNaN(Number(lat))) {
                raw.push({ lng: Number(lng), lat: Number(lat) })
              }
            }
          }
          return raw
        }

        const searchWalkingFallback = () =>
          new Promise((resolve2, reject2) => {
            const run = () => {
              if (typeof AMap.Walking !== 'function') {
                reject2(new Error('高德地图路线规划失败'))
                return
              }
              const walking = new AMap.Walking({ city: '南昌市', map: null })
              walking.search([start.lng, start.lat], [end.lng, end.lat], (st, res) => {
                const ok2 = st === 'complete' || res?.info === 'OK' || res?.info === 'OK.'
                const raw = ok2 ? extractRoutePoints(res?.routes?.[0]?.steps || []) : []
                if (raw.length >= 2) {
                  resolve2({
                    pathPoints: raw.map((p) => ({ ...p, alt: targetAltitudeM })),
                    algorithm: '沿道路规划(步行路网兜底)'
                  })
                } else {
                  reject2(new Error('高德地图路线规划失败'))
                }
              })
            }
            try {
              if (typeof AMap.Walking === 'function') run()
              else AMap.plugin(['AMap.Walking'], run)
            } catch (e) {
              reject2(e)
            }
          })

        driving.search(
          [start.lng, start.lat],
          [end.lng, end.lat],
          {},
          (status, result) => {
            const ok = status === 'complete' || result?.info === 'OK' || result?.info === 'OK.'
            if (ok) {
              const steps = result.routes?.[0]?.steps || []
              if (!Array.isArray(steps) || steps.length === 0) {
                searchWalkingFallback().then(resolve).catch(reject)
                return
              }

              const raw = extractRoutePoints(steps)

              if (raw.length === 0) {
                searchWalkingFallback().then(resolve).catch(reject)
                return
              }

              // 道路巡检依然按“高空”显示：为每个点补 altitude
              const pathPoints = raw.map((p) => ({ ...p, alt: targetAltitudeM }))

              // 穿越禁飞区：驾车 + 途经点绕行；失败再本地网格（DISABLE_NOFLY_ON_DRIVING_PLAN 为 true 时跳过）
              void (async () => {
                try {
                  if (DISABLE_NOFLY_ON_DRIVING_PLAN) {
                    resolve({ pathPoints, algorithm: '沿道路规划(高空)' })
                    return
                  }
                  const zones = await loadNoFlyZones()
                  const result = checkNoFlyZoneIntersection(pathPoints, zones)
                  const polygons = (zones || [])
                    .filter((z) => Array.isArray(z?.path) && z.path.length >= 3)
                    .map((z) => z.path)
                  if (result?.hasViolation && polygons.length) {
                    let routed = false
                    const candidates = buildDetourCandidates(polygons, start, end)
                    for (const wp of candidates.slice(0, 20)) {
                      try {
                        const detour = await new Promise((res2, rej2) => {
                          driving.search(
                            [start.lng, start.lat],
                            [end.lng, end.lat],
                            { waypoints: [[wp.lng, wp.lat]] },
                            (st2, r2) => {
                              const ok2 = st2 === 'complete' || r2?.info === 'OK' || r2?.info === 'OK.'
                              if (!ok2) return rej2(new Error('waypoint failed'))
                              return res2(r2)
                            }
                          )
                        })
                        const detourSteps = detour?.routes?.[0]?.steps || []
                        const detourRaw = []
                        for (const step of detourSteps) {
                          const path = step?.path || []
                          for (const p of path) {
                            const lng =
                              Array.isArray(p) ? p[0] : typeof p?.getLng === 'function' ? p.getLng() : p?.lng
                            const lat =
                              Array.isArray(p) ? p[1] : typeof p?.getLat === 'function' ? p.getLat() : p?.lat
                            if (lng != null && lat != null && !Number.isNaN(Number(lng)) && !Number.isNaN(Number(lat))) {
                              detourRaw.push({ lng: Number(lng), lat: Number(lat) })
                            }
                          }
                        }
                        if (detourRaw.length < 2) continue
                        const detourPts = detourRaw.map((p) => ({ ...p, alt: targetAltitudeM }))
                        const chk = checkNoFlyZoneIntersection(detourPts, zones)
                        if (!chk?.hasViolation) {
                          resolve({ pathPoints: detourPts, algorithm: '沿道路规划(禁飞绕行-沿道路)' })
                          routed = true
                          return
                        }
                      } catch {}
                    }

                    if (routed) return

                    const avoid = planPathDijkstraGridAvoidPolygons(
                      { lng: start.lng, lat: start.lat },
                      { lng: end.lng, lat: end.lat },
                      polygons
                    )
                    const avoidPts = enrichPathWithAltitude(avoid.map(normalizePathPoint), {
                      cruiseAlt: targetAltitudeM,
                      preserveExistingAlt: true
                    })
                    resolve({ pathPoints: avoidPts, algorithm: '沿道路规划(禁飞绕行-本地网格)' })
                    return
                  }
                } catch {}
                resolve({ pathPoints, algorithm: '沿道路规划(高空)' })
              })()
            } else {
              searchWalkingFallback().then(resolve).catch(reject)
            }
          }
        )
      }).catch(reject)
    } catch (e) {
      reject(e)
    }
  })
}

async function planObstacleAvoidanceRoute(context, start, end, targetAltitudeM, uavId) {
  if (uavId == null) {
    throw new Error('高空避障规划需要选择无人机（uavId）')
  }

  // 当前后端传统规划接口缺失，统一降级为前端网格 Dijkstra 演示路径
  const raw = planPathDijkstraGrid({ lng: start.lng, lat: start.lat }, { lng: end.lng, lat: end.lat })
  const pathPoints = enrichPathWithAltitude(raw.map(normalizePathPoint), {
    cruiseAlt: targetAltitudeM,
    preserveExistingAlt: true
  })
  return { pathPoints, algorithm: '高空避障规划(本地网格Dijkstra)' }
}

