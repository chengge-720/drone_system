package com.drone.system.controller;

import com.drone.system.domain.AjaxResult;
import com.drone.system.service.IPathPlanningService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import jakarta.annotation.Resource;
import java.util.List;
import java.util.Map;

/**
 * 路径规划控制器
 */
@RestController
@RequestMapping("/api/path")
@CrossOrigin
public class PathPlanningController extends BaseController {

    private static final Logger log = LoggerFactory.getLogger(PathPlanningController.class);
    
    @Resource
    private IPathPlanningService pathPlanningService;
    
    /**
     * 基于强化学习（Python 2.5D Q-learning + 建筑 SHP）的路径规划（Flask HTTP）
     * @param params 请求参数
     * @return 路径规划结果
     */
    @PostMapping("/plan")
    public AjaxResult planPath(@RequestBody Map<String, Object> params) {
        try {
            // 获取起点和终点
            @SuppressWarnings("unchecked")
            List<Object> startPointRaw = (List<Object>) params.get("startPoint");
            @SuppressWarnings("unchecked")
            List<Object> endPointRaw = (List<Object>) params.get("endPoint");
            
            if (startPointRaw == null || endPointRaw == null) {
                return error("缺少必需参数: startPoint 和 endPoint");
            }

            List<Double> startPoint = toDoubleList(startPointRaw);
            List<Double> endPoint = toDoubleList(endPointRaw);
            if (startPoint.size() < 2 || endPoint.size() < 2) {
                return error("startPoint/endPoint 格式错误，必须至少包含 [lat, lon, alt?]");
            }
            
            // 获取可选参数
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> obstacles = (List<Map<String, Object>>) params.get("obstacles");
            Integer gridSize = params.get("gridSize") != null ? 
                ((Number) params.get("gridSize")).intValue() : null;
            Boolean qOnly = params.get("qOnly") != null ?
                Boolean.valueOf(String.valueOf(params.get("qOnly"))) : null;
            Boolean stochasticInference = params.get("stochasticInference") != null ?
                Boolean.valueOf(String.valueOf(params.get("stochasticInference"))) : null;
            Double inferenceNoiseSigma = params.get("inferenceNoiseSigma") != null ?
                ((Number) params.get("inferenceNoiseSigma")).doubleValue() : null;
            Boolean disableAutoFallbackRetry = params.get("disableAutoFallbackRetry") != null ?
                Boolean.valueOf(String.valueOf(params.get("disableAutoFallbackRetry"))) : null;
            Integer missionId = params.get("missionId") != null ?
                ((Number) params.get("missionId")).intValue() : null;
            String taskKey = params.get("taskKey") != null ?
                String.valueOf(params.get("taskKey")).trim() : null;
            Boolean replayCachedPath = params.get("replayCachedPath") != null ?
                Boolean.valueOf(String.valueOf(params.get("replayCachedPath"))) : null;

            // 调用路径规划服务
            Map<String, Object> result = pathPlanningService.planPath(
                startPoint, endPoint, obstacles, gridSize, qOnly, stochasticInference, inferenceNoiseSigma,
                disableAutoFallbackRetry, missionId, taskKey, replayCachedPath
            );
            
            boolean ok = Boolean.TRUE.equals(result.get("success"));
            boolean hasPath = result.get("path") instanceof List<?> && !((List<?>) result.get("path")).isEmpty();
            if (ok || hasPath) {
                return success(result);
            } else {
                return error(result.get("error").toString());
            }
            
        } catch (Exception e) {
            log.error("路径规划失败", e);
            return error("路径规划失败: " + e.getMessage());
        }
    }

    /**
     * Python 2.5D 栅格 A* / GA 路径规划（与 RL 同建筑 SHP 环境）
     */
    @PostMapping("/plan-grid")
    public AjaxResult planGridPath(@RequestBody Map<String, Object> params) {
        try {
            @SuppressWarnings("unchecked")
            List<Object> startPointRaw = (List<Object>) params.get("startPoint");
            @SuppressWarnings("unchecked")
            List<Object> endPointRaw = (List<Object>) params.get("endPoint");
            if (startPointRaw == null || endPointRaw == null) {
                return error("缺少必需参数: startPoint 和 endPoint");
            }
            List<Double> startPoint = toDoubleList(startPointRaw);
            List<Double> endPoint = toDoubleList(endPointRaw);
            if (startPoint.size() < 2 || endPoint.size() < 2) {
                return error("startPoint/endPoint 格式错误");
            }
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> obstacles = (List<Map<String, Object>>) params.get("obstacles");
            Integer gridSize = params.get("gridSize") != null ?
                    ((Number) params.get("gridSize")).intValue() : null;
            Integer missionId = params.get("missionId") != null ?
                    ((Number) params.get("missionId")).intValue() : null;
            String taskKey = params.get("taskKey") != null ?
                    String.valueOf(params.get("taskKey")).trim() : null;
            String algorithm = params.get("algorithm") != null ?
                    String.valueOf(params.get("algorithm")) : "astar";

            Map<String, Object> result = pathPlanningService.planGridPath(
                    startPoint, endPoint, obstacles, gridSize, missionId, taskKey, algorithm);
            boolean ok = Boolean.TRUE.equals(result.get("success"));
            boolean hasPath = result.get("path") instanceof List<?> && !((List<?>) result.get("path")).isEmpty();
            if (ok || hasPath) {
                return success(result);
            }
            return error(String.valueOf(result.getOrDefault("error", "栅格路径规划失败")));
        } catch (Exception e) {
            log.error("栅格路径规划失败", e);
            return error("栅格路径规划失败: " + e.getMessage());
        }
    }

    private static List<Double> toDoubleList(List<Object> raw) {
        List<Double> out = new java.util.ArrayList<>();
        if (raw == null) return out;
        for (Object v : raw) {
            if (v == null) {
                out.add(null);
            } else if (v instanceof Number) {
                out.add(((Number) v).doubleValue());
            } else {
                // 尝试字符串转数值
                try {
                    out.add(Double.parseDouble(String.valueOf(v)));
                } catch (Exception ex) {
                    out.add(null);
                }
            }
        }
        return out;
    }
    
    /**
     * 路径优化
     * @param params 请求参数 (包含 path 字段)
     * @return 优化后的路径
     */
    @PostMapping("/optimize")
    public AjaxResult optimizePath(@RequestBody Map<String, Object> params) {
        try {
            @SuppressWarnings("unchecked")
            List<List<Double>> path = (List<List<Double>>) params.get("path");
            
            if (path == null || path.isEmpty()) {
                return error("缺少路径数据");
            }
            
            Map<String, Object> result = pathPlanningService.optimizePath(path);
            
            if ((Boolean) result.get("success")) {
                return success(result);
            } else {
                return error(result.get("error").toString());
            }
            
        } catch (Exception e) {
            log.error("路径优化失败", e);
            return error("路径优化失败: " + e.getMessage());
        }
    }
    
    /**
     * 检查 Python 路径规划服务状态
     * @return 服务状态
     */
    @GetMapping("/service-status")
    public AjaxResult checkServiceStatus() {
        try {
            Map<String, Object> status = pathPlanningService.checkServiceHealth();
            return success(status);
        } catch (Exception e) {
            log.error("检查服务状态失败", e);
            return error("检查服务状态失败: " + e.getMessage());
        }
    }

    /**
     * 获取强化学习模型生成的图表（Base64 png），用于前端展示
     */
    @GetMapping("/rl/plot")
    public AjaxResult getRlPlot(
            @RequestParam(value = "name", required = false) String name,
            @RequestParam(value = "missionId", required = false) Integer missionId,
            @RequestParam(value = "taskKey", required = false) String taskKey) {
        try {
            Map<String, Object> result = pathPlanningService.getRlPlot(name, missionId, taskKey);
            if (Boolean.TRUE.equals(result.get("success"))) {
                return success(result);
            }
            return error(result.get("error") != null ? result.get("error").toString() : "获取图表失败");
        } catch (Exception e) {
            log.error("获取图表失败", e);
            return error("获取图表失败: " + e.getMessage());
        }
    }

    /**
     * 生成起点–终点 100m 走廊内建筑的三维 ENU 示意图（Python 写入 images/uav_environment.png）
     */
    @PostMapping("/uav-environment-plot")
    public AjaxResult generateUavEnvironmentPlot(@RequestBody Map<String, Object> params) {
        try {
            Map<String, Object> result = pathPlanningService.generateUavEnvironmentPlot(params);
            if (Boolean.TRUE.equals(result.get("success"))) {
                return success(result);
            }
            return error(result.get("error") != null ? result.get("error").toString() : "生成环境图失败");
        } catch (Exception e) {
            log.error("生成 UAV 环境图失败", e);
            return error("生成环境图失败: " + e.getMessage());
        }
    }

    /**
     * 批量评估（同一请求参数下执行 N 次推理），返回到达率/碰撞率等统计
     */
    @PostMapping("/eval-batch")
    public AjaxResult evalBatch(@RequestBody Map<String, Object> params) {
        try {
            Map<String, Object> result = pathPlanningService.evalBatch(params);
            if (Boolean.TRUE.equals(result.get("success"))) {
                return success(result.get("data"));
            }
            return error(result.get("error") != null ? result.get("error").toString() : "批量评估失败");
        } catch (Exception e) {
            log.error("批量评估失败", e);
            return error("批量评估失败: " + e.getMessage());
        }
    }

    @PostMapping("/export-external-path")
    public AjaxResult exportExternalPath(@RequestBody Map<String, Object> params) {
        try {
            Map<String, Object> result = pathPlanningService.saveExternalAlgorithmPath(params);
            if (Boolean.TRUE.equals(result.get("success"))) {
                return success(result);
            }
            return error(result.get("error") != null ? result.get("error").toString() : "导出路径失败");
        } catch (Exception e) {
            log.error("导出外部算法路径失败", e);
            return error("导出外部算法路径失败: " + e.getMessage());
        }
    }

    @PostMapping("/regenerate-rl-plots")
    public AjaxResult regenerateRlPlots(@RequestBody Map<String, Object> params) {
        try {
            Map<String, Object> result = pathPlanningService.regenerateRlComparisonPlots(params);
            if (Boolean.TRUE.equals(result.get("success"))) {
                return success(result);
            }
            return error(result.get("error") != null ? result.get("error").toString() : "重新生成对比图失败");
        } catch (Exception e) {
            log.error("重新生成对比图失败", e);
            return error("重新生成对比图失败: " + e.getMessage());
        }
    }

    @PostMapping("/regenerate-task-plots")
    public AjaxResult regenerateTaskRlPlots(@RequestBody Map<String, Object> params) {
        try {
            Map<String, Object> result = pathPlanningService.regenerateTaskRlPlots(params);
            if (Boolean.TRUE.equals(result.get("success"))) {
                return success(result);
            }
            return error(result.get("error") != null ? result.get("error").toString() : "重新生成任务对比图失败");
        } catch (Exception e) {
            log.error("重新生成任务对比图失败", e);
            return error("重新生成任务对比图失败: " + e.getMessage());
        }
    }

    @PostMapping("/final-path-package")
    public AjaxResult finalPathPackage(@RequestBody Map<String, Object> params) {
        try {
            log.info("三算法最终路径信息包: {}", params);
            return success();
        } catch (Exception e) {
            log.error("最终路径信息包写入失败", e);
            return error("最终路径信息包写入失败: " + e.getMessage());
        }
    }

    @PostMapping("/train-task")
    public AjaxResult trainTaskModel(@RequestBody Map<String, Object> params) {
        try {
            Map<String, Object> result = pathPlanningService.trainTaskModel(params);
            if (Boolean.TRUE.equals(result.get("success"))) {
                return success(result);
            }
            return error(result.get("error") != null ? result.get("error").toString() : "任务 Q 表训练失败");
        } catch (Exception e) {
            log.error("任务 Q 表训练失败", e);
            return error("任务 Q 表训练失败: " + e.getMessage());
        }
    }

    @GetMapping("/task-model-status")
    public AjaxResult getTaskModelStatus(@RequestParam("taskKey") String taskKey) {
        try {
            Map<String, Object> result = pathPlanningService.getTaskModelStatus(taskKey);
            if (Boolean.TRUE.equals(result.get("success"))) {
                return success(result);
            }
            return error(result.get("error") != null ? result.get("error").toString() : "查询任务模型状态失败");
        } catch (Exception e) {
            log.error("查询任务模型状态失败", e);
            return error("查询任务模型状态失败: " + e.getMessage());
        }
    }
}
