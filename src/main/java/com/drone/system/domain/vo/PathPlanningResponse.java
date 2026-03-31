package com.drone.system.domain.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

/**
 * 路径规划响应结果
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PathPlanningResponse {
    
    /**
     * 是否成功
     */
    private Boolean success;
    
    /**
     * 消息
     */
    private String message;
    
    /**
     * 路径点列表
     */
    private List<PathPoint> pathPoints;
    
    /**
     * 总距离（米）
     */
    private BigDecimal totalDistance;
    
    /**
     * 预计飞行时间（分钟）
     */
    private Integer estimatedTime;
    
    /**
     * 使用的算法
     */
    private String algorithm;
    
    /**
     * 路径点信息
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PathPoint {
        /**
         * 经度
         */
        private BigDecimal lng;
        
        /**
         * 纬度
         */
        private BigDecimal lat;
        
        /**
         * 高度（米，可选）
         */
        private BigDecimal altitude;
        
        /**
         *  waypoint 序号
         */
        private Integer index;
    }
}
