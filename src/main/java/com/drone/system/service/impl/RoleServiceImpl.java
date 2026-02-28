package com.drone.system.service.impl;

import com.drone.system.domain.Role;
import com.drone.system.domain.RoleMenu;
import com.drone.system.mapper.RoleMapper;
import com.drone.system.mapper.RoleMenuMapper;
import com.drone.system.service.IRoleService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * 角色Service业务层处理
 */
@Service
public class RoleServiceImpl implements IRoleService {
    @Resource
    private RoleMapper roleMapper;

    @Resource
    private RoleMenuMapper roleMenuMapper;

    @Override
    public List<Role> selectRoleList(Role role) {
        return roleMapper.selectRoleList(role);
    }

    @Override
    public Role selectRoleByRoleId(Long roleId) {
        return roleMapper.selectRoleByRoleId(roleId);
    }

    @Override
    @Transactional
    public int insertRole(Role role) {
        //新增角色并获取角色ID
        roleMapper.insertRole(role);
        //添加角色菜单关联
        return insertRoleMenu(role);
    }

    @Override
    @Transactional
    public int updateRole(Role role) {
        //更新角色信息
        roleMapper.updateRole(role);
        //根据角色ID删除角色菜单关联
        roleMenuMapper.deleteRoleMenuByRoleId(role.getRoleId());
        //删除之前的关联信息之后再添加新的关联信息
        return insertRoleMenu(role);
    }

    public int insertRoleMenu(Role role) {
        int rows = 1;
        ArrayList<RoleMenu> list = new ArrayList<>();
        for (Long menuId : role.getMenuIds()) {
            RoleMenu rm = new RoleMenu();
            rm.setRoleId(role.getRoleId());
            rm.setMenuId(menuId);
            list.add(rm);
        }
        if(list.size() > 0){
            //批量新增角色菜单关联
            rows = roleMenuMapper.batchRoleMenu(list);
        }
        return rows;
    }

    @Override
    @Transactional
    public int deleteRoleByRoleIds(Long[] roleIds) {
        //删除角色菜单关联，先删除关联，再删除角色
        roleMenuMapper.deleteRoleMenuByRoleIds(roleIds);
        return roleMapper.deleteRoleByRoleIds(roleIds);
    }
}
