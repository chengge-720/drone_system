package com.drone.system.service;

import com.drone.system.domain.User;

import java.util.List;

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

    /**
     * 修改用户密码
     * @param userId
     * @param newPassword
     * @return
     */
    int resetUserPwd(Long userId, String newPassword);

    /**
     * 获取用户列表
     * @param user
     * @return
     */
    List<User> selectUserList(User user);
}
