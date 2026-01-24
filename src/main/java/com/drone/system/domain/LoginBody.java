package com.drone.system.domain;

import lombok.Data;

/**
 * 用户登录对象
 */
@Data
public class LoginBody {
    private String userName;
    private String password;
}
