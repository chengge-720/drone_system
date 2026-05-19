/**
 * 路径动画管理
 */

import type { Ref } from 'vue'

export interface AnimationConfig {
  duration: number
  flowSpeed: number
}

export class PathAnimationManager {
  private map: any
  private flatPathCoords: Array<{ lng: number; lat: number }>
  private uavIconMarker: any
  private pathPolyline: any
  private flowAnimationRef: Ref<number | null>
  private animationId: Ref<number | null>
  private config: AnimationConfig
  private flowRunning = false
  private interpolationRunning = false

  constructor(
    map: any,
    flatPathCoords: Array<{ lng: number; lat: number }>,
    uavIconMarker: any,
    pathPolyline: any,
    flowAnimationRef: Ref<number | null>,
    animationId: Ref<number | null>,
    config: AnimationConfig = { duration: 3000, flowSpeed: 1 }
  ) {
    this.map = map
    this.flatPathCoords = flatPathCoords
    this.uavIconMarker = uavIconMarker
    this.pathPolyline = pathPolyline
    this.flowAnimationRef = flowAnimationRef
    this.animationId = animationId
    this.config = config
  }

  /**
   * 启动流光动画
   */
  startFlowAnimation = () => {
    if (!this.pathPolyline) return

    this.flowRunning = true

    // 防止重复启动导致多个 RAF 并行（会放大 AMap canvas 重绘压力）
    const existing = this.flowAnimationRef.value
    if (typeof existing === 'number') {
      cancelAnimationFrame(existing)
    }
    this.flowAnimationRef.value = null
    
    let offset = 0
    // 降低 setOptions 更新频率，避免 AMap/Canvas 在高频重绘下触发 getImageData 警告刷屏
    const FRAME_MS = 250 // ~4fps
    let lastUpdate = 0
    const startTime = Date.now()

    const animate = (now?: number) => {
      if (!this.flowRunning) return
      const t = typeof now === 'number' ? now : Date.now()

      // 到时自动停止流光，避免动画结束后仍持续触发 canvas 重绘
      if (t - startTime >= this.config.duration) {
        this.flowAnimationRef.value = null
        this.flowRunning = false
        return
      }

      if (t - lastUpdate >= FRAME_MS) {
        lastUpdate = t
        offset = (offset + 1) % 100
        // AMap 虚线动态更新：strokeDasharray 为 number[]
        this.pathPolyline.setOptions?.({
          strokeDasharray: [offset * 10, 100 - offset * 10]
        })
      }
      this.flowAnimationRef.value = requestAnimationFrame(animate)
    }

    this.flowAnimationRef.value = requestAnimationFrame(animate)
  }

  /**
   * 创建无人机图标标记
   */
  createUavIconMarker = () => {
    const existing = this.uavIconMarker?.value ?? this.uavIconMarker
    if (existing?.setMap) existing.setMap(null)

    const first = this.flatPathCoords[0]

    // 用 inline SVG content 避免 data:image/svg+xml base64 在某些浏览器/JSAPI 下无法加载导致“破图占位”
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4D4FC3" stroke-width="2">
        <circle cx="12" cy="12" r="8"></circle>
        <path d="M12 4V12M12 20V14M4 12h16"></path>
      </svg>
    `
    const content = `
      <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
        ${svg}
      </div>
    `

    const pixelOffset =
      typeof AMap?.Pixel === 'function' ? new AMap.Pixel(-16, -16) : undefined

    const marker = new AMap.Marker({
      position: [first.lng, first.lat],
      content,
      offset: pixelOffset,
      map: this.map
    })

    // 兼容传参为 ref 或直接为 marker 的两种写法
    if (this.uavIconMarker && 'value' in this.uavIconMarker) {
      this.uavIconMarker.value = marker
    }
    this.uavIconMarker = marker
  }

  /**
   * 启动插值动画
   */
  startInterpolationAnimation = () => {
    if (this.flatPathCoords.length < 2 || !this.uavIconMarker) return

    // 确保每次启动都从干净状态开始
    this.animationId.value = null
    this.interpolationRunning = true
    
    const startTime = Date.now()
    const totalPoints = this.flatPathCoords.length
    
    const interpolate = () => {
      if (!this.interpolationRunning) return
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / this.config.duration, 1)
      
      // 计算当前应该到达的点索引
      const currentIndex = Math.floor(progress * (totalPoints - 1))
      const nextIndex = Math.min(currentIndex + 1, totalPoints - 1)
      
      // 线性插值
      const currentPoint = this.flatPathCoords[currentIndex]
      const nextPoint = this.flatPathCoords[nextIndex]
      
      const segmentProgress = (progress * (totalPoints - 1)) - currentIndex
      const lng = currentPoint.lng + (nextPoint.lng - currentPoint.lng) * segmentProgress
      const lat = currentPoint.lat + (nextPoint.lat - currentPoint.lat) * segmentProgress
      
      // 更新无人机位置
      this.uavIconMarker?.setPosition?.([lng, lat])
      
      // 计算并更新旋转角度
      this.updateUavRotation(currentPoint, nextPoint)
      
      // 继续动画
      if (progress < 1) {
        this.animationId.value = requestAnimationFrame(interpolate)
      } else {
        this.interpolationRunning = false
      }
    }
    
    interpolate()
  }

  /**
   * 更新无人机旋转角度
   */
  updateUavRotation = (current: { lng: number; lat: number }, next: { lng: number; lat: number }) => {
    if (!this.uavIconMarker) return
    
    // 计算向量角度
    const dx = next.lng - current.lng
    const dy = next.lat - current.lat
    const angle = Math.atan2(dy, dx) * 180 / Math.PI
    
    // 该版本暂不把角度真正应用到 Marker 旋转（避免频繁 setContent 造成性能问题）
  }

  /**
   * 清除动画
   */
  clearAnimations = () => {
    this.flowRunning = false
    this.interpolationRunning = false

    if (this.flowAnimationRef.value) {
      cancelAnimationFrame(this.flowAnimationRef.value)
      this.flowAnimationRef.value = null
    }
    
    if (this.animationId.value) {
      cancelAnimationFrame(this.animationId.value)
      this.animationId.value = null
    }
  }
}
