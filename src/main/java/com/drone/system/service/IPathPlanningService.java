package com.drone.system.service;

import java.util.List;
import java.util.Map;

/**
 * 无人机路径规划服务接口
 */
public interface IPathPlanningService {
    
    /**
     * 基于强化学习(DDPG) 的路径规划（通过 Flask HTTP API 调用 Python 服务）
     * @param startPoint 起点坐标 [lat, lon, alt(m)]
     * @param endPoint 终点坐标 [lat, lon, alt(m)]
     * @param obstacles 障碍物列表
     * @param gridSize 网格大小
     * @return 路径规划结果
     */
    Map<String, Object> planPath(List<Double> startPoint, List<Double> endPoint,
                                  List<Map<String, Object>> obstacles, Integer gridSize, Boolean qOnly,
                                  Boolean stochasticInference, Double inferenceNoiseSigma,
                                  Boolean disableAutoFallbackRetry, Integer missionId, String taskKey,
                                  Boolean replayCachedPath);

    /**
     * 在 Python 2.5D 建筑栅格上规划 A* 或 GA 路径（与 RL 同环境、同巡航高度）
     * @param algorithm astar | ga
     */
    Map<String, Object> planGridPath(List<Double> startPoint, List<Double> endPoint,
                                     List<Map<String, Object>> obstacles, Integer gridSize,
                                     Integer missionId, String taskKey, String algorithm);
    
    /**
     * 路径优化
     * @param path 原始路径点列表
     * @return 优化后的路径
     */
    Map<String, Object> optimizePath(List<List<Double>> path);
    
    /**
     * 健康检查 - 检查 Python 服务是否可用
     * @return 服务状态
     */
    Map<String, Object> checkServiceHealth();

    /**
     * 获取强化学习模型生成的图表（Base64 png）
     * @param name training_progress | uav_trajectory | current_trajectory | uav_environment
     */
    Map<String, Object> getRlPlot(String name, Integer missionId, String taskKey);

    /**
     * 按任务起终点在 Python 端训练 Q 表（南昌市建筑矢量栅格）
     */
    Map<String, Object> trainTaskModel(Map<String, Object> params);

    /**
     * 查询任务 Q 表是否已训练
     */
    Map<String, Object> getTaskModelStatus(String taskKey);

    /**
     * 调用 Python 生成起点–终点走廊内建筑的三维 ENU 图（images/uav_environment.png）
     */
    Map<String, Object> generateUavEnvironmentPlot(Map<String, Object> params);

    /**
     * 批量评估同一组推理参数下的稳定性（到达率/碰撞率/平均步数等）
     */
    Map<String, Object> evalBatch(Map<String, Object> params);

    /**
     * 保存 Java 端算法路径到 JSON（供 Python 训练可视化对比读取）
     */
    Map<String, Object> saveExternalAlgorithmPath(Map<String, Object> params);

    /**
     * 基于已有 Q 表与已导出的 Java A*和GA 路径，重新生成 Python 对比图
     */
    Map<String, Object> regenerateRlComparisonPlots(Map<String, Object> params);

    /**
     * 基于任务 Q 表与已导出的 A*GA 路径，重新生成下对比图
     */
    Map<String, Object> regenerateTaskRlPlots(Map<String, Object> params);
}
