import request from '@/utils/request'

/**
 * 路径规划 - 基于 Q-Learning
 * @param {Object} data - 路径规划参数
 * @param {Array} data.startPoint - 起点坐标 [lat, lon, alt]
 * @param {Array} data.endPoint - 终点坐标 [lat, lon, alt]
 * @param {Array} data.obstacles - 障碍物列表 (可选)
 * @param {Number} data.gridSize - 网格大小 (可选)
 */
export function planPath(data) {
  return request({
    url: '/api/path/plan',
    method: 'post',
    timeout: 180000,
    data: data
  })
}

/**
 * Python 2.5D 栅格 A* / GA（与 RL 同建筑避障环境）
 * @param {Object} data
 * @param {string} data.algorithm - astar | ga
 */
export function planGridPath(data) {
  return request({
    url: '/api/path/plan-grid',
    method: 'post',
    timeout: 180000,
    data
  })
}

/**
 * 按任务起终点在线训练 Q 表（Python 南昌市建筑矢量栅格）
 */
export function trainTaskRlModel(data) {
  return request({
    url: '/api/path/train-task',
    method: 'post',
    timeout: 900000,
    data
  })
}

/**
 * 查询任务 Q 表是否已训练
 */
export function getTaskRlModelStatus(taskKey) {
  return request({
    url: '/api/path/task-model-status',
    method: 'get',
    params: { taskKey }
  })
}

/**
 * 路径优化
 * @param {Object} data - 优化参数
 * @param {Array} data.path - 路径点列表
 */
export function optimizePath(data) {
  return request({
    url: '/api/path/optimize',
    method: 'post',
    data: data
  })
}

/**
 * 检查路径规划服务状态
 */
export function checkServiceStatus() {
  return request({
    url: '/api/path/service-status',
    method: 'get'
  })
}

/**
 * 生成走廊内建筑三维 ENU 图（Python → images/uav_environment.png）
 * @param {Object} data - startPoint/endPoint [lat,lon,alt]，obstacles，corridor_width_m
 */
export function generateUavEnvironmentPlot(data) {
  return request({
    url: '/api/path/uav-environment-plot',
    method: 'post',
    data
  })
}

/**
 * 导出 Java 端算法路径（GA/A*）供 Python 训练对比读取
 * @param {Object} data
 * @param {String} data.algorithm - GA | ASTAR
 * @param {Number} data.missionId
 * @param {Array} data.path - [[lat, lon, alt], ...] 或 [{lat,lng,alt}, ...]
 */
export function exportExternalPath(data) {
  return request({
    url: '/api/path/export-external-path',
    method: 'post',
    timeout: 30000,
    data
  })
}

/**
 * 基于已导出 Java 端 A* / GA 路径，重新生成 Python 三算法对比图
 * @param {Object} data
 * @param {Number} data.missionId - Python offline mission 编号 (1-5)
 */
export function regenerateRlPlots(data) {
  return request({
    url: '/api/path/regenerate-rl-plots',
    method: 'post',
    timeout: 180000,
    data
  })
}

export function regenerateTaskRlPlots(data) {
  return request({
    url: '/api/path/regenerate-task-plots',
    method: 'post',
    timeout: 180000,
    data
  })
}

export function logFinalPathPackage(data) {
  return request({
    url: '/api/path/final-path-package',
    method: 'post',
    timeout: 8000,
    data
  })
}

/**
 * 获取 Python 生成的算法对比图（支持 mission 子目录）
 * @param {string} name 图表名（不含扩展名）
 * @param {number} [missionId] 任务 ID，对应 images/mission_<id>/
 * @param {string} [ext] png | gif
 */
export function getRlPlot(name, missionId = 0, ext = 'png', taskKey = '') {
  return request({
    url: '/api/path/rl/plot',
    method: 'get',
    params: {
      name,
      missionId: missionId > 0 ? missionId : undefined,
      taskKey: taskKey ? String(taskKey) : undefined,
      ext: ext !== 'png' ? ext : undefined,
      _ts: Date.now()
    }
  })
}
