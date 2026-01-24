package com.drone.system.service.impl;


import com.drone.system.domain.User;
import com.drone.system.mapper.UserMapper;
import com.drone.system.service.IUserService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

@Service
public class UserServiceImpl implements IUserService {
    @Resource
    private UserMapper userMapper;

    @Override
    public User selectUserByUserName(String userName) {
        return userMapper.selectUserByUserName(userName);
    }
}
