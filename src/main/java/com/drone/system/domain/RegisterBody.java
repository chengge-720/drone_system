package com.drone.system.domain;

import lombok.Data;

/**
 * 用户注册对象
 */
@Data
public class RegisterBody {
    private String userName;
    private String password;
}
