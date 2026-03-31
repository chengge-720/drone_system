package com.drone.system.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 路径规划请求参数
 */
@Data
public class PathPlanningRequest {
    
    /**
     * 起点经度
     */
    private BigDecimal startLng;
    
    /**
     * 起点纬度
     */
    private BigDecimal startLat;
    
    /**
     * 终点经度
     */
    private BigDecimal endLng;
    
    /**
     * 终点纬度
     */
    private BigDecimal endLat;
    
    /**
     * 无人机 ID
     */
    private Integer uavId;
    
    /**
     * 路径规划算法
     * 1: A*算法
     * 2: Dijkstra 算法
     * 3: 蚁群算法
     * 4: 强化学习模型
     */
    private Integer algorithm;
    
    /**
     * 障碍物列表（可选）
     */
    private List<Obstacle> obstacles;
    
    /**
     * 障碍物信息
     */
    @Data
    public static class Obstacle {
        /**
         * 经度
         */
        private BigDecimal lng;
        
        /**
         * 纬度
         */
        private BigDecimal lat;
        
        /**
         * 半径（米）
         */
        private BigDecimal radius;
    }
}
