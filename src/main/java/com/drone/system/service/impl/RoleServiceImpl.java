package com.drone.system.service.impl;

import com.drone.system.domain.Role;
import com.drone.system.mapper.RoleMapper;
import com.drone.system.service.IRoleService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 角色Service业务层处理
 */
@Service
public class RoleServiceImpl implements IRoleService {
    @Resource
    private RoleMapper roleMapper;

    @Override
    public List<Role> selectRoleList(Role role) {
        return roleMapper.selectRoleList(role);
    }

    @Override
    public Role selectRoleByRoleId(Long roleId) {
        return roleMapper.selectRoleByRoleId(roleId);
    }

    @Override
    public int insertRole(Role role) {
        return roleMapper.insertRole(role);
    }

    @Override
    public int updateRole(Role role) {
        return roleMapper.updateRole(role);
    }

    @Override
    public int deleteRoleByRoleIds(Long[] roleIds) {
        return roleMapper.deleteRoleByRoleIds(roleIds);
    }
}
