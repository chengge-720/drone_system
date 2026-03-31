package com.drone.system.service;

import com.drone.system.domain.vo.PathPlanningRequest;
import com.drone.system.domain.vo.PathPlanningResponse;

/**
 * 路径规划服务接口
 */
public interface IPathPlanningService {
    
    /**
     * 执行路径规划
     * 
     * @param request 路径规划请求
     * @return 路径规划结果
     */
    PathPlanningResponse planPath(PathPlanningRequest request);
}
