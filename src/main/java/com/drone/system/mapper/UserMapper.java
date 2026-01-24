package com.drone.system.mapper;

import com.drone.system.domain.User;
import org.apache.ibatis.annotations.Mapper;

/**
 * 用户Mapper
 */
@Mapper
public interface UserMapper {
    /**
     * 根据用户名查询用户
     */
    public User selectUserByUserName(String userName);
}
