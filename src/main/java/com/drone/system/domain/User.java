package com.drone.system.domain;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * 用户对象User
 */
@Data//自动生产set,get方法
@AllArgsConstructor//自动构造生成类
@NoArgsConstructor
public class User {
    //用户ID
    private Long userId;
    //用户名
    private String userName;
    //用户性别
    private Integer sex;
    //用户头像
    private String avatar;
    //用户密码
    private String password;
    //创建时间,并控制输出格式
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date createTime;
    //角色ID，用于关联角色权限控制
    private Long roleId;
    //角色名称，用于前端显示并查询
    private String roleName;
}
