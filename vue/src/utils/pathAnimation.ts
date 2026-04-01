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
    
    let offset = 0
    const animate = () => {
      offset = (offset + 1) % 100
      this.pathPolyline.setStrokeStyle({
        strokeDashArray: `${offset * 10}, ${100 - offset * 10}`
      })
      this.flowAnimationRef.value = requestAnimationFrame(animate)
    }
    animate()
  }

  /**
   * 创建无人机图标标记
   */
  createUavIconMarker = () => {
    if (this.uavIconMarker) {
      this.map.removeOverlay(this.uavIconMarker)
    }
    
    // 使用自定义图标
    const icon = new BMap.Icon(
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNEQ0RkMzIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjgiLz48cGF0aCBkPSJNMTIgNFYyTTEyIDIwdjJNNCAxMmgyTTIwIDEyaC0yIi8+PC9zdmc+',
      new BMap.Size(32, 32)
    )
    
    this.uavIconMarker = new BMap.Marker(this.flatPathCoords[0], { icon })
    this.map.addOverlay(this.uavIconMarker)
  }

  /**
   * 启动插值动画
   */
  startInterpolationAnimation = () => {
    if (this.flatPathCoords.length < 2 || !this.uavIconMarker) return
    
    const startTime = Date.now()
    const totalPoints = this.flatPathCoords.length
    
    const interpolate = () => {
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
      const newPosition = new BMap.Point(lng, lat)
      this.uavIconMarker.setPosition(newPosition)
      
      // 计算并更新旋转角度
      this.updateUavRotation(currentPoint, nextPoint)
      
      // 继续动画
      if (progress < 1) {
        requestAnimationFrame(interpolate)
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
    
    console.log('无人机朝向:', angle.toFixed(2), '度')
  }

  /**
   * 清除动画
   */
  clearAnimations = () => {
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
