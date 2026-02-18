package com.drone.system.mapper;

import com.drone.system.domain.User;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

/**
 * 用户Mapper
 */
@Mapper
public interface UserMapper {
    /**
     * 根据用户名查询用户
     */
    public User selectUserByUserName(String userName);

    User selectUserByUserId(Long userId);

    /**
     * 新增用户
     * @param user
     * @return
     */
    int insertUser(User user);

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
     * 查询用户列表
     * @param user
     * @return
     */
    List<User> selectUserList(User user);

    int deleteUserByUserIds(Long[] userIds);
}
