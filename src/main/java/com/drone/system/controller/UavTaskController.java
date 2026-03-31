package com.drone.system.controller;

import com.drone.system.domain.AjaxResult;
import com.drone.system.domain.TableDataInfo;
import com.drone.system.domain.Uav;
import com.drone.system.domain.UavTask;
import com.drone.system.service.IUavTaskService;
import jakarta.annotation.Resource;
import lombok.Data;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/uavInfo/taskInfo")
public class UavTaskController extends BaseController {

    @Resource
    private IUavTaskService uavTaskService;

    /**
     * 查询任务列表
     */
    @GetMapping("/selectTaskList")
    public TableDataInfo selectTaskList(UavTask uavTask) {
        startPage();
        List<UavTask> list = uavTaskService.selectUavTaskList(uavTask);
        return getDataTable(list);
    }

    /**
     * 查询任务详情
     */
    @GetMapping("/selectTaskByTaskId/{taskId}")
    public AjaxResult selectTaskByTaskId(@PathVariable Integer taskId) {
        return success(uavTaskService.selectUavTaskByTaskId(taskId));
    }

    /**
     * 新增任务
     */
    @PostMapping("/insertTask")
    public AjaxResult insertTask(@RequestBody UavTask uavTask) {
        return toAjax(uavTaskService.insertUavTask(uavTask));
    }

    /**
     * 修改任务
     */
    @PutMapping("/updateTask")
    public AjaxResult updateTask(@RequestBody UavTask uavTask) {
        return toAjax(uavTaskService.updateUavTask(uavTask));
    }

    /**
     * 删除任务
     */
    @DeleteMapping("/deleteTaskByTaskIds/{taskIds}")
    public AjaxResult deleteTaskByTaskIds(@PathVariable Integer[] taskIds) {
        return toAjax(uavTaskService.deleteUavTaskByTaskIds(taskIds));
    }

    /**
     * 获取可用无人机列表（根据任务需求）
     */
    @PostMapping("/getAvailableUavs")
    public AjaxResult getAvailableUavs(@RequestBody TaskParams taskParams) {
        List<Uav> availableUavs = uavTaskService.getAvailableUavs(taskParams.getTaskType(), taskParams.getDistance());
        return success(availableUavs);
    }

    /**
     * 任务参数类
     */
    static class TaskParams {
        private String taskType;
        private double distance;

        public String getTaskType() {
            return taskType;
        }

        public void setTaskType(String taskType) {
            this.taskType = taskType;
        }

        public double getDistance() {
            return distance;
        }

        public void setDistance(double distance) {
            this.distance = distance;
        }
    }
}