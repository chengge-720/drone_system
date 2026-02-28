package com.drone.system.mapper;

import com.drone.system.domain.RoleMenu;
import org.apache.ibatis.annotations.Mapper;

import java.util.ArrayList;

/**
 * 角色与菜单关联 Mapper
 */
@Mapper
public interface RoleMenuMapper {
    /**
     * 根据角色ID删除角色和菜单关联
     * @param roleId 角色ID
     * @return 结果
     */
    int deleteRoleMenuByRoleId(Long roleId);

    /**
     * 批量新增角色菜单信息
     * @param roleMenuList 角色菜单列表
     * @return 结果
     */
    int batchRoleMenu(ArrayList<RoleMenu> roleMenuList);

    /**
     * 根据角色ID批量删除角色菜单信息
     * @param roleIds 角色ID列表
     * @return 删除结果
     */
    int deleteRoleMenuByRoleIds(Long[] roleIds);
}
