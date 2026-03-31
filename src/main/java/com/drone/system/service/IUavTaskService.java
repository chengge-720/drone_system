package com.drone.system.service;

import com.drone.system.domain.Uav;
import com.drone.system.domain.UavTask;

import java.util.List;

public interface IUavTaskService {
    /**
     * 查询任务列表
     *
     * @param uavTask 任务信息
     * @return 任务列表
     */
    List<UavTask> selectUavTaskList(UavTask uavTask);

    /**
     * 根据任务ID查询任务信息
     *
     * @param taskId 任务ID
     * @return 任务信息
     */
    UavTask selectUavTaskByTaskId(Integer taskId);

    /**
     * 新增任务
     *
     * @param uavTask 任务信息
     * @return 结果
     */
    int insertUavTask(UavTask uavTask);

    /**
     * 修改任务
     *
     * @param uavTask 任务信息
     * @return 结果
     */
    int updateUavTask(UavTask uavTask);

    /**
     * 批量删除任务
     *
     * @param taskIds 需要删除的任务ID
     * @return 结果
     */
    int deleteUavTaskByTaskIds(Integer[] taskIds);

    /**
     * 获取可用无人机列表（根据任务需求）
     *
     * @param taskType 任务类型
     * @param distance 任务距离
     * @return 可用无人机列表
     */
    List<Uav> getAvailableUavs(String taskType, double distance);
}