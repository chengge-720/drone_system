package com.drone.system.service.impl;

import com.drone.system.domain.Uav;
import com.drone.system.domain.UavTask;
import com.drone.system.mapper.UavMapper;
import com.drone.system.mapper.UavTaskMapper;
import com.drone.system.service.IUavTaskService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class UavTaskServiceImpl implements IUavTaskService {

    @Resource
    private UavTaskMapper uavTaskMapper;

    @Resource
    private UavMapper uavMapper;

    @Override
    public List<UavTask> selectUavTaskList(UavTask uavTask) {
        List<UavTask> taskList = uavTaskMapper.selectUavTaskList(uavTask);
        // 关联查询无人机信息，填充uavModel字段
        for (UavTask task : taskList) {
            if (task.getUavId() != null) {
                Uav uav = uavMapper.selectUavByUavId(task.getUavId());
                if (uav != null) {
                    task.setUavModel(uav.getUavModel());
                }
            }
        }
        return taskList;
    }

    @Override
    public UavTask selectUavTaskByTaskId(Integer taskId) {
        UavTask task = uavTaskMapper.selectUavTaskByTaskId(taskId);
        // 关联查询无人机信息，填充uavModel字段
        if (task != null && task.getUavId() != null) {
            Uav uav = uavMapper.selectUavByUavId(task.getUavId());
            if (uav != null) {
                task.setUavModel(uav.getUavModel());
            }
        }
        return task;
    }

    @Override
    public int insertUavTask(UavTask uavTask) {
        // 设置任务状态为待执行
        if (uavTask.getStatus() == null) {
            uavTask.setStatus(1);
        }
        int result = uavTaskMapper.insertUavTask(uavTask);
        return result;
    }

    @Override
    public int updateUavTask(UavTask uavTask) {
        // 获取原任务信息
        UavTask oldTask = uavTaskMapper.selectUavTaskByTaskId(uavTask.getTaskId());
        
        int result = uavTaskMapper.updateUavTask(uavTask);
        
        // 处理无人机状态变化
        handleUavStatusChange(oldTask, uavTask);
        
        return result;
    }

    @Override
    public int deleteUavTaskByTaskIds(Integer[] taskIds) {
        // 获取要删除的任务信息
        List<UavTask> tasksToDelete = new ArrayList<>();
        for (Integer taskId : taskIds) {
            UavTask task = uavTaskMapper.selectUavTaskByTaskId(taskId);
            if (task != null) {
                tasksToDelete.add(task);
            }
        }
        
        int result = uavTaskMapper.deleteUavTaskByTaskIds(taskIds);
        
        // 恢复被删除任务的无人机状态
        for (UavTask task : tasksToDelete) {
            if (task.getUavId() != null) {
                Uav uav = uavMapper.selectUavByUavId(task.getUavId());
                if (uav != null) {
                    uav.setUavStatus(1); // 恢复为可用状态
                    uavMapper.updateUav(uav);
                }
            }
        }
        
        return result;
    }
    
    /**
     * 处理任务状态变化时的无人机状态更新
     * @param oldTask 旧任务信息
     * @param newTask 新任务信息
     */
    private void handleUavStatusChange(UavTask oldTask, UavTask newTask) {
        // 处理旧无人机的状态
        if (oldTask != null && oldTask.getUavId() != null) {
            Uav oldUav = uavMapper.selectUavByUavId(oldTask.getUavId());
            if (oldUav != null) {
                // 如果任务状态从执行中变为其他状态，或者更换了无人机，将旧无人机恢复为可用
                if ((oldTask.getStatus() == 2 && newTask.getStatus() != 2) || !oldTask.getUavId().equals(newTask.getUavId())) {
                    oldUav.setUavStatus(1); // 恢复为可用状态
                    uavMapper.updateUav(oldUav);
                }
            }
        }
        
        // 处理新无人机的状态
        if (newTask.getUavId() != null) {
            Uav newUav = uavMapper.selectUavByUavId(newTask.getUavId());
            if (newUav != null) {
                // 如果任务状态为执行中，将无人机设置为任务中状态
                if (newTask.getStatus() == 2) {
                    newUav.setUavStatus(2); // 设置为任务中状态
                    uavMapper.updateUav(newUav);
                } else if (newTask.getStatus() != 2) {
                    // 如果任务状态不是执行中，将无人机设置为可用状态
                    newUav.setUavStatus(1); // 设置为可用状态
                    uavMapper.updateUav(newUav);
                }
            }
        }
    }

    @Override
    public List<Uav> getAvailableUavs(String taskType, double distance) {
        // 查询所有可用的无人机（状态为1-可用）
        Uav uav = new Uav();
        uav.setUavStatus(1); // 1-可用
        List<Uav> allUavs = uavMapper.selectUavList(uav);

        // 筛选符合任务需求的无人机
        List<Uav> availableUavs = new ArrayList<>();
        for (Uav u : allUavs) {
            // 检查无人机是否符合任务要求
            if (isUavSuitableForTask(u, taskType, distance)) {
                availableUavs.add(u);
            }
        }

        return availableUavs;
    }

    /**
     * 判断无人机是否适合执行任务
     *
     * @param uav 无人机信息
     * @param taskType 任务类型
     * @param distance 任务距离
     * @return 是否适合
     */
    private boolean isUavSuitableForTask(Uav uav, String taskType, double distance) {
        // 1. 检查续航时间：假设每公里需要1分钟续航时间
        boolean hasEnoughFlightTime = uav.getUavMaxFlightTime() != null && uav.getUavMaxFlightTime() >= distance;
        
        // 2. 检查载重能力：载重能力要大于等于两倍的路径距离
        boolean hasEnoughLoadCapacity = uav.getUavMaxLoad() != null && uav.getUavMaxLoad().doubleValue() >= (distance * 2);
        
        // 3. 检查无人机状态：必须是可用状态（1）
        boolean isAvailable = uav.getUavStatus() != null && uav.getUavStatus() == 1;
        
        return hasEnoughFlightTime && hasEnoughLoadCapacity && isAvailable;
    }
}