package com.drone.system.domain;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.util.Date;

@Data
public class Role {
    //角色ID
    private Long roleId;

    //角色名称
    private String roleName;

    //显示顺序
    private Integer roleSort;

    //创建时间
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date createTime;

}
