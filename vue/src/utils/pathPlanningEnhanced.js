/**
 * 增强路径规划服务模块
 * 整合可拖拽路径点、天气监测和禁飞区检测功能
 */

import { createDraggableMarkers, clearPathMarkers } from './mapDraggable.js'
import { fetchWeatherInfo, checkWeatherWarning, getFlightSuitabilityScore } from './weatherService.js'
import { loadNoFlyZones, drawNoFlyZones, checkNoFlyZoneIntersection, generateNoFlyWarning } from './noFlyZoneService.js'

/**
 * 路径规划增强管理器类
 */
export class PathPlanningEnhancedManager {
  constructor(options = {}) {
    this.map = null
    this.pathPoints = []
    this.pathMarkers = []
    this.noFlyZones = []
    this.noFlyOverlays = []
    this.weatherInfo = null
    this.warnings = []
    
    // 配置选项
    this.config = {
      weatherApiKey: options.weatherApiKey || null, // 和风天气 API key
      noFlyZoneApiUrl: options.noFlyZoneApiUrl || null, // 禁飞区 API 地址
      enableDraggableMarkers: options.enableDraggableMarkers !== false, // 默认启用可拖拽标记
      autoLoadWeather: options.autoLoadWeather !== false, // 默认自动加载天气
      autoLoadNoFlyZones: options.autoLoadNoFlyZones !== false, // 默认自动加载禁飞区
      ...options
    }
    
    // 回调函数
    this.callbacks = {
      onMarkersCreated: options.onMarkersCreated || null,
      onPathUpdated: options.onPathUpdated || null,
      onWarningsChanged: options.onWarningsChanged || null
    }
  }
  
  /**
   * 初始化
   * @param {Object} map - 百度地图实例
   * @param {Array} pathPoints - 初始路径点
   */
  async init(map, pathPoints = []) {
    this.map = map
    this.pathPoints = pathPoints
    
    console.log('🚀 路径规划增强管理器初始化')
    
    // 加载禁飞区
    if (this.config.autoLoadNoFlyZones) {
      await this.loadNoFlyZones()
    }
    
    // 加载天气
    if (this.config.autoLoadWeather && pathPoints.length > 0) {
      await this.loadWeather()
    }
    
    // 创建可拖拽标记
    if (this.config.enableDraggableMarkers) {
      this.createDraggableMarkers()
    }
  }
  
  /**
   * 创建可拖拽标记
   */
  createDraggableMarkers() {
    if (!this.map || !this.pathPoints) return
    
    // 清除旧标记
    this.clearOldMarkers()
    
    // 创建新标记
    this.pathMarkers = createDraggableMarkers(
      this.map,
      this.pathPoints,
      async (index, updatedPoints) => {
        // 拖拽结束后的回调
        await this.onMarkerDragEnd(index, updatedPoints)
      }
    )
    
    // 触发自定义回调
    if (this.callbacks.onMarkersCreated) {
      this.callbacks.onMarkersCreated(this.pathMarkers)
    }
  }
  
  /**
   * 清除旧标记
   */
  clearOldMarkers() {
    if (this.pathMarkers.length > 0) {
      this.pathMarkers = clearPathMarkers(this.pathMarkers, this.map)
    }
  }
  
  /**
   * 标记拖拽结束处理
   */
  async onMarkerDragEnd(index, updatedPoints) {
    console.log('📍 路径点已更新，索引:', index)
    
    // 触发自定义回调
    if (this.callbacks.onPathUpdated) {
      this.callbacks.onPathUpdated(updatedPoints)
    }
  }
  
  /**
   * 加载禁飞区
   */
  async loadNoFlyZones() {
    try {
      this.noFlyZones = await loadNoFlyZones(this.config.noFlyZoneApiUrl)
      
      // 绘制禁飞区
      this.noFlyOverlays = drawNoFlyZones(this.map, this.noFlyZones)
      
      // 检测是否穿越禁飞区
      this.checkNoFlyZoneViolation()
      
      console.log('✅ 禁飞区加载完成，数量:', this.noFlyZones.length)
    } catch (error) {
      console.error('加载禁飞区失败:', error)
    }
  }
  
  /**
   * 加载天气信息
   */
  async loadWeather() {
    try {
      if (this.pathPoints.length === 0) return
      
      // 获取路径中点坐标
      const midIndex = Math.floor(this.pathPoints.length / 2)
      const midPoint = this.pathPoints[midIndex]
      
      // 获取天气信息
      this.weatherInfo = await fetchWeatherInfo(
        midPoint.lng,
        midPoint.lat,
        this.config.weatherApiKey
      )
      
      // 检查天气警告
      const weatherWarnings = checkWeatherWarning(this.weatherInfo)
      
      // 获取飞行适宜度评分
      const suitabilityScore = getFlightSuitabilityScore(this.weatherInfo)
      
      // 更新警告信息
      this.updateWarnings(weatherWarnings, suitabilityScore)
      
      console.log('✅ 天气信息加载完成:', this.weatherInfo)
    } catch (error) {
      console.error('加载天气信息失败:', error)
    }
  }
  
  /**
   * 检查禁飞区违规
   */
  checkNoFlyZoneViolation() {
    if (!this.pathPoints || !this.noFlyZones) return
    
    const result = checkNoFlyZoneIntersection(this.pathPoints, this.noFlyZones)
    
    if (result.hasViolation) {
      const noFlyWarning = generateNoFlyWarning(result.violations)
      this.addWarning(noFlyWarning)
    }
    
    return result
  }
  
  /**
   * 更新警告信息
   */
  updateWarnings(weatherWarnings, suitabilityScore) {
    this.warnings = [...weatherWarnings]
    
    if (suitabilityScore.score < 60) {
      this.warnings.push(`⚠️ 飞行适宜度评分：${suitabilityScore.score}分 - ${suitabilityScore.suggestion}`)
    }
    
    // 触发警告变化回调
    if (this.callbacks.onWarningsChanged) {
      this.callbacks.onWarningsChanged(this.warnings, this.weatherInfo, suitabilityScore)
    }
  }
  
  /**
   * 添加警告
   */
  addWarning(warning) {
    if (!this.warnings.includes(warning)) {
      this.warnings.push(warning)
      
      // 触发警告变化回调
      if (this.callbacks.onWarningsChanged) {
        this.callbacks.onWarningsChanged(this.warnings, this.weatherInfo)
      }
    }
  }
  
  /**
   * 清除所有警告
   */
  clearWarnings() {
    this.warnings = []
    
    if (this.callbacks.onWarningsChanged) {
      this.callbacks.onWarningsChanged([], null, null)
    }
  }
  
  /**
   * 刷新所有数据
   */
  async refresh() {
    console.log('🔄 刷新路径规划数据...')
    
    // 清除旧数据
    this.clearOldMarkers()
    
    // 重新创建标记
    if (this.config.enableDraggableMarkers) {
      this.createDraggableMarkers()
    }
    
    // 重新加载天气
    if (this.config.autoLoadWeather) {
      await this.loadWeather()
    }
    
    // 重新检测禁飞区
    this.checkNoFlyZoneViolation()
  }
  
  /**
   * 销毁管理器
   */
  destroy() {
    console.log('🗑️ 销毁路径规划增强管理器')
    
    // 清除标记
    this.clearOldMarkers()
    
    // 清除禁飞区覆盖物
    if (this.noFlyOverlays.length > 0) {
      this.noFlyOverlays.forEach(overlay => {
        this.map?.removeOverlay(overlay)
      })
      this.noFlyOverlays = []
    }
    
    // 清空引用
    this.map = null
    this.pathPoints = []
    this.noFlyZones = []
    this.weatherInfo = null
    this.warnings = []
  }
}

/**
 * 创建路径规划增强管理器的辅助函数
 */
export const createPathPlanningEnhanced = (options) => {
  return new PathPlanningEnhancedManager(options)
}

/**
 * 默认导出
 */
export default {
  PathPlanningEnhancedManager,
  createPathPlanningEnhanced
}
