package com.drone.system.domain;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.util.Date;

@Data
public class UavTask {
    /**
     * 任务ID
     */
    private Integer taskId;

    /**
     * 任务名称
     */
    private String taskName;

    /**
     * 任务类型
     */
    private String taskType;

    /**
     * 起始地点
     */
    private String startLocation;

    /**
     * 终点
     */
    private String endLocation;

    /**
     * 任务描述
     */
    private String description;

    /**
     * 无人机ID
     */
    private Integer uavId;

    /**
     * 无人机型号
     */
    private String uavModel;

    /**
     * 任务状态：1-待执行，2-执行中，3-已完成，4-已取消
     */
    private Integer status;

    /**
     * 创建时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date createTime;

    /**
     * 更新时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date updateTime;
}