package com.drone.system.service.impl;

import com.drone.system.domain.Uav;
import com.drone.system.domain.vo.PathPlanningRequest;
import com.drone.system.domain.vo.PathPlanningResponse;
import com.drone.system.service.IPathPlanningService;
import com.drone.system.service.IUavService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

/**
 * 路径规划服务实现类
 */
@Service
public class PathPlanningServiceImpl implements IPathPlanningService {
    
    @Resource
    private IUavService uavService;
    
    // 地球半径（米）
    private static final double EARTH_RADIUS = 6378137.0;
    
    @Override
    public PathPlanningResponse planPath(PathPlanningRequest request) {
        try {
            // 验证参数
            if (request.getStartLng() == null || request.getStartLat() == null ||
                request.getEndLng() == null || request.getEndLat() == null) {
                return new PathPlanningResponse(false, "起点和终点坐标不能为空", null, null, null, null);
            }
            
            // 获取无人机信息
            Uav uav = null;
            if (request.getUavId() != null) {
                uav = uavService.selectUavByUavId(request.getUavId());
                if (uav == null) {
                    return new PathPlanningResponse(false, "无人机不存在", null, null, null, null);
                }
            }
            
            // 根据算法类型执行不同的路径规划
            List<PathPlanningResponse.PathPoint> pathPoints;
            String algorithmName;
            
            switch (request.getAlgorithm()) {
                case 1:
                    pathPoints = planAStar(request);
                    algorithmName = "A*算法";
                    break;
                case 2:
                    pathPoints = planDijkstra(request);
                    algorithmName = "迪杰斯特拉算法";
                    break;
                case 3:
                    pathPoints = planAntColony(request);
                    algorithmName = "蚁群算法";
                    break;
                case 4:
                    pathPoints = planReinforcementLearning(request);
                    algorithmName = "强化学习模型";
                    break;
                default:
                    pathPoints = planDirectPath(request);
                    algorithmName = "直接路径";
            }
            
            // 计算总距离
            BigDecimal totalDistance = calculateTotalDistance(pathPoints);
            
            // 计算预计时间
            Integer estimatedTime = calculateEstimatedTime(totalDistance, uav);
            
            return new PathPlanningResponse(
                true, 
                "路径规划成功", 
                pathPoints, 
                totalDistance, 
                estimatedTime, 
                algorithmName
            );
            
        } catch (Exception e) {
            e.printStackTrace();
            return new PathPlanningResponse(false, "路径规划失败：" + e.getMessage(), null, null, null, null);
        }
    }
    
    /**
     * A*算法路径规划（完整实现）
     * 使用网格化的方式模拟城市道路网络
     * 并在起点和终点之间创建更合理的路径
     */
    private List<PathPlanningResponse.PathPoint> planAStar(PathPlanningRequest request) {
        BigDecimal startLng = request.getStartLng();
        BigDecimal startLat = request.getStartLat();
        BigDecimal endLng = request.getEndLng();
        BigDecimal endLat = request.getEndLat();
        
        // 创建更精细的网格来模拟真实道路
        int gridSize = 20; // 20x20 的网格
        double[][][] grid = new double[gridSize][gridSize][2];
        
        // 计算网格间距
        BigDecimal lngStep = endLng.subtract(startLng).divide(new BigDecimal(gridSize - 1), 10, RoundingMode.HALF_UP);
        BigDecimal latStep = endLat.subtract(startLat).divide(new BigDecimal(gridSize - 1), 10, RoundingMode.HALF_UP);
        
        // 填充网格坐标
        for (int i = 0; i < gridSize; i++) {
            for (int j = 0; j < gridSize; j++) {
                grid[i][j][0] = startLng.add(lngStep.multiply(new BigDecimal(j))).doubleValue();
                grid[i][j][1] = startLat.add(latStep.multiply(new BigDecimal(i))).doubleValue();
            }
        }
        
        // 生成一些模拟的"建筑物"或"障碍物"区域
        List<ObstacleZone> obstacleZones = generateSimulatedObstacles(startLng.doubleValue(), startLat.doubleValue(), 
                                                                       endLng.doubleValue(), endLat.doubleValue());
        
        // 使用 A*算法寻找最优路径（避开障碍物）
        List<int[]> pathGrid = aStarSearchWithObstacles(grid, 0, 0, gridSize - 1, gridSize - 1, obstacleZones);
        
        // 将网格路径转换为地理坐标点
        List<PathPlanningResponse.PathPoint> pathPoints = new ArrayList<>();
        for (int i = 0; i < pathGrid.size(); i++) {
            int[] cell = pathGrid.get(i);
            BigDecimal lng = new BigDecimal(grid[cell[0]][cell[1]][0]);
            BigDecimal lat = new BigDecimal(grid[cell[0]][cell[1]][1]);
            pathPoints.add(new PathPlanningResponse.PathPoint(lng, lat, new BigDecimal(50), i));
        }
        
        return pathPoints;
    }
    
    /**
     * Dijkstra 算法路径规划（实现版本）
     * 使用网格化的方式模拟城市道路网络
     * 并在起点和终点之间创建更合理的路径
     */
    private List<PathPlanningResponse.PathPoint> planDijkstra(PathPlanningRequest request) {
        BigDecimal startLng = request.getStartLng();
        BigDecimal startLat = request.getStartLat();
        BigDecimal endLng = request.getEndLng();
        BigDecimal endLat = request.getEndLat();
        
        // 创建更精细的网格来模拟真实道路
        int gridSize = 20; // 20x20 的网格
        double[][][] grid = new double[gridSize][gridSize][2];
        
        // 计算网格间距
        BigDecimal lngStep = endLng.subtract(startLng).divide(new BigDecimal(gridSize - 1), 10, RoundingMode.HALF_UP);
        BigDecimal latStep = endLat.subtract(startLat).divide(new BigDecimal(gridSize - 1), 10, RoundingMode.HALF_UP);
        
        // 填充网格坐标
        for (int i = 0; i < gridSize; i++) {
            for (int j = 0; j < gridSize; j++) {
                grid[i][j][0] = startLng.add(lngStep.multiply(new BigDecimal(j))).doubleValue();
                grid[i][j][1] = startLat.add(latStep.multiply(new BigDecimal(i))).doubleValue();
            }
        }
        
        // 生成一些模拟的"建筑物"或"障碍物"区域
        List<ObstacleZone> obstacleZones = generateSimulatedObstacles(startLng.doubleValue(), startLat.doubleValue(), 
                                                                       endLng.doubleValue(), endLat.doubleValue());
        
        // 使用 Dijkstra 算法寻找最短路径（避开障碍物）
        List<int[]> pathGrid = dijkstraSearchWithObstacles(grid, 0, 0, gridSize - 1, gridSize - 1, obstacleZones);
        
        // 将网格路径转换为地理坐标点
        List<PathPlanningResponse.PathPoint> pathPoints = new ArrayList<>();
        for (int i = 0; i < pathGrid.size(); i++) {
            int[] cell = pathGrid.get(i);
            BigDecimal lng = new BigDecimal(grid[cell[0]][cell[1]][0]);
            BigDecimal lat = new BigDecimal(grid[cell[0]][cell[1]][1]);
            pathPoints.add(new PathPlanningResponse.PathPoint(lng, lat, new BigDecimal(50), i));
        }
        
        return pathPoints;
    }
    
    /**
     * 生成模拟的障碍物区域（建筑物、公园等）
     */
    private List<ObstacleZone> generateSimulatedObstacles(double startLng, double startLat, 
                                                           double endLng, double endLat) {
        List<ObstacleZone> zones = new ArrayList<>();
        Random random = new Random(123); // 固定种子
        
        // 计算中心区域
        double centerLng = (startLng + endLng) / 2.0;
        double centerLat = (startLat + endLat) / 2.0;
        
        // 生成 3-5 个随机障碍物
        int numObstacles = 3 + random.nextInt(3);
        for (int i = 0; i < numObstacles; i++) {
            // 在起点和终点之间的区域生成障碍物
            double obsLng = startLng + (endLng - startLng) * (0.3 + random.nextDouble() * 0.4);
            double obsLat = startLat + (endLat - startLat) * (0.3 + random.nextDouble() * 0.4);
            double size = 0.001 + random.nextDouble() * 0.002; // 障碍物大小
            
            zones.add(new ObstacleZone(obsLng, obsLat, size));
        }
        
        return zones;
    }
    
    /**
     * 障碍物区域类
     */
    private static class ObstacleZone {
        double lng;
        double lat;
        double size;
        
        ObstacleZone(double lng, double lat, double size) {
            this.lng = lng;
            this.lat = lat;
            this.size = size;
        }
        
        boolean contains(double lng, double lat) {
            return Math.abs(lng - this.lng) < this.size && Math.abs(lat - this.lat) < this.size;
        }
    }
    
    /**
     * Dijkstra 算法搜索最短路径（考虑障碍物）
     */
    private List<int[]> dijkstraSearch(double[][][] grid, int startX, int startY, int endX, int endY) {
        // 生成模拟障碍物
        List<ObstacleZone> obstacles = new ArrayList<>();
        Random random = new Random(123);
        int rows = grid.length;
        int cols = grid[0].length;
        
        // 在中间区域生成 3-5 个障碍物
        int numObstacles = 3 + random.nextInt(3);
        for (int i = 0; i < numObstacles; i++) {
            // 随机选择网格位置作为障碍物中心
            int obsRow = rows / 4 + random.nextInt(rows / 2);
            int obsCol = cols / 4 + random.nextInt(cols / 2);
            double size = 1.5 + random.nextDouble() * 1.5; // 障碍物半径（网格单位）
            
            obstacles.add(new ObstacleZone(grid[obsRow][obsCol][0], grid[obsRow][obsCol][1], size * 0.0001));
        }
        
        return dijkstraSearchWithObstacles(grid, startX, startY, endX, endY, obstacles);
    }
    
    /**
     * A*算法搜索最优路径（考虑障碍物）
     * 使用启发式函数优化搜索效率
     */
    private List<int[]> aStarSearchWithObstacles(double[][][] grid, int startX, int startY,
                                                   int endX, int endY, List<ObstacleZone> obstacles) {
        int rows = grid.length;
        int cols = grid[0].length;
        
        // g 值数组（从起点到当前点的实际代价）
        double[][] gScore = new double[rows][cols];
        for (double[] row : gScore) {
            Arrays.fill(row, Double.MAX_VALUE);
        }
        gScore[startX][startY] = 0;
        
        // f 值数组（g + h，h 为启发式估计代价）
        double[][] fScore = new double[rows][cols];
        for (double[] row : fScore) {
            Arrays.fill(row, Double.MAX_VALUE);
        }
        fScore[startX][startY] = heuristic(startX, startY, endX, endY);
        
        // 前驱节点数组
        int[][][] prev = new int[rows][cols][2];
        
        // 优先队列（按 f 值排序）
        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> Double.compare(fScore[a[0]][a[1]], fScore[b[0]][b[1]]));
        pq.offer(new int[]{startX, startY});
        
        // 方向数组（上下左右 + 对角线）
        int[][] directions = {{-1, 0}, {1, 0}, {0, -1}, {0, 1}, {-1, -1}, {-1, 1}, {1, -1}, {1, 1}};
        
        while (!pq.isEmpty()) {
            int[] current = pq.poll();
            int x = current[0];
            int y = current[1];
            
            // 到达终点
            if (x == endX && y == endY) {
                break;
            }
            
            // 探索八个方向
            for (int[] dir : directions) {
                int newX = x + dir[0];
                int newY = y + dir[1];
                
                if (newX >= 0 && newX < rows && newY >= 0 && newY < cols) {
                    // 检查新位置是否在障碍物内
                    double newLng = grid[newX][newY][0];
                    double newLat = grid[newX][newY][1];
                    
                    boolean isInObstacle = false;
                    for (ObstacleZone obstacle : obstacles) {
                        if (obstacle.contains(newLng, newLat)) {
                            isInObstacle = true;
                            break;
                        }
                    }
                    
                    // 如果在障碍物内，跳过这个点
                    if (isInObstacle) {
                        continue;
                    }
                    
                    // 计算边的权重（欧几里得距离）
                    double dx = grid[newX][newY][0] - grid[x][y][0];
                    double dy = grid[newX][newY][1] - grid[x][y][1];
                    double weight = Math.sqrt(dx * dx + dy * dy);
                    
                    // 如果是障碍物附近的点，增加权重（让路径倾向于远离障碍物）
                    double distanceToNearestObstacle = Double.MAX_VALUE;
                    for (ObstacleZone obstacle : obstacles) {
                        double distToObs = Math.sqrt(Math.pow(newLng - obstacle.lng, 2) + 
                                                    Math.pow(newLat - obstacle.lat, 2));
                        distanceToNearestObstacle = Math.min(distanceToNearestObstacle, distToObs);
                    }
                    
                    // 越靠近障碍物，权重越大
                    if (distanceToNearestObstacle < 0.0003) {
                        weight *= 3.0;
                    }
                    
                    // 计算新的 g 值
                    double tentativeGScore = gScore[x][y] + weight;
                    
                    if (tentativeGScore < gScore[newX][newY]) {
                        // 找到更好的路径
                        prev[newX][newY] = new int[]{x, y};
                        gScore[newX][newY] = tentativeGScore;
                        fScore[newX][newY] = tentativeGScore + heuristic(newX, newY, endX, endY);
                        pq.offer(new int[]{newX, newY});
                    }
                }
            }
        }
        
        // 回溯路径
        List<int[]> path = new ArrayList<>();
        int x = endX, y = endY;
        while (!(x == startX && y == startY)) {
            path.add(new int[]{x, y});
            int[] p = prev[x][y];
            x = p[0];
            y = p[1];
        }
        path.add(new int[]{startX, startY});
        Collections.reverse(path);
        
        return path;
    }
    
    /**
     * 启发式函数：计算两点间的欧几里得距离
     */
    private double heuristic(int x1, int y1, int x2, int y2) {
        double dx = x2 - x1;
        double dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    /**
     * Dijkstra 算法搜索最短路径（带障碍物规避）
     */
    private List<int[]> dijkstraSearchWithObstacles(double[][][] grid, int startX, int startY, 
                                                     int endX, int endY, List<ObstacleZone> obstacles) {
        int rows = grid.length;
        int cols = grid[0].length;
        
        // 距离数组
        double[][] dist = new double[rows][cols];
        for (double[] row : dist) {
            Arrays.fill(row, Double.MAX_VALUE);
        }
        dist[startX][startY] = 0;
        
        // 前驱节点数组
        int[][][] prev = new int[rows][cols][2];
        
        // 优先队列
        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> Double.compare(dist[a[0]][a[1]], dist[b[0]][b[1]]));
        pq.offer(new int[]{startX, startY});
        
        // 方向数组（上下左右 + 对角线）
        int[][] directions = {{-1, 0}, {1, 0}, {0, -1}, {0, 1}, {-1, -1}, {-1, 1}, {1, -1}, {1, 1}};
        
        while (!pq.isEmpty()) {
            int[] current = pq.poll();
            int x = current[0];
            int y = current[1];
            
            // 到达终点
            if (x == endX && y == endY) {
                break;
            }
            
            // 探索八个方向
            for (int[] dir : directions) {
                int newX = x + dir[0];
                int newY = y + dir[1];
                
                if (newX >= 0 && newX < rows && newY >= 0 && newY < cols) {
                    // 检查新位置是否在障碍物内
                    double newLng = grid[newX][newY][0];
                    double newLat = grid[newX][newY][1];
                    
                    boolean isInObstacle = false;
                    for (ObstacleZone obstacle : obstacles) {
                        if (obstacle.contains(newLng, newLat)) {
                            isInObstacle = true;
                            break;
                        }
                    }
                    
                    // 如果在障碍物内，跳过这个点
                    if (isInObstacle) {
                        continue;
                    }
                    
                    // 计算边的权重（欧几里得距离）
                    double dx = grid[newX][newY][0] - grid[x][y][0];
                    double dy = grid[newX][newY][1] - grid[x][y][1];
                    double weight = Math.sqrt(dx * dx + dy * dy);
                    
                    // 如果是障碍物附近的点，增加权重（让路径倾向于远离障碍物）
                    double distanceToNearestObstacle = Double.MAX_VALUE;
                    for (ObstacleZone obstacle : obstacles) {
                        double distToObs = Math.sqrt(Math.pow(newLng - obstacle.lng, 2) + 
                                                    Math.pow(newLat - obstacle.lat, 2));
                        distanceToNearestObstacle = Math.min(distanceToNearestObstacle, distToObs);
                    }
                    
                    // 越靠近障碍物，权重越大
                    if (distanceToNearestObstacle < 0.0003) {
                        weight *= 3.0; // 靠近障碍物的边权重翻倍
                    }
                    
                    double newDist = dist[x][y] + weight;
                    
                    if (newDist < dist[newX][newY]) {
                        dist[newX][newY] = newDist;
                        prev[newX][newY] = new int[]{x, y};
                        pq.offer(new int[]{newX, newY});
                    }
                }
            }
        }
        
        // 回溯路径
        List<int[]> path = new ArrayList<>();
        int x = endX, y = endY;
        while (!(x == startX && y == startY)) {
            path.add(new int[]{x, y});
            int[] p = prev[x][y];
            x = p[0];
            y = p[1];
        }
        path.add(new int[]{startX, startY});
        Collections.reverse(path);
        
        return path;
    }
    
    /**
     * 蚁群算法路径规划
     */
    private List<PathPlanningResponse.PathPoint> planAntColony(PathPlanningRequest request) {
        // 简化实现：模拟蚁群算法的优化效果
        return generateOptimizedPath(request, 15);
    }
    
    /**
     * 强化学习模型路径规划
     */
    private List<PathPlanningResponse.PathPoint> planReinforcementLearning(PathPlanningRequest request) {
        // 简化实现：模拟强化学习的智能路径选择
        return generateOptimizedPath(request, 10);
    }
    
    /**
     * 直接路径（默认）
     */
    private List<PathPlanningResponse.PathPoint> planDirectPath(PathPlanningRequest request) {
        return generateInterpolatedPath(request, 30);
    }
    
    /**
     * 生成插值路径点
     */
    private List<PathPlanningResponse.PathPoint> generateInterpolatedPath(PathPlanningRequest request, int pointCount) {
        List<PathPlanningResponse.PathPoint> pathPoints = new ArrayList<>();
        
        BigDecimal startLng = request.getStartLng();
        BigDecimal startLat = request.getStartLat();
        BigDecimal endLng = request.getEndLng();
        BigDecimal endLat = request.getEndLat();
        
        for (int i = 0; i <= pointCount; i++) {
            BigDecimal ratio = new BigDecimal(i).divide(new BigDecimal(pointCount), 10, RoundingMode.HALF_UP);
            BigDecimal lng = startLng.add(endLng.subtract(startLng).multiply(ratio));
            BigDecimal lat = startLat.add(endLat.subtract(startLat).multiply(ratio));
            
            pathPoints.add(new PathPlanningResponse.PathPoint(lng, lat, new BigDecimal(50), i));
        }
        
        return pathPoints;
    }
    
    /**
     * 生成优化路径点（模拟避开障碍物）
     */
    private List<PathPlanningResponse.PathPoint> generateOptimizedPath(PathPlanningRequest request, int pointCount) {
        List<PathPlanningResponse.PathPoint> pathPoints = new ArrayList<>();
        
        BigDecimal startLng = request.getStartLng();
        BigDecimal startLat = request.getStartLat();
        BigDecimal endLng = request.getEndLng();
        BigDecimal endLat = request.getEndLat();
        
        // 简单的曲线路径模拟
        for (int i = 0; i <= pointCount; i++) {
            BigDecimal ratio = new BigDecimal(i).divide(new BigDecimal(pointCount), 10, RoundingMode.HALF_UP);
            
            // 添加一些曲线偏移
            double offset = Math.sin(i * Math.PI / pointCount) * 0.001;
            
            BigDecimal lng = startLng.add(endLng.subtract(startLng).multiply(ratio))
                    .add(new BigDecimal(offset));
            BigDecimal lat = startLat.add(endLat.subtract(startLat).multiply(ratio));
            
            pathPoints.add(new PathPlanningResponse.PathPoint(lng, lat, new BigDecimal(50), i));
        }
        
        return pathPoints;
    }
    
    /**
     * 计算总距离
     */
    private BigDecimal calculateTotalDistance(List<PathPlanningResponse.PathPoint> pathPoints) {
        if (pathPoints == null || pathPoints.size() < 2) {
            return BigDecimal.ZERO;
        }
        
        double totalDistance = 0;
        for (int i = 0; i < pathPoints.size() - 1; i++) {
            PathPlanningResponse.PathPoint p1 = pathPoints.get(i);
            PathPlanningResponse.PathPoint p2 = pathPoints.get(i + 1);
            totalDistance += calculateDistance(p1.getLng().doubleValue(), p1.getLat().doubleValue(),
                                               p2.getLng().doubleValue(), p2.getLat().doubleValue());
        }
        
        return new BigDecimal(totalDistance).setScale(2, RoundingMode.HALF_UP);
    }
    
    /**
     * 计算两点之间的距离（Haversine 公式）
     */
    private double calculateDistance(double lng1, double lat1, double lng2, double lat2) {
        double radLat1 = Math.toRadians(lat1);
        double radLat2 = Math.toRadians(lat2);
        double a = radLat1 - radLat2;
        double b = Math.toRadians(lng1) - Math.toRadians(lng2);
        
        double s = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin(a / 2), 2) +
                                           Math.cos(radLat1) * Math.cos(radLat2) *
                                           Math.pow(Math.sin(b / 2), 2)));
        s = s * EARTH_RADIUS;
        
        return s;
    }
    
    /**
     * 计算预计飞行时间
     */
    private Integer calculateEstimatedTime(BigDecimal distance, Uav uav) {
        if (distance == null || distance.compareTo(BigDecimal.ZERO) <= 0) {
            return 0;
        }
        
        // 假设无人机平均速度为 15 m/s (54 km/h)
        double averageSpeed = 15.0;
        double timeInSeconds = distance.doubleValue() / averageSpeed;
        int timeInMinutes = (int) Math.ceil(timeInSeconds / 60);
        
        // 如果有无人机信息，考虑其最大飞行时间
        if (uav != null && uav.getUavMaxFlightTime() != null) {
            timeInMinutes = Math.min(timeInMinutes, uav.getUavMaxFlightTime());
        }
        
        return timeInMinutes;
    }
}
