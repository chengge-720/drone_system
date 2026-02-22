package com.drone.system.domain;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.util.Date;

@Data
public class Uav {
    //无人机ID
    private Integer uavId;

    //无人机编号
    private String uavCode;

    //无人机型号
    private String uavModel;

    //无人机类型
    private String uavType;

    //无人机最大续航时长
    private Integer uavMaxFlightTime;

    //无人机最大载重
    private BigDecimal uavMaxLoad;

    //无人机电池类型
    private String uavBatteryType;

    //无人机电池容量
    private BigDecimal uavBatteryCapacity;

    //无人机生产厂商
    private String uavManufacturer;

    //无人机状态 (1:正常, 2:任务中, 3:维修中, 4:停用)
    private Integer uavStatus;

    //备注
    private String remark;

    //创建时间
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date createTime;
}
