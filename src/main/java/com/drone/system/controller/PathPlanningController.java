package com.drone.system.controller;

import com.drone.system.domain.AjaxResult;
import com.drone.system.domain.vo.PathPlanningRequest;
import com.drone.system.domain.vo.PathPlanningResponse;
import com.drone.system.service.IPathPlanningService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.*;

/**
 * 路径规划控制器
 */
@RestController
@RequestMapping("/uavInfo/pathPlanning")
public class PathPlanningController extends BaseController {
    
    @Resource
    private IPathPlanningService pathPlanningService;
    
    /**
     * 执行路径规划
     */
    @PostMapping("/planPath")
    public AjaxResult planPath(@RequestBody PathPlanningRequest request) {
        PathPlanningResponse response = pathPlanningService.planPath(request);
        
        if (response.getSuccess()) {
            return success(response);
        } else {
            return error(response.getMessage());
        }
    }
}
