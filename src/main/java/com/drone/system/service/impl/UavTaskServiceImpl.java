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
        // 1. 检查续航时间：假设每公里需要 1 分钟续航时间
        boolean hasEnoughFlightTime = uav.getUavMaxFlightTime() != null && uav.getUavMaxFlightTime() >= distance;
        
        // 2. 检查载重能力：载重能力要大于等于两倍的路径距离
        boolean hasEnoughLoadCapacity = uav.getUavMaxLoad() != null && uav.getUavMaxLoad().doubleValue() >= (distance * 2);
        
        // 3. 检查无人机状态：必须是可用状态（1）
        boolean isAvailable = uav.getUavStatus() != null && uav.getUavStatus() == 1;
        
        return hasEnoughFlightTime && hasEnoughLoadCapacity && isAvailable;
    }

    /**
     * 根据任务需求智能推荐最合适的无人机
     *
     * @param task 任务信息
     * @return 推荐的无人机列表（按匹配度排序）
     */
    @Override
    public List<Uav> recommendUavsForTask(UavTask task) {
        // 查询所有可用的无人机
        Uav uav = new Uav();
        uav.setUavStatus(1); // 1-可用
        List<Uav> allUavs = uavMapper.selectUavList(uav);

        // 计算每架无人机的匹配度分数
        List<UavScore> uavScores = new ArrayList<>();
        for (Uav u : allUavs) {
            double score = calculateUavMatchScore(u, task);
            if (score > 0) { // 只添加符合条件的无人机
                uavScores.add(new UavScore(u, score));
            }
        }

        // 按匹配度分数降序排序
        uavScores.sort((a, b) -> Double.compare(b.score, a.score));

        // 提取排序后的无人机列表
        List<Uav> recommendedUavs = new ArrayList<>();
        for (UavScore uavScore : uavScores) {
            recommendedUavs.add(uavScore.uav);
        }

        return recommendedUavs;
    }

    /**
     * 计算无人机与任务的匹配度分数
     *
     * @param uav 无人机信息
     * @param task 任务信息
     * @return 匹配度分数（0-100）
     */
    private double calculateUavMatchScore(Uav uav, UavTask task) {
        double score = 0;

        // 1. 基础适配性检查（不满足直接返回 0）
        // 续航时间检查（公里转分钟，假设平均速度 10m/s = 36km/h）
        double requiredFlightTime = task.getMaxDistance() * 60 / 36; // 转换为分钟
        if (uav.getUavMaxFlightTime() == null || uav.getUavMaxFlightTime() < requiredFlightTime) {
            return 0; // 续航不足，直接淘汰
        }
        score += 30; // 续航达标得 30 分

        // 载重能力检查
        if (task.getRequiredLoad() != null && task.getRequiredLoad() > 0) {
            if (uav.getUavMaxLoad() == null || uav.getUavMaxLoad().doubleValue() < task.getRequiredLoad()) {
                return 0; // 载重不足，直接淘汰
            }
            score += 25; // 载重达标得 25 分
        } else {
            score += 25; // 没有载重要求，默认得分
        }

        // 2. 紧急程度匹配（紧急任务优先选择续航长的）
        if (task.getUrgency() != null) {
            switch (task.getUrgency()) {
                case 3: // 非常紧急
                    // 优先选择续航时间最长的
                    score += (uav.getUavMaxFlightTime() / 10.0); // 最多 10 分
                    break;
                case 2: // 紧急
                    // 优先选择速度快的（这里简化处理，用续航代表速度）
                    score += (uav.getUavMaxFlightTime() / 20.0); // 最多 5 分
                    break;
                default: // 普通
                    score += 5; // 普通任务不需要额外加分
                    break;
            }
        }

        // 3. 距离适配性（避免大材小用）
        double distanceFactor = 1.0;
        if (task.getMaxDistance() != null && task.getMaxDistance() > 0) {
            // 实际需要的续航是任务距离的 1.5 倍作为安全余量
            double neededRange = task.getMaxDistance() * 1.5;
            if (uav.getUavMaxFlightTime() != null) {
                // 无人机续航（分钟）转换为公里数
                double uavRange = uav.getUavMaxFlightTime() * 36 / 60;
                if (uavRange >= neededRange && uavRange <= neededRange * 2) {
                    distanceFactor = 1.0; // 完美匹配
                    score += 20; // 完美匹配得 20 分
                } else if (uavRange > neededRange * 2) {
                    distanceFactor = 0.7; // 性能过剩
                    score += 10; // 性能过剩得 10 分
                } else {
                    distanceFactor = 0.5; // 勉强够用
                    score += 5; // 勉强够用得 5 分
                }
            }
        }

        // 4. 任务类型适配性
        if (task.getTaskType() != null && !task.getTaskType().isEmpty()) {
            // 如果无人机类型与任务类型匹配，加分
            if (uav.getUavType() != null && uav.getUavType().contains(task.getTaskType())) {
                score += 15; // 类型匹配得 15 分
            } else {
                score += 8; // 类型不匹配但也有基础分
            }
        }

        return score;
    }

    /**
     * 无人机评分内部类
     */
    private static class UavScore {
        Uav uav;
        double score;

        public UavScore(Uav uav, double score) {
            this.uav = uav;
            this.score = score;
        }
    }
}