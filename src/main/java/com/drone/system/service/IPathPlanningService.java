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
                                  Boolean disableAutoFallbackRetry, Integer missionId);
    
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
    Map<String, Object> getRlPlot(String name, Integer missionId);

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
}
