package com.drone.system.service;

import com.drone.system.domain.Role;
import java.util.List;

/**
 * 角色Service接口
 */
public interface IRoleService {

    /**
     * 查询角色列表
     * @return
     */
    List<Role> selectRoleList(Role role);

    /**
     * 根据角色ID查询角色
     * @param roleId
     * @return
     */
    Role selectRoleByRoleId(Long roleId);

    /**
     * 添加角色
     * @param role
     * @return
     */
    int insertRole(Role role);

    /**
     * 修改角色
     * @param role
     * @return
     */
    int updateRole(Role role);

    int deleteRoleByRoleIds(Long[] roleIds);
}
