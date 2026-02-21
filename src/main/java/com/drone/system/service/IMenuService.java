package com.drone.system.service;

import com.drone.system.domain.AjaxResult;
import com.drone.system.domain.Menu;
import com.drone.system.domain.TreeSelect;

import java.util.List;

/**
 * 菜单Service接口
 */
public interface IMenuService {
    /**
     * 获取菜单列表
     */
    List<Menu> selectMenuList(Menu menu ,Long userId);

    /**
     * 新增菜单
     */
    int insertMenu(Menu menu);

    /**
     * 根据菜单ID查询菜单详情
     */
    Menu selectMenuByMenuId(Long menuId);

    /**
     * 修改菜单
     */
    int updateMenu(Menu menu);

    /**
     * 删除菜单
     */
    int deleteMenuByMenuId(Long menuId);

    /**
     * 根据角色ID查询对应的菜单ID
     * @param roleId 角色ID
     * @return 角色对应的菜单ID列表
     */
    List<Long> selectMenuListByRoleId(Long roleId);

    /**
     * 构建菜单树
     * @param menus 菜单列表
     * @return 构建后的菜单树
     */
    List<TreeSelect> buildMenuTreeSelect(List<Menu> menus);
}
