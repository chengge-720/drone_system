package com.drone.system.service.impl;

import com.drone.system.constants.RoleIdConstants;
import com.drone.system.domain.Menu;
import com.drone.system.mapper.MenuMapper;
import com.drone.system.mapper.UserRoleMapper;
import com.drone.system.service.IMenuService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;

/**
 * 菜单Service业务层处理
 */
@Service
public class IMenuServiceImpl implements IMenuService {
    @Resource
    private MenuMapper menuMapper;

    @Resource
    private UserRoleMapper userRoleMapper;

    @Override
    public List<Menu> selectMenuList(Menu menu ,Long userId) {
        //根据用户ID查询对应的用户角色
        Long roleId = userRoleMapper.selectRoleIdByUserId(userId);
        //根据用户角色查询对应的菜单
        //管理员显示所有菜单
        if(roleId.equals(RoleIdConstants.ADMIN_ROLE_ID)) {
            return menuMapper.selectMenuListByUserId(menu);
        }else {//普通用户显示对应角色的菜单
            //设置用户ID
            menu.setUserId(userId);
            return menuMapper.selectMenuListByUserId(menu);
        }
    }
}
