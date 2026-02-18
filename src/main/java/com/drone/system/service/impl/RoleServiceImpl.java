package com.drone.system.service.impl;

import com.drone.system.mapper.RoleMapper;
import com.drone.system.service.IRoleService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

/**
 * 角色Service业务层处理
 */
@Service
public class RoleServiceImpl implements IRoleService {
    @Resource
    private RoleMapper roleMapper;
}
