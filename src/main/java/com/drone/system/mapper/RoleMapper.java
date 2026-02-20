package com.drone.system.mapper;

import com.drone.system.domain.Role;

import java.util.List;

public interface RoleMapper {
    List<Role> selectRoleList(Role role);

    Role selectRoleByRoleId(Long roleId);

    int insertRole(Role role);
}
