package com.drone.system.service;

import com.drone.system.domain.AjaxResult;
import com.drone.system.domain.Menu;
import com.drone.system.domain.TreeSelect;
import com.drone.system.domain.vo.RouterVo;

import java.util.List;

/**
 * 菜单Service接口
 */
public interface IMenuService {
    /**
     * 获取菜单列表
     * @param menu 查询条件
     * @param userId 用户ID
     * @return 菜单列表
     */
    List<Menu> selectMenuList(Menu menu ,Long userId);

    /**
     * 新增菜单
     * @param menu 菜单信息
     * @return 新增结果（1成功，0失败
     */
    int insertMenu(Menu menu);

    /**
     * 根据菜单ID查询菜单详情
     * @param menuId 菜单ID
     * @return 菜单详情
     */
    Menu selectMenuByMenuId(Long menuId);

    /**
     * 修改菜单
     * @param menu 菜单信息
     * @return 更新结果（1成功，0失败）
     */
    int updateMenu(Menu menu);

    /**
     * 删除菜单
     * @param menuId 菜单ID
     * @return 删除结果（1成功，0失败）
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

    /**
     * 根据用户ID查询对应的菜单树路由
     * @param userId 用户ID
     * @return 用户对应的菜单树路由列表
     */
    List<RouterVo> selectMenuTreeRoutersByUserId(Long userId);
}
