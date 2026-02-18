package com.drone.system.service.impl;


import com.drone.system.domain.User;
import com.drone.system.mapper.UserMapper;
import com.drone.system.service.IUserService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class UserServiceImpl implements IUserService {
    @Resource
    private UserMapper userMapper;
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
    public boolean registerUser(User newUser) {
        //根据用户名查询用户
        User user = userMapper.selectUserByUserName(newUser.getUserName());
        //如果用户已存在，抛出异常
        if(user!=null){
            throw new RuntimeException("用户已存在！");
        }
        //如果用户不存在，新增用户
        return userMapper.insertUser(newUser)>0;
    }

    @Override
    public int updateUserAvatar(Long userId, String avatar) {
        return userMapper.updateUserAvatar(userId,avatar);
    }

    @Override
    public int updateUser(User user) {
        return userMapper.updateUser(user);
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
    public int insertUser(User user) {
        return userMapper.insertUser(user);
    }
}
