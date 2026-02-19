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
}
