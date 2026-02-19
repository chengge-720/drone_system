package com.drone.system.service.impl;


import com.drone.system.constants.RoleIdConstants;
import com.drone.system.domain.User;
import com.drone.system.mapper.RoleMapper;
import com.drone.system.mapper.UserMapper;
import com.drone.system.mapper.UserRoleMapper;
import com.drone.system.service.IUserService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class UserServiceImpl implements IUserService {
    @Resource
    private UserMapper userMapper;

    @Resource
    private UserRoleMapper userRoleMapper;
    //通过用户名查询用户
    @Override
    public User selectUserByUserName(String userName) {
        return userMapper.selectUserByUserName(userName);
    }
    //通过用户ID查询用户
    @Override
    public User selectUserByUserId(Long userId) {
        return userMapper.selectUserByUserId(userId);
    }
    //新增用户
    @Override
    @Transactional//事务管理,用于保证两次数据库操作的原子性,如果其中任何一次操作失败,则回滚所有操作
    public boolean registerUser(User newUser) {
        //根据用户名查询用户
        User user = userMapper.selectUserByUserName(newUser.getUserName());
        //如果用户已存在，抛出异常
        if(user!=null){
            throw new RuntimeException("用户已存在！");
        }
        //如果用户不存在，新增用户
        int i = userMapper.insertUser(newUser);
        //注册用户默认为角色为普通用户
        userRoleMapper.insertUserRole(newUser.getUserId(), RoleIdConstants.USER_ROLE_ID);
        return i > 0;
    }

    @Override
    public int updateUserAvatar(Long userId, String avatar) {
        return userMapper.updateUserAvatar(userId,avatar);
    }

    /**
     * 修改用户信息
     * @param user
     * @return
     */
    @Override
    @Transactional//事务管理,用于保证两次数据库操作的原子性,如果其中任何一次操作失败,则回滚所有操作
    public int updateUser(User user) {
        //先修改用户信息
        userMapper.updateUser(user);
        //删除之前的角色关联(根据用户ID删除用户和角色关联)
        userRoleMapper.deleteUserRoleByUserId(user.getUserId());
        //新增修改后的用户和角色关联
        return userRoleMapper.insertUserRole(user.getUserId(),user.getRoleId());
    }

    @Override
    public int resetUserPwd(Long userId, String newPassword) {
        return userMapper.resetUserPwd(userId,newPassword);
    }

    @Override
    public List<User> selectUserList(User user) {
        return userMapper.selectUserList(user);
    }

    @Override
    @Transactional//事务管理,用于保证两次数据库操作的原子性,如果其中任何一次操作失败,则回滚所有操作
    public int insertUser(User user) {
        //新增用户
        userMapper.insertUser(user);
        //新增用户和角色关联
        return userRoleMapper.insertUserRole(user.getUserId(),user.getRoleId());
    }

    @Override
    public int deleteUserByUserIds(Long[] userIds) {
        //批量删除用户和角色关联(根据用户ID删除用户和角色关联)
        userRoleMapper.deleteUserRoles(userIds);
        return userMapper.deleteUserByUserIds(userIds);
    }
}
