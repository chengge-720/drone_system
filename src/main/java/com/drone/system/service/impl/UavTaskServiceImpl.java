package com.drone.system.service.impl;

import com.drone.system.domain.Uav;
import com.drone.system.domain.UavTask;
import com.drone.system.mapper.UavMapper;
import com.drone.system.mapper.UavTaskMapper;
import com.drone.system.service.IUavTaskService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
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

        // 任务完成时扣减无人机剩余电量
        deductBatteryWhenTaskCompleted(oldTask, uavTask);
        
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

    private static final double BATTERY_SAFETY_FACTOR = 1.1;

    /**
     * 计算无人机满电时的最大航程（公里）
     */
    private double getMaxRangeKm(Uav uav) {
        if (uav.getUavMaxFlightTime() == null || uav.getUavMaxFlightTime() <= 0) {
            return 0;
        }
        double speed = uav.getUavMaxSpeed() != null ? uav.getUavMaxSpeed().doubleValue() : 10.0;
        return uav.getUavMaxFlightTime() * 60.0 * speed / 1000.0;
    }

    /**
     * 根据剩余电量百分比计算当前可飞行航程（公里）
     */
    private double getRemainingRangeKm(Uav uav) {
        double maxRange = getMaxRangeKm(uav);
        if (maxRange <= 0) {
            return 0;
        }
        double batteryPercent = uav.getUavRemainingBattery() != null
                ? uav.getUavRemainingBattery().doubleValue()
                : 100.0;
        return maxRange * batteryPercent / 100.0;
    }

    /**
     * 判断剩余电量航程是否满足任务需求（需覆盖任务距离的110%）
     */
    private boolean hasEnoughBatteryForTask(Uav uav, double taskDistanceKm) {
        if (taskDistanceKm <= 0) {
            return true;
        }
        return getRemainingRangeKm(uav) >= taskDistanceKm * BATTERY_SAFETY_FACTOR;
    }

    /**
     * 任务完成后按飞行距离比例扣减剩余电量
     */
    private void deductBatteryWhenTaskCompleted(UavTask oldTask, UavTask newTask) {
        if (newTask == null || newTask.getStatus() == null || newTask.getStatus() != 3) {
            return;
        }
        if (oldTask != null && oldTask.getStatus() != null && oldTask.getStatus() == 3) {
            return;
        }
        if (newTask.getUavId() == null || newTask.getMaxDistance() == null || newTask.getMaxDistance() <= 0) {
            return;
        }

        Uav uav = uavMapper.selectUavByUavId(newTask.getUavId());
        if (uav == null) {
            return;
        }

        double maxRange = getMaxRangeKm(uav);
        if (maxRange <= 0) {
            return;
        }

        double consumedPercent = (newTask.getMaxDistance() / maxRange) * 100.0;
        double currentPercent = uav.getUavRemainingBattery() != null
                ? uav.getUavRemainingBattery().doubleValue()
                : 100.0;
        double newPercent = Math.max(0, currentPercent - consumedPercent);
        uav.setUavRemainingBattery(
                BigDecimal.valueOf(newPercent).setScale(2, RoundingMode.HALF_UP)
        );
        uavMapper.updateUav(uav);
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
        // 1. 检查续航时间
        boolean hasEnoughFlightTime = uav.getUavMaxFlightTime() != null && uav.getUavMaxFlightTime() >= distance;
        
        // 2. 检查载重能力
        boolean hasEnoughLoadCapacity = uav.getUavMaxLoad() != null && uav.getUavMaxLoad().doubleValue() >= (distance * 2);
        
        // 3. 检查无人机状态
        boolean isAvailable = uav.getUavStatus() != null && uav.getUavStatus() == 1;

        // 4. 检查剩余电量航程是否覆盖任务距离的110%
        boolean hasEnoughBattery = hasEnoughBatteryForTask(uav, distance);
        
        return hasEnoughFlightTime && hasEnoughLoadCapacity && isAvailable && hasEnoughBattery;
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

        double taskDistance = task.getMaxDistance() != null ? task.getMaxDistance() : 0;

        // 剩余电量航程不足任务距离110%时直接淘汰
        if (!hasEnoughBatteryForTask(uav, taskDistance)) {
            return 0;
        }

        // 1. 基础适配性检查（不满足直接返回 0）
        double speed = uav.getUavMaxSpeed() != null ? uav.getUavMaxSpeed().doubleValue() : 10.0;
        double requiredFlightTime = taskDistance * 1000 / speed / 60; // 公里转分钟
        if (uav.getUavMaxFlightTime() == null || uav.getUavMaxFlightTime() < requiredFlightTime) {
            return 0;
        }
        score += 30;

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
        if (taskDistance > 0) {
            double neededRange = taskDistance * BATTERY_SAFETY_FACTOR;
            double remainingRange = getRemainingRangeKm(uav);
            if (remainingRange >= neededRange && remainingRange <= neededRange * 2) {
                score += 20;
            } else if (remainingRange > neededRange * 2) {
                score += 10;
            } else {
                score += 5;
            }
        }

        // 4. 剩余电量越高，匹配度略加分
        if (uav.getUavRemainingBattery() != null) {
            score += uav.getUavRemainingBattery().doubleValue() / 20.0;
        }

        // 5. 任务类型适配性
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