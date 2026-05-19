package com.drone.system.service.impl;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.alibaba.fastjson2.JSONWriter;
import com.drone.system.service.IPathPlanningService;
import com.drone.system.util.PathPlanningOfflineMission;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriUtils;

import java.util.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 路径规划服务实现类 - 调用 Python 强化学习（2.5D Q-learning + SHP 建筑栅格）服务
 */
@Service
public class PathPlanningServiceImpl implements IPathPlanningService {
    
    private static final Logger log = LoggerFactory.getLogger(PathPlanningServiceImpl.class);
    
    @Value("${python.path-planning.url:http://localhost:5000}")
    private String pythonServiceUrl;
    
    private final RestTemplate restTemplate = new RestTemplate();

    // WGS84 近似半径（米）
    private static final double EARTH_RADIUS_M = 6378137.0;
    
    @Override
    public Map<String, Object> planPath(List<Double> startPoint, List<Double> endPoint,
                                        List<Map<String, Object>> obstacles, Integer gridSize, Boolean qOnly,
                                        Boolean stochasticInference, Double inferenceNoiseSigma,
                                        Boolean disableAutoFallbackRetry, Integer missionId) {
        try {
            final boolean requestedQOnly = qOnly != null && qOnly;
            final boolean offlineMissionMode = missionId != null && missionId > 0 && requestedQOnly;

            log.info("开始路径规划(RL) missionId={} qOnly={} offlineAligned={} 起点={} 终点={}",
                    missionId, qOnly, offlineMissionMode, startPoint, endPoint);

            if (startPoint.size() < 2 || endPoint.size() < 2) {
                Map<String, Object> errorResult = new HashMap<>();
                errorResult.put("success", false);
                errorResult.put("error", "起点/终点坐标格式错误，必须至少包含 [lat, lon, alt?]");
                return errorResult;
            }

            double startLat = startPoint.get(0);
            double startLon = startPoint.get(1);
            double startAlt = startPoint.size() >= 3 && startPoint.get(2) != null ? startPoint.get(2) : 0.0;

            double goalLat = endPoint.get(0);
            double goalLon = endPoint.get(1);
            double goalAlt = endPoint.size() >= 3 && endPoint.get(2) != null ? endPoint.get(2) : startAlt;

            GridTransform grid = buildGridTransform(
                    startLat, startLon, startAlt, goalLat, goalLon, goalAlt, gridSize, missionId, offlineMissionMode,
                    startLat, startLon, startAlt, goalLat, goalLon, goalAlt);

            double startX = grid.startX;
            double startY = grid.startY;
            double startZ = grid.startZ;
            double goalX = grid.goalX;
            double goalY = grid.goalY;
            double goalZ = grid.goalZ;
            int gridN = grid.gridN;
            int margin = grid.margin;
            double xyScaleMPerGrid = grid.xyScaleMPerGrid;
            double zScaleMPerGrid = grid.zScaleMPerGrid;
            double originLat = grid.originLat;
            double originLon = grid.originLon;
            double originLatRad = grid.originLatRad;
            double centerX = grid.centerX;
            double centerY = grid.centerY;
            if (grid.trainingAnchorApplied) {
                startLat = grid.trainStartLat;
                startLon = grid.trainStartLon;
                startAlt = grid.trainStartAlt;
                goalLat = grid.trainGoalLat;
                goalLon = grid.trainGoalLon;
                goalAlt = grid.trainGoalAlt;
            }

            // 构建 Python 请求体（DDPG API: /api/plan）
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("start_position", Arrays.asList(startX, startY, startZ));
            requestBody.put("goal_position", Arrays.asList(goalX, goalY, goalZ));
            // 默认不生成随机障碍物，避免与真实地图环境不一致导致“到不了终点/路径杂乱”
            requestBody.put("obstacle_count", 0);
            // 给强化学习推理更充足的步数，降低“走不到终点”的概率
            requestBody.put("max_steps", 2200);
            final boolean stoch = stochasticInference != null && stochasticInference;
            final double sigmaInput = inferenceNoiseSigma != null ? Math.max(0.0, Math.min(0.5, inferenceNoiseSigma)) : 0.0;
            // 工程排查档：开启随机探索时，自动给适度目标引导与更宽容判定半径，优先验证“可逃逸稳定碰撞”
            final double inferGoalScale = stoch ? 1.20 : 1.05;
            final double sigma = stoch ? Math.max(0.15, sigmaInput) : sigmaInput;
            final double goalGuidance = stoch ? 0.25 : 0.0;
            final int planTrials = stoch ? 12 : 1;
            requestBody.put("infer_goal_scale", inferGoalScale);
            requestBody.put("stochastic_inference", stoch);
            requestBody.put("inference_noise_sigma", sigma);
            requestBody.put("goal_guidance_strength", goalGuidance);
            requestBody.put("plan_trials", planTrials);
            // 离线 mission+q_only：Java 已按 offline_train 口径算好网格，禁止 Python 再用 meta 覆盖尺度（避免起终点与栅格不一致）
            requestBody.put("use_model_meta_scaling", !offlineMissionMode);
            requestBody.put("q_only", requestedQOnly);
            if (offlineMissionMode) {
                requestBody.put("offline_grid_aligned", true);
                requestBody.put("obstacle_clearance_m", 45.0);
            }
            if (missionId != null && missionId > 0) {
                requestBody.put("mission_id", missionId);
            }

            // 与 Python 2.5D 栅格对齐：网格尺度、经纬度、50m 净空、立方体障碍（百度建筑等）
            requestBody.put("grid_n", gridN);
            requestBody.put("margin", margin);
            requestBody.put("xy_scale_m_per_grid", xyScaleMPerGrid);
            requestBody.put("z_scale_m_per_grid", zScaleMPerGrid);
            if (offlineMissionMode && grid.trainingAnchorApplied) {
                requestBody.put("user_start_lat", grid.userStartLat);
                requestBody.put("user_start_lon", grid.userStartLon);
                requestBody.put("user_start_alt", grid.userStartAlt);
                requestBody.put("user_goal_lat", grid.userGoalLat);
                requestBody.put("user_goal_lon", grid.userGoalLon);
                requestBody.put("user_goal_alt", grid.userGoalAlt);
            }
            requestBody.put("start_lat", startLat);
            requestBody.put("start_lon", startLon);
            requestBody.put("start_alt", startAlt);
            requestBody.put("goal_lat", goalLat);
            requestBody.put("goal_lon", goalLon);
            requestBody.put("goal_alt", goalAlt);
            requestBody.put("origin_lat", originLat);
            requestBody.put("origin_lon", originLon);
            if (!offlineMissionMode) {
                requestBody.put("obstacle_clearance_m", 50.0);
            }
            List<Map<String, Object>> pyCubes = buildPythonCubeObstacles(
                    obstacles, originLat, originLon, originLatRad, xyScaleMPerGrid, zScaleMPerGrid, centerX, centerY, gridN);
            if (pyCubes != null && !pyCubes.isEmpty()) {
                requestBody.put("obstacle_cubes", pyCubes);
                log.info("RL 下发立方体障碍 {} 个（可与 SHP 柱元栅格合并）", pyCubes.size());
            }
            if (offlineMissionMode) {
                log.info("离线Q表使用训练锚点 mission={} {}（用户起终点仅作对照，Python 侧将再次对齐）",
                        missionId, grid.missionName);
            }

            // 设置请求头
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

            String url = pythonServiceUrl + "/api/plan";

            ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);
            
            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                JSONObject jsonResponse = JSON.parseObject(response.getBody());

                Boolean initialOk = jsonResponse.getBoolean("success");
                // 若用户误开“纯 RL”导致失败，自动重试一次混合模式（启用传统回退），提升可达率。
                if ((initialOk == null || !initialOk) && requestedQOnly && !Boolean.TRUE.equals(disableAutoFallbackRetry)) {
                    try {
                        log.warn("纯RL(q_only=true) 首次推理失败，自动重试混合模式(q_only=false)");
                        requestBody.put("q_only", false);
                        HttpEntity<Map<String, Object>> retryEntity = new HttpEntity<>(requestBody, headers);
                        ResponseEntity<String> retryResponse = restTemplate.postForEntity(url, retryEntity, String.class);
                        if (retryResponse.getStatusCode() == HttpStatus.OK && retryResponse.getBody() != null) {
                            JSONObject retryJson = JSON.parseObject(retryResponse.getBody());
                            Boolean retryOk = retryJson.getBoolean("success");
                            JSONObject retryData = retryJson.getJSONObject("data");
                            if (Boolean.TRUE.equals(retryOk) || retryData != null) {
                                jsonResponse = retryJson;
                                jsonResponse.put("auto_fallback_retry_from_q_only", true);
                            }
                        }
                    } catch (Exception retryEx) {
                        log.warn("纯RL失败后的混合模式重试异常: {}", retryEx.getMessage());
                    }
                }
                
                // 解析响应
                Map<String, Object> result = new HashMap<>();
                Boolean ok = jsonResponse.getBoolean("success");
                result.put("success", ok != null && ok);
                result.put("autoFallbackRetryFromQOnly", Boolean.TRUE.equals(jsonResponse.getBoolean("auto_fallback_retry_from_q_only")));
                
                JSONObject data = jsonResponse.getJSONObject("data");
                if (data != null) {

                    // Python path: [[x,y,z], ...] -> 转回 [lat, lon, alt]
                    List<List<Double>> pathLatLonAlt = new ArrayList<>();
                    List<?> path = data.getList("path", Object.class);
                    if (path != null) {
                        for (Object p : path) {
                            if (!(p instanceof List)) continue;
                            @SuppressWarnings("unchecked")
                            List<Object> xyz = (List<Object>) p;
                            if (xyz.size() < 3) continue;
                            double x = ((Number) xyz.get(0)).doubleValue();
                            double y = ((Number) xyz.get(1)).doubleValue();
                            double z = ((Number) xyz.get(2)).doubleValue();
                            pathLatLonAlt.add(grid.latLonAltFromGrid(x, y, z));
                        }
                    }

                    double totalDistanceM = computePathDistanceMeters(pathLatLonAlt);
                    double avgSpeedMps = 10.0;
                    double estimatedTimeS = totalDistanceM / avgSpeedMps;

                    result.put("path", pathLatLonAlt);
                    result.put("totalDistance", totalDistanceM);
                    result.put("estimatedTime", estimatedTimeS);
                    String algo = data.getString("algorithm");
                    result.put("algorithm", (algo != null && !algo.isBlank()) ? algo : "RL");
                    result.put("iterations", data.getInteger("steps"));
                    result.put("collision", data.getBoolean("collision"));
                    result.put("finalDistance", data.getDouble("final_distance"));
                    result.put("totalReward", data.getDouble("total_reward"));
                    // Python 环境自动生成的障碍物信息（用于前端 routeInfo 展示）
                    result.put("obstacles", data.get("obstacles"));
                    String plannerMode = data.getString("planner_mode");
                    result.put("plannerMode", plannerMode);
                    // 仅当由 Q-table 直接到达目标，才视作 rlSuccess
                    Boolean modelSuccess = data.getBoolean("success");
                    boolean rlSuccess = Boolean.TRUE.equals(modelSuccess) && !"bfs_fallback".equalsIgnoreCase(plannerMode);
                    result.put("rlSuccess", rlSuccess);
                    result.put("qOnly", Boolean.TRUE.equals(data.getBoolean("q_only")));

                    // 在线推理失败原因与明细（与 PyCharm 离线多 episode 训练不同，此处为单次 rollout）
                    putIfPresent(result, "failureReason", data.getString("failure_reason"));
                    putIfPresent(result, "failureDetail", data.getString("failure_detail"));
                    result.put("outOfBounds", data.getBoolean("out_of_bounds"));
                    result.put("timeout", data.getBoolean("timeout"));
                    putIfPresent(result, "lastTermination", data.getString("last_termination"));
                    if (data.get("min_distance_to_goal") != null) {
                        result.put("minDistanceToGoal", data.getDouble("min_distance_to_goal"));
                    }
                    if (data.get("path_length_grid_units") != null) {
                        result.put("pathLengthGridUnits", data.getDouble("path_length_grid_units"));
                    }
                    if (data.get("last_step_reward") != null) {
                        result.put("lastStepReward", data.getDouble("last_step_reward"));
                    }
                    if (data.get("goal_threshold_infer") != null) {
                        result.put("goalThresholdInfer", data.getDouble("goal_threshold_infer"));
                    }
                    if (data.get("goal_threshold_train") != null) {
                        result.put("goalThresholdTrain", data.getDouble("goal_threshold_train"));
                    }
                    if (data.get("initial_grid_distance") != null) {
                        result.put("initialGridDistance", data.getDouble("initial_grid_distance"));
                    }
                    if (data.get("infer_goal_scale") != null) {
                        result.put("inferGoalScale", data.getDouble("infer_goal_scale"));
                    }
                    result.put("stochasticInference", data.getBoolean("stochastic_inference"));
                    if (data.get("inference_noise_sigma") != null) {
                        result.put("inferenceNoiseSigma", data.getDouble("inference_noise_sigma"));
                    }
                    if (data.get("goal_guidance_strength") != null) {
                        result.put("goalGuidanceStrength", data.getDouble("goal_guidance_strength"));
                    }
                    if (data.get("max_steps") != null) {
                        result.put("maxStepsEnv", data.getInteger("max_steps"));
                    }
                    if (data.get("plan_trials") != null) {
                        result.put("planTrials", data.getInteger("plan_trials"));
                    }
                    if (data.get("plan_trial_success_count") != null) {
                        result.put("planTrialSuccessCount", data.getInteger("plan_trial_success_count"));
                    }
                    if (data.get("selected_trial") != null) {
                        result.put("selectedTrial", data.getInteger("selected_trial"));
                    }
                    putIfPresent(result, "mode", data.getString("mode"));
                    putIfPresent(result, "modeNote", data.getString("mode_note"));
                    // RL 轨迹在地理系下的累计弧长（米），即“已行进距离”近似
                    result.put("rlPathDistanceMeters", totalDistanceM);
                    putIfPresent(result, "modelPath", data.getString("model_path"));
                    putIfPresent(result, "plannerMode", data.getString("planner_mode"));
                    result.put("missionId", missionId);
                    result.put("offlineGridAligned", offlineMissionMode);

                    if (ok != null && ok) {
                        log.info("路径规划成功 - 距离: {}m, 预计时间: {}s", totalDistanceM, estimatedTimeS);
                    }
                }
                if (ok == null || !ok) {
                    result.put("error", jsonResponse.getString("error"));
                    log.error("路径规划失败: {}", jsonResponse.getString("error"));
                }

                return result;
            } else {
                log.error("调用 Python 服务失败，状态码: {}", response.getStatusCode());
                Map<String, Object> errorResult = new HashMap<>();
                errorResult.put("success", false);
                errorResult.put("error", "路径规划服务调用失败");
                return errorResult;
            }
            
        } catch (Exception e) {
            log.error("路径规划异常", e);
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("success", false);
            errorResult.put("error", "路径规划异常: " + e.getMessage());
            return errorResult;
        }
    }
    
    @Override
    public Map<String, Object> optimizePath(List<List<Double>> path) {
        try {
            log.info("开始路径优化 - 路径点数: {}", path.size());

            // DDPG 服务当前未提供 optimize 接口；保持兼容返回
            Map<String, Object> result = new HashMap<>();
            result.put("success", false);
            result.put("error", "当前强化学习服务未提供路径优化接口");
            return result;
        } catch (Exception e) {
            log.error("路径优化异常", e);
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("success", false);
            errorResult.put("error", "路径优化异常: " + e.getMessage());
            return errorResult;
        }
    }
    
    @Override
    public Map<String, Object> checkServiceHealth() {
        try {
            String url = pythonServiceUrl + "/health";
            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
            
            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                JSONObject jsonResponse = JSON.parseObject(response.getBody());
                
                Map<String, Object> result = new HashMap<>();
                result.put("status", jsonResponse.getString("status"));
                result.put("available", "ok".equalsIgnoreCase(jsonResponse.getString("status")));
                result.put("modelLoaded", jsonResponse.getBoolean("model_loaded"));
                result.put("device", jsonResponse.getString("device"));
                result.put("message", jsonResponse.getString("message"));
                
                log.info("Python 路径规划服务健康检查通过");
                return result;
            }
        } catch (Exception e) {
            log.error("Python 服务健康检查失败", e);
        }
        
        Map<String, Object> errorResult = new HashMap<>();
        errorResult.put("available", false);
        errorResult.put("status", "unreachable");
        return errorResult;
    }

    @Override
    public Map<String, Object> getRlPlot(String name, Integer missionId) {
        Map<String, Object> result = new HashMap<>();
        result.put("success", false);
        try {
            String n = (name == null || name.isBlank()) ? "training_progress" : name.trim();
            // 兼容前端/调用方传入 *.png
            if (n.toLowerCase(Locale.ROOT).endsWith(".png")) {
                n = n.substring(0, n.length() - 4);
            }
            if (n.toLowerCase(Locale.ROOT).endsWith(".gif")) {
                n = n.substring(0, n.length() - 4);
            }
            String encodedName = UriUtils.encodeQueryParam(n, StandardCharsets.UTF_8);
            StringBuilder urlBuilder = new StringBuilder(pythonServiceUrl.replaceAll("/+$", ""))
                    .append("/api/plots?name=").append(encodedName);
            if (missionId != null && missionId > 0) {
                urlBuilder.append("&mission_id=").append(missionId);
            }
            if (n.equals("path_evolution")) {
                urlBuilder.append("&ext=gif");
            }
            String url = urlBuilder.toString();
            ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                JSONObject json = JSON.parseObject(response.getBody());
                boolean success = Boolean.TRUE.equals(json.getBoolean("success"));
                result.put("success", success);
                if (success) {
                    result.put("name", json.getString("name"));
                    result.put("filename", json.getString("filename"));
                    result.put("mime", json.getString("mime"));
                    result.put("updatedAt", json.getDouble("updated_at"));
                    result.put("dataBase64", json.getString("data_base64"));
                } else {
                    result.put("error", json.getString("error"));
                }
                return result;
            }
            result.put("error", "获取图表失败，HTTP: " + response.getStatusCode());
            return result;
        } catch (HttpStatusCodeException e) {
            // Python 侧常见为 404（图表未生成），这里转为业务错误而非抛异常串
            String body = e.getResponseBodyAsString();
            try {
                JSONObject json = JSON.parseObject(body);
                String msg = json.getString("error");
                result.put("error", (msg != null && !msg.isBlank()) ? msg : ("获取图表失败，HTTP: " + e.getStatusCode()));
            } catch (Exception ignored) {
                result.put("error", "获取图表失败，HTTP: " + e.getStatusCode());
            }
            return result;
        } catch (Exception e) {
            result.put("error", "获取图表异常: " + e.getMessage());
            return result;
        }
    }

    @Override
    public Map<String, Object> generateUavEnvironmentPlot(Map<String, Object> params) {
        try {
            String url = pythonServiceUrl.replaceAll("/+$", "") + "/api/uav_environment_plot";
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(params, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);
            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                JSONObject jsonResponse = JSON.parseObject(response.getBody());
                Map<String, Object> result = new HashMap<>();
                Boolean ok = jsonResponse.getBoolean("success");
                result.put("success", ok != null && ok);
                if (ok != null && ok) {
                    result.put("filename", jsonResponse.getString("filename"));
                    result.put("message", jsonResponse.getString("message"));
                } else {
                    result.put("error", jsonResponse.getString("error"));
                }
                return result;
            }
            Map<String, Object> err = new HashMap<>();
            err.put("success", false);
            err.put("error", "生成环境图失败，HTTP: " + response.getStatusCode());
            return err;
        } catch (Exception e) {
            log.error("生成 UAV 环境图异常", e);
            Map<String, Object> err = new HashMap<>();
            err.put("success", false);
            err.put("error", "生成环境图异常: " + e.getMessage());
            return err;
        }
    }

    @Override
    public Map<String, Object> evalBatch(Map<String, Object> params) {
        Map<String, Object> result = new HashMap<>();
        result.put("success", false);
        try {
            @SuppressWarnings("unchecked")
            List<Object> startPointRaw = (List<Object>) params.get("startPoint");
            @SuppressWarnings("unchecked")
            List<Object> endPointRaw = (List<Object>) params.get("endPoint");
            if (startPointRaw == null || endPointRaw == null) {
                result.put("error", "缺少必需参数: startPoint 和 endPoint");
                return result;
            }
            List<Double> startPoint = toDoubleListRaw(startPointRaw);
            List<Double> endPoint = toDoubleListRaw(endPointRaw);
            if (startPoint.size() < 2 || endPoint.size() < 2) {
                result.put("error", "startPoint/endPoint 格式错误，必须至少包含 [lat, lon, alt?]");
                return result;
            }

            double startLat = startPoint.get(0);
            double startLon = startPoint.get(1);
            double startAlt = startPoint.size() >= 3 && startPoint.get(2) != null ? startPoint.get(2) : 0.0;
            double goalLat = endPoint.get(0);
            double goalLon = endPoint.get(1);
            double goalAlt = endPoint.size() >= 3 && endPoint.get(2) != null ? endPoint.get(2) : startAlt;

            Boolean qOnly = params.get("qOnly") != null ? Boolean.valueOf(String.valueOf(params.get("qOnly"))) : null;
            Boolean stochasticInference = params.get("stochasticInference") != null ?
                    Boolean.valueOf(String.valueOf(params.get("stochasticInference"))) : null;
            Double inferenceNoiseSigma = params.get("inferenceNoiseSigma") != null ?
                    ((Number) params.get("inferenceNoiseSigma")).doubleValue() : null;
            Integer runs = params.get("runs") != null ? ((Number) params.get("runs")).intValue() : 20;
            Integer missionId = null;
            if (params.get("missionId") instanceof Number) {
                missionId = ((Number) params.get("missionId")).intValue();
            } else if (params.get("missionId") != null) {
                try {
                    missionId = Integer.parseInt(String.valueOf(params.get("missionId")));
                } catch (Exception ignored) {
                    missionId = null;
                }
            }
            final boolean requestedQOnly = qOnly != null && qOnly;
            final boolean offlineMissionMode = missionId != null && missionId > 0 && requestedQOnly;

            GridTransform grid = buildGridTransform(
                    startLat, startLon, startAlt, goalLat, goalLon, goalAlt, null, missionId, offlineMissionMode,
                    startLat, startLon, startAlt, goalLat, goalLon, goalAlt);
            int gridN = grid.gridN;
            int margin = grid.margin;
            double xyScaleMPerGrid = grid.xyScaleMPerGrid;
            double zScaleMPerGrid = grid.zScaleMPerGrid;
            double originLat = grid.originLat;
            double originLon = grid.originLon;
            double originLatRad = grid.originLatRad;
            double centerX = grid.centerX;
            double centerY = grid.centerY;
            double startX = grid.startX;
            double startY = grid.startY;
            double startZ = grid.startZ;
            double goalX = grid.goalX;
            double goalY = grid.goalY;
            double goalZ = grid.goalZ;

            final boolean stoch = stochasticInference != null && stochasticInference;
            final double sigmaInput = inferenceNoiseSigma != null ? Math.max(0.0, Math.min(0.5, inferenceNoiseSigma)) : 0.0;
            final double inferGoalScale = stoch ? 1.20 : 1.05;
            final double sigma = stoch ? Math.max(0.15, sigmaInput) : sigmaInput;
            final double goalGuidance = stoch ? 0.25 : 0.0;

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> obstacles = (List<Map<String, Object>>) params.get("obstacles");
            List<Map<String, Object>> pyCubes = buildPythonCubeObstacles(
                    obstacles, originLat, originLon, originLatRad, xyScaleMPerGrid, zScaleMPerGrid, centerX, centerY, gridN);

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("start_position", Arrays.asList(startX, startY, startZ));
            requestBody.put("goal_position", Arrays.asList(goalX, goalY, goalZ));
            requestBody.put("runs", Math.max(1, Math.min(200, runs)));
            requestBody.put("max_steps", 2200);
            requestBody.put("infer_goal_scale", inferGoalScale);
            requestBody.put("stochastic_inference", stoch);
            requestBody.put("inference_noise_sigma", sigma);
            requestBody.put("goal_guidance_strength", goalGuidance);
            requestBody.put("use_model_meta_scaling", !offlineMissionMode);
            requestBody.put("q_only", requestedQOnly);
            if (missionId != null && missionId > 0) {
                requestBody.put("mission_id", missionId);
            }
            if (offlineMissionMode) {
                requestBody.put("offline_grid_aligned", true);
                requestBody.put("obstacle_clearance_m", 45.0);
            }
            requestBody.put("grid_n", gridN);
            requestBody.put("margin", margin);
            requestBody.put("xy_scale_m_per_grid", xyScaleMPerGrid);
            requestBody.put("z_scale_m_per_grid", zScaleMPerGrid);
            requestBody.put("start_lat", startLat);
            requestBody.put("start_lon", startLon);
            requestBody.put("start_alt", startAlt);
            requestBody.put("goal_lat", goalLat);
            requestBody.put("goal_lon", goalLon);
            requestBody.put("goal_alt", goalAlt);
            requestBody.put("origin_lat", originLat);
            requestBody.put("origin_lon", originLon);
            if (!offlineMissionMode) {
                requestBody.put("obstacle_clearance_m", 50.0);
            }
            if (pyCubes != null && !pyCubes.isEmpty()) {
                requestBody.put("obstacle_cubes", pyCubes);
            }

            String url = pythonServiceUrl.replaceAll("/+$", "") + "/api/eval_batch";

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);
            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                JSONObject json = JSON.parseObject(response.getBody());
                boolean ok = Boolean.TRUE.equals(json.getBoolean("success"));
                result.put("success", ok);
                if (ok) {
                    result.put("data", json.getJSONObject("data"));
                } else {
                    result.put("error", json.getString("error"));
                }
                return result;
            }
            result.put("error", "批量评估失败，HTTP: " + response.getStatusCode());
            return result;
        } catch (HttpStatusCodeException e) {
            String body = e.getResponseBodyAsString();
            try {
                JSONObject json = JSON.parseObject(body);
                String msg = json.getString("error");
                result.put("error", (msg != null && !msg.isBlank()) ? msg : ("批量评估失败，HTTP: " + e.getStatusCode()));
            } catch (Exception ignored) {
                result.put("error", "批量评估失败，HTTP: " + e.getStatusCode());
            }
            return result;
        } catch (Exception e) {
            log.error("批量评估异常", e);
            result.put("error", "批量评估异常: " + e.getMessage());
            return result;
        }
    }

    @Override
    public Map<String, Object> saveExternalAlgorithmPath(Map<String, Object> params) {
        Map<String, Object> result = new HashMap<>();
        result.put("success", false);
        try {
            String algorithmRaw = String.valueOf(params.getOrDefault("algorithm", "GA")).trim();
            String algorithm = algorithmRaw.toUpperCase(Locale.ROOT);
            String fileName = "GA".equals(algorithm) ? "java_ga_paths.json" : "java_astar_paths.json";
            int missionId = 0;
            Object missionObj = params.get("missionId");
            if (missionObj instanceof Number) {
                missionId = ((Number) missionObj).intValue();
            } else if (missionObj != null) {
                try {
                    missionId = Integer.parseInt(String.valueOf(missionObj));
                } catch (Exception ignored) {
                    missionId = 0;
                }
            }
            Object rawPath = params.get("path");
            if (!(rawPath instanceof List<?>)) {
                result.put("error", "path 必须是数组");
                return result;
            }
            List<List<Double>> normalizedPath = new ArrayList<>();
            @SuppressWarnings("unchecked")
            List<Object> rawList = (List<Object>) rawPath;
            for (Object item : rawList) {
                if (item instanceof List<?>) {
                    List<?> arr = (List<?>) item;
                    if (arr.size() >= 2) {
                        double a = toNumber(arr.get(0));
                        double b = toNumber(arr.get(1));
                        double c = arr.size() >= 3 ? toNumber(arr.get(2)) : 0.0;
                        normalizedPath.add(Arrays.asList(a, b, c));
                    }
                } else if (item instanceof Map<?, ?>) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> p = (Map<String, Object>) item;
                    Double lat = mapGetDoubleNullable(p, "lat");
                    Double lng = mapGetDoubleNullable(p, "lng");
                    if (lat != null && lng != null) {
                        double alt = mapGetDoubleWithDefault(p, "alt", 0.0);
                        normalizedPath.add(Arrays.asList(lat, lng, alt));
                    }
                }
            }
            if (normalizedPath.isEmpty()) {
                result.put("error", "path 为空或格式无效");
                return result;
            }

            Path outPath = Paths.get(System.getProperty("user.dir"), "python_service", "images", fileName);
            Files.createDirectories(outPath.getParent());

            JSONObject root = new JSONObject();
            if (Files.exists(outPath)) {
                try {
                    String old = Files.readString(outPath, StandardCharsets.UTF_8);
                    JSONObject parsed = JSON.parseObject(old);
                    if (parsed != null) {
                        root = parsed;
                    }
                } catch (Exception ignored) {
                    root = new JSONObject();
                }
            }
            JSONObject missions = root.getJSONObject("missions");
            if (missions == null) {
                missions = new JSONObject();
                root.put("missions", missions);
            }
            if (missionId > 0) {
                JSONObject missionDoc = new JSONObject();
                missionDoc.put("algorithm", algorithm);
                missionDoc.put("path", normalizedPath);
                missionDoc.put("updated_at", new Date().toString());
                missions.put(String.valueOf(missionId), missionDoc);
            }
            root.put("algorithm", algorithm);
            root.put("path", normalizedPath);
            root.put("updated_at", new Date().toString());

            Files.writeString(outPath, JSON.toJSONString(root, JSONWriter.Feature.PrettyFormat), StandardCharsets.UTF_8);
            result.put("success", true);
            result.put("file", outPath.toString());
            result.put("algorithm", algorithm);
            result.put("missionId", missionId > 0 ? missionId : null);
            result.put("pathPoints", normalizedPath.size());
            return result;
        } catch (Exception e) {
            log.error("保存 Java 侧算法路径失败", e);
            result.put("error", "保存失败: " + e.getMessage());
            return result;
        }
    }

    private static List<Double> toDoubleListRaw(List<Object> raw) {
        List<Double> out = new ArrayList<>();
        if (raw == null) return out;
        for (Object v : raw) {
            if (v == null) {
                out.add(null);
            } else if (v instanceof Number) {
                out.add(((Number) v).doubleValue());
            } else {
                try {
                    out.add(Double.parseDouble(String.valueOf(v)));
                } catch (Exception ex) {
                    out.add(null);
                }
            }
        }
        return out;
    }

    private static void putIfPresent(Map<String, Object> map, String key, String value) {
        if (value != null && !value.isEmpty()) {
            map.put(key, value);
        }
    }

    private static double clamp(double v, double min, double max) {
        return Math.max(min, Math.min(max, v));
    }

    /**
     * 将前端障碍物转为 Python 立方体（网格坐标）：支持
     * - 已是网格：type=cube + position/size 三维数组
     * - 百度 POI 近似：type=cube + lat、lng + widthM/depthM/heightM（米）
     */
    private static List<Map<String, Object>> buildPythonCubeObstacles(
            List<Map<String, Object>> raw,
            double originLat,
            double originLon,
            double lat0Rad,
            double xyScaleMPerGrid,
            double zScaleMPerGrid,
            double centerX,
            double centerY,
            int gridN) {
        if (raw == null || raw.isEmpty()) {
            return null;
        }
        final int maxObstacles = 30;
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> o : raw) {
            if (out.size() >= maxObstacles) {
                break;
            }
            String t = String.valueOf(o.getOrDefault("type", "cube"));
            if (!"cube".equalsIgnoreCase(t)) {
                continue;
            }
            Object posObj = o.get("position");
            Object sizeObj = o.get("size");
            if (posObj instanceof List<?> && sizeObj instanceof List<?>) {
                @SuppressWarnings("unchecked")
                List<Object> pos = (List<Object>) posObj;
                @SuppressWarnings("unchecked")
                List<Object> sz = (List<Object>) sizeObj;
                if (pos.size() >= 3 && sz.size() >= 3) {
                    Map<String, Object> cube = new HashMap<>();
                    cube.put("type", "cube");
                    cube.put("position", Arrays.asList(
                            toNumber(pos.get(0)), toNumber(pos.get(1)), toNumber(pos.get(2))));
                    cube.put("size", Arrays.asList(
                            toNumber(sz.get(0)), toNumber(sz.get(1)), toNumber(sz.get(2))));
                    out.add(cube);
                }
                continue;
            }
            Double lat = mapGetDoubleNullable(o, "lat");
            Double lng = mapGetDoubleNullable(o, "lng");
            if (lat == null || lng == null) {
                continue;
            }
            double widthM = mapGetDoubleWithDefault(o, "widthM", 35.0);
            double depthM = mapGetDoubleWithDefault(o, "depthM", 35.0);
            double heightM = mapGetDoubleWithDefault(o, "heightM", 45.0);
            widthM = Math.max(8.0, widthM);
            depthM = Math.max(8.0, depthM);
            heightM = Math.max(12.0, heightM);

            double dLonRad = Math.toRadians(lng - originLon);
            double dLatRad = Math.toRadians(lat - originLat);
            double dxM = dLonRad * Math.cos(lat0Rad) * EARTH_RADIUS_M;
            double dyM = dLatRad * EARTH_RADIUS_M;

            double cx = centerX + dxM / xyScaleMPerGrid;
            double cy = centerY + dyM / xyScaleMPerGrid;
            double cz = (heightM / 2.0) / zScaleMPerGrid;

            double sx = widthM / xyScaleMPerGrid;
            double sy = depthM / xyScaleMPerGrid;
            double sz = heightM / zScaleMPerGrid;

            cx = clamp(cx, 0.5, gridN - 0.5);
            cy = clamp(cy, 0.5, gridN - 0.5);
            cz = clamp(cz, sz / 2.0 + 0.1, gridN - sz / 2.0 - 0.1);
            sx = Math.min(sx, gridN - 1.0);
            sy = Math.min(sy, gridN - 1.0);
            sz = Math.min(sz, gridN - 1.0);

            Map<String, Object> cube = new HashMap<>();
            cube.put("type", "cube");
            cube.put("position", Arrays.asList(cx, cy, cz));
            cube.put("size", Arrays.asList(sx, sy, sz));
            out.add(cube);
        }
        return out.isEmpty() ? null : out;
    }

    private static double toNumber(Object v) {
        if (v instanceof Number) {
            return ((Number) v).doubleValue();
        }
        return Double.parseDouble(String.valueOf(v));
    }

    private static Double mapGetDoubleNullable(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v == null) {
            return null;
        }
        if (v instanceof Number) {
            return ((Number) v).doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(v));
        } catch (Exception e) {
            return null;
        }
    }

    private static double mapGetDoubleWithDefault(Map<String, Object> m, String key, double def) {
        Double x = mapGetDoubleNullable(m, key);
        return x != null ? x : def;
    }

    private static GridTransform buildGridTransform(
            double startLat, double startLon, double startAlt,
            double goalLat, double goalLon, double goalAlt,
            Integer gridSize, Integer missionId, boolean offlineMissionMode,
            double userStartLat, double userStartLon, double userStartAlt,
            double userGoalLat, double userGoalLon, double userGoalAlt) {
        if (offlineMissionMode) {
            PathPlanningOfflineMission.Anchor anchor = missionId != null
                    ? PathPlanningOfflineMission.get(missionId) : null;
            if (anchor == null) {
                throw new IllegalArgumentException("未知离线 mission_id: " + missionId);
            }
            double trainStartLat = anchor.startLat;
            double trainStartLon = anchor.startLon;
            double trainStartAlt = anchor.startAlt;
            double trainGoalLat = anchor.goalLat;
            double trainGoalLon = anchor.goalLon;
            double trainGoalAlt = anchor.goalAlt;

            int gridN = PathPlanningOfflineMission.OFFLINE_GRID_N;
            int margin = PathPlanningOfflineMission.OFFLINE_MARGIN;
            double zScale = PathPlanningOfflineMission.OFFLINE_Z_SCALE;
            double originLat = (trainStartLat + trainGoalLat) / 2.0;
            double originLon = (trainStartLon + trainGoalLon) / 2.0;
            double centerX = gridN / 2.0;
            double centerY = gridN / 2.0;

            double[] goalDelta = geoDeltaMeters(trainGoalLat, trainGoalLon, originLat, originLon);
            double halfUsable = Math.max(2.0, (gridN / 2.0) - margin - 2.0);
            double requiredScale = Math.max(Math.abs(goalDelta[0]), Math.abs(goalDelta[1]));
            requiredScale = Math.max(requiredScale, 260.0) / halfUsable;
            double xyScale = Math.max(8.0, requiredScale * 1.12);

            double[] startDelta = geoDeltaMeters(trainStartLat, trainStartLon, originLat, originLon);
            double startX = clamp(centerX + startDelta[0] / xyScale, 0, gridN - 1);
            double startY = clamp(centerY + startDelta[1] / xyScale, 0, gridN - 1);
            double startZ = clamp(trainStartAlt / zScale, 0, gridN - 1);
            double goalX = clamp(centerX + goalDelta[0] / xyScale, 0, gridN - 1);
            double goalY = clamp(centerY + goalDelta[1] / xyScale, 0, gridN - 1);
            double goalZ = clamp(trainGoalAlt / zScale, 0, gridN - 1);

            return new GridTransform(
                    gridN, margin, xyScale, zScale,
                    originLat, originLon, centerX, centerY,
                    startX, startY, startZ, goalX, goalY, goalZ,
                    true, missionId, anchor.name,
                    true, userStartLat, userStartLon, userStartAlt, userGoalLat, userGoalLon, userGoalAlt,
                    trainStartLat, trainStartLon, trainStartAlt, trainGoalLat, trainGoalLon, trainGoalAlt);
        }

        int gridN = 50;
        int margin = 5;
        int span = gridN - margin * 2;
        if (gridSize != null && gridSize >= 10) {
            // 兼容老参数，不直接改 Python grid_n
        }

        double lat0Rad = Math.toRadians(startLat);
        double dLatRad = Math.toRadians(goalLat - startLat);
        double dLonRad = Math.toRadians(goalLon - startLon);
        double dxM = dLonRad * Math.cos(lat0Rad) * EARTH_RADIUS_M;
        double dyM = dLatRad * EARTH_RADIUS_M;
        double dzM = goalAlt - startAlt;

        double originLat = (startLat + goalLat) / 2.0;
        double originLon = (startLon + goalLon) / 2.0;
        double centerX = gridN / 2.0;
        double centerY = gridN / 2.0;
        double halfSpan = Math.max(1.0, centerX - margin);
        double maxPlanM = Math.max(Math.max(Math.abs(dxM), Math.abs(dyM)), 80.0);
        double xyScale = (maxPlanM * 1.35) / halfSpan;
        if (xyScale < 1.0) {
            xyScale = 1.0;
        }

        double maxAltM = Math.max(Math.max(Math.abs(startAlt), Math.abs(goalAlt)), 1.0);
        double zScale = Math.max(Math.abs(dzM), maxAltM * 0.2) / span;
        if (zScale < 1.0) {
            zScale = 1.0;
        }

        double startX = clamp(centerX - (dxM / 2.0) / xyScale, 0, gridN - 1);
        double startY = clamp(centerY - (dyM / 2.0) / xyScale, 0, gridN - 1);
        double startZ = clamp(margin + (startAlt / zScale), 0, gridN - 1);
        double goalX = clamp(centerX + (dxM / 2.0) / xyScale, 0, gridN - 1);
        double goalY = clamp(centerY + (dyM / 2.0) / xyScale, 0, gridN - 1);
        double goalZ = clamp(margin + (goalAlt / zScale), 0, gridN - 1);

        return new GridTransform(
                gridN, margin, xyScale, zScale,
                originLat, originLon, centerX, centerY,
                startX, startY, startZ, goalX, goalY, goalZ,
                false, missionId, null,
                false, userStartLat, userStartLon, userStartAlt, userGoalLat, userGoalLon, userGoalAlt,
                startLat, startLon, startAlt, goalLat, goalLon, goalAlt);
    }

    private static double[] geoDeltaMeters(double lat, double lon, double originLat, double originLon) {
        double lat0Rad = Math.toRadians(originLat);
        double dLatRad = Math.toRadians(lat - originLat);
        double dLonRad = Math.toRadians(lon - originLon);
        double dxM = dLonRad * Math.cos(lat0Rad) * EARTH_RADIUS_M;
        double dyM = dLatRad * EARTH_RADIUS_M;
        return new double[]{dxM, dyM};
    }

    private static final class GridTransform {
        final int gridN;
        final int margin;
        final double xyScaleMPerGrid;
        final double zScaleMPerGrid;
        final double originLat;
        final double originLon;
        final double originLatRad;
        final double centerX;
        final double centerY;
        final double startX;
        final double startY;
        final double startZ;
        final double goalX;
        final double goalY;
        final double goalZ;
        final boolean offlineAligned;
        final Integer missionId;
        final String missionName;
        final boolean trainingAnchorApplied;
        final double userStartLat;
        final double userStartLon;
        final double userStartAlt;
        final double userGoalLat;
        final double userGoalLon;
        final double userGoalAlt;
        final double trainStartLat;
        final double trainStartLon;
        final double trainStartAlt;
        final double trainGoalLat;
        final double trainGoalLon;
        final double trainGoalAlt;

        GridTransform(int gridN, int margin, double xyScaleMPerGrid, double zScaleMPerGrid,
                      double originLat, double originLon, double centerX, double centerY,
                      double startX, double startY, double startZ,
                      double goalX, double goalY, double goalZ,
                      boolean offlineAligned, Integer missionId, String missionName,
                      boolean trainingAnchorApplied,
                      double userStartLat, double userStartLon, double userStartAlt,
                      double userGoalLat, double userGoalLon, double userGoalAlt,
                      double trainStartLat, double trainStartLon, double trainStartAlt,
                      double trainGoalLat, double trainGoalLon, double trainGoalAlt) {
            this.gridN = gridN;
            this.margin = margin;
            this.xyScaleMPerGrid = xyScaleMPerGrid;
            this.zScaleMPerGrid = zScaleMPerGrid;
            this.originLat = originLat;
            this.originLon = originLon;
            this.originLatRad = Math.toRadians(originLat);
            this.centerX = centerX;
            this.centerY = centerY;
            this.startX = startX;
            this.startY = startY;
            this.startZ = startZ;
            this.goalX = goalX;
            this.goalY = goalY;
            this.goalZ = goalZ;
            this.offlineAligned = offlineAligned;
            this.missionId = missionId;
            this.missionName = missionName;
            this.trainingAnchorApplied = trainingAnchorApplied;
            this.userStartLat = userStartLat;
            this.userStartLon = userStartLon;
            this.userStartAlt = userStartAlt;
            this.userGoalLat = userGoalLat;
            this.userGoalLon = userGoalLon;
            this.userGoalAlt = userGoalAlt;
            this.trainStartLat = trainStartLat;
            this.trainStartLon = trainStartLon;
            this.trainStartAlt = trainStartAlt;
            this.trainGoalLat = trainGoalLat;
            this.trainGoalLon = trainGoalLon;
            this.trainGoalAlt = trainGoalAlt;
        }

        List<Double> latLonAltFromGrid(double x, double y, double z) {
            double dx = (x - centerX) * xyScaleMPerGrid;
            double dy = (y - centerY) * xyScaleMPerGrid;
            double alt = z * zScaleMPerGrid;
            double lat = originLat + Math.toDegrees(dy / EARTH_RADIUS_M);
            double lon = originLon + Math.toDegrees(dx / (EARTH_RADIUS_M * Math.cos(originLatRad)));
            return Arrays.asList(lat, lon, alt);
        }

        Map<String, Object> toTraceMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("offlineAligned", offlineAligned);
            m.put("missionId", missionId);
            m.put("missionName", missionName);
            m.put("gridN", gridN);
            m.put("margin", margin);
            m.put("xyScaleMPerGrid", xyScaleMPerGrid);
            m.put("zScaleMPerGrid", zScaleMPerGrid);
            m.put("originLat", originLat);
            m.put("originLon", originLon);
            m.put("startGrid", Arrays.asList(startX, startY, startZ));
            m.put("goalGrid", Arrays.asList(goalX, goalY, goalZ));
            if (trainingAnchorApplied) {
                m.put("trainingAnchorApplied", true);
                m.put("userStartGeo", Arrays.asList(userStartLat, userStartLon, userStartAlt));
                m.put("userGoalGeo", Arrays.asList(userGoalLat, userGoalLon, userGoalAlt));
                m.put("trainStartGeo", Arrays.asList(trainStartLat, trainStartLon, trainStartAlt));
                m.put("trainGoalGeo", Arrays.asList(trainGoalLat, trainGoalLon, trainGoalAlt));
            }
            return m;
        }
    }

    private static double computePathDistanceMeters(List<List<Double>> pathLatLonAlt) {
        if (pathLatLonAlt == null || pathLatLonAlt.size() < 2) return 0.0;
        double total = 0.0;
        for (int i = 1; i < pathLatLonAlt.size(); i++) {
            List<Double> a = pathLatLonAlt.get(i - 1);
            List<Double> b = pathLatLonAlt.get(i);
            if (a.size() < 2 || b.size() < 2) continue;
            double lat1 = a.get(0), lon1 = a.get(1);
            double lat2 = b.get(0), lon2 = b.get(1);
            double alt1 = a.size() >= 3 ? a.get(2) : 0.0;
            double alt2 = b.size() >= 3 ? b.get(2) : 0.0;

            double dLat = Math.toRadians(lat2 - lat1);
            double dLon = Math.toRadians(lon2 - lon1);
            double rLat1 = Math.toRadians(lat1);
            double rLat2 = Math.toRadians(lat2);
            double sinDLat = Math.sin(dLat / 2);
            double sinDLon = Math.sin(dLon / 2);
            double h = sinDLat * sinDLat + Math.cos(rLat1) * Math.cos(rLat2) * sinDLon * sinDLon;
            double ground = 2 * EARTH_RADIUS_M * Math.asin(Math.min(1.0, Math.sqrt(h)));
            double dAlt = alt2 - alt1;
            total += Math.sqrt(ground * ground + dAlt * dAlt);
        }
        return total;
    }
}
