package com.drone.system.service;

import com.drone.system.domain.User;

/**
 * 用户Service接口
 */
public interface IUserService {

    public User selectUserByUserName(String userName);

}
