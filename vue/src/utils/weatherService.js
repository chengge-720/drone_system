/**
 * 天气信息服务模块
 * 提供实时天气数据获取和飞行安全警告功能
 */

/**
 * 获取天气信息
 * @param {Number} lng - 经度
 * @param {Number} lat - 纬度
 * @param {String} apiKey - 和风天气 API key（可选，不提供则使用模拟数据）
 * @returns {Promise<Object>} 天气信息对象
 */
export const fetchWeatherInfo = async (lng, lat, apiKey = null) => {
  try {
    // 如果没有提供 API key，使用模拟数据
    if (!apiKey) {
      console.log('⚠️ 未配置天气 API key，使用模拟数据')
      return {
        temperature: 25,
        windSpeed: 3.5,
        windDirection: '东南',
        humidity: 65,
        condition: '晴'
      }
    }
    
    // 使用和风天气 API
    const url = `https://devapi.qweather.com/v7/weather/now?location=${lng},${lat}&key=${apiKey}`
    
    const response = await fetch(url)
    const data = await response.json()
    
    if (data.code === '200') {
      return {
        temperature: parseFloat(data.now.temp),
        windSpeed: parseFloat(data.now.windSpeed),
        windDirection: data.now.windDir,
        humidity: parseFloat(data.now.humidity),
        condition: data.now.text
      }
    } else {
      console.warn('天气 API 调用失败:', data)
      return getMockWeatherData()
    }
  } catch (error) {
    console.error('获取天气信息失败:', error)
    return getMockWeatherData()
  }
}

/**
 * 获取模拟天气数据（用于测试或 API 不可用时）
 * @returns {Object} 模拟天气数据
 */
const getMockWeatherData = () => {
  // 根据当前时间生成不同的模拟数据
  const hour = new Date().getHours()
  
  if (hour >= 6 && hour < 18) {
    // 白天
    return {
      temperature: 25 + Math.random() * 5,
      windSpeed: 2 + Math.random() * 3,
      windDirection: ['东', '南', '西', '北'][Math.floor(Math.random() * 4)],
      humidity: 50 + Math.random() * 20,
      condition: ['晴', '多云', '阴'][Math.floor(Math.random() * 3)]
    }
  } else {
    // 夜晚
    return {
      temperature: 20 + Math.random() * 3,
      windSpeed: 1 + Math.random() * 2,
      windDirection: ['东', '南', '西', '北'][Math.floor(Math.random() * 4)],
      humidity: 60 + Math.random() * 15,
      condition: ['晴', '多云'][Math.floor(Math.random() * 2)]
    }
  }
}

/**
 * 检查天气警告
 * @param {Object} weatherInfo - 天气信息对象
 * @returns {Array} 警告信息数组
 */
export const checkWeatherWarning = (weatherInfo) => {
  if (!weatherInfo) return []
  
  const warnings = []
  
  // 风速警告
  if (weatherInfo.windSpeed > 8) {
    warnings.push(`⚠️ 强风警告：风速${weatherInfo.windSpeed.toFixed(1)}m/s，建议取消飞行`)
  } else if (weatherInfo.windSpeed > 5) {
    warnings.push(`⚠️ 大风注意：风速${weatherInfo.windSpeed.toFixed(1)}m/s，谨慎飞行`)
  }
  
  // 温度警告
  if (weatherInfo.temperature > 35) {
    warnings.push(`⚠️ 高温警告：温度${weatherInfo.temperature.toFixed(1)}°C，注意电池过热`)
  } else if (weatherInfo.temperature < 0) {
    warnings.push(`⚠️ 低温警告：温度${weatherInfo.temperature.toFixed(1)}°C，电池性能下降`)
  }
  
  // 湿度警告
  if (weatherInfo.humidity > 90) {
    warnings.push(`⚠️ 高湿警告：湿度${weatherInfo.humidity.toFixed(0)}%，注意电子设备安全`)
  }
  
  return warnings
}

/**
 * 获取飞行适宜度评分（0-100）
 * @param {Object} weatherInfo - 天气信息对象
 * @returns {Object} 包含评分和建议的对象
 */
export const getFlightSuitabilityScore = (weatherInfo) => {
  if (!weatherInfo) return { score: 50, suggestion: '天气数据不可用' }
  
  let score = 100
  
  // 风速影响（最大扣 40 分）
  if (weatherInfo.windSpeed > 8) {
    score -= 40
  } else if (weatherInfo.windSpeed > 5) {
    score -= 25
  } else if (weatherInfo.windSpeed > 3) {
    score -= 10
  }
  
  // 温度影响（最大扣 30 分）
  if (weatherInfo.temperature > 35 || weatherInfo.temperature < 0) {
    score -= 30
  } else if (weatherInfo.temperature > 30 || weatherInfo.temperature < 5) {
    score -= 15
  }
  
  // 湿度影响（最大扣 20 分）
  if (weatherInfo.humidity > 90) {
    score -= 20
  } else if (weatherInfo.humidity > 80) {
    score -= 10
  }
  
  // 生成建议
  let suggestion = ''
  if (score >= 80) {
    suggestion = '✅ 适宜飞行'
  } else if (score >= 60) {
    suggestion = '⚠️ 可以飞行，但需注意安全'
  } else if (score >= 40) {
    suggestion = '⚠️ 不建议飞行'
  } else {
    suggestion = '❌ 禁止飞行'
  }
  
  return { score, suggestion }
}

/**
 * 默认导出所有方法
 */
export default {
  fetchWeatherInfo,
  checkWeatherWarning,
  getFlightSuitabilityScore
}
