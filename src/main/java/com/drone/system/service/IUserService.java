package com.drone.system.service;

import com.drone.system.domain.User;

/**
 * 用户Service接口
 */
public interface IUserService {

    public User selectUserByUserName(String userName);

    /**
     * 通过用户Id查询用户信息
     * @param userId
     * @return
     */
    User selectUserByUserId(Long userId);

    /**
     * 注册用户
     * @param newUser
     * @return
     */
    boolean registerUser(User newUser);

    /**
     * 更新用户头像
     * @param userId
     * @param avatar
     * @return
     */
    int updateUserAvatar(Long userId, String avatar);

    /**
     * 修改用户信息
     * @param user
     * @return
     */
    int updateUser(User user);
}
