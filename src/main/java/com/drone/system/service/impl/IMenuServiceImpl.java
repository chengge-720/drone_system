package com.drone.system.service.impl;

import com.drone.system.constants.RoleIdConstants;
import com.drone.system.domain.Menu;
import com.drone.system.domain.TreeSelect;
import com.drone.system.mapper.MenuMapper;
import com.drone.system.mapper.UserRoleMapper;
import com.drone.system.service.IMenuService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

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

    @Override
    public int insertMenu(Menu menu) {
        return menuMapper.insertMenu(menu);
    }

    @Override
    public Menu selectMenuByMenuId(Long menuId) {
        return menuMapper.selectMenuByMenuId(menuId);
    }

    @Override
    public int updateMenu(Menu menu) {
        return menuMapper.updateMenu(menu);
    }

    @Override
    public int deleteMenuByMenuId(Long menuId) {
        return menuMapper.deleteMenuByMenuId(menuId);
    }

    @Override
    public List<Long> selectMenuListByRoleId(Long roleId) {
        return menuMapper.selectMenuListByRoleId(roleId);
    }

    @Override
    public List<TreeSelect> buildMenuTreeSelect(List<Menu> menus) {
        //将顺序的菜单转换为树形结构
        List<Menu> menuTrees = buildMenuTree(menus);
        //将树形Menu对象转换为TreeSelect对象
        return menuTrees.stream()
                .map(TreeSelect::new)
                .collect(Collectors.toList());
    }

    /**
     * 构建菜单树
     * @param menus 菜单列表
     * @return 构建后的菜单树
     */
    public List<Menu> buildMenuTree(List<Menu> menus) {
        //去除重复的菜单，以menuId为key
        LinkedHashMap<Long, Menu> uniqueMenusMap = new LinkedHashMap<>();
        for(Menu menu: menus){
            //去重
            if(!uniqueMenusMap.containsKey(menu.getMenuId())){
                uniqueMenusMap.put(menu.getMenuId(), menu);
            }
        }
        //转化为去重的菜单列表
        ArrayList<Menu> uniqueMenus = new ArrayList<>(uniqueMenusMap.values());
        //定义最终菜单列表
        ArrayList<Menu> returnlist = new ArrayList<>();
        //将菜单列表转换为MAP，快速查找
        HashMap<Long, Menu> menuMap = new HashMap<>();
        for(Menu menu: uniqueMenus){
            menuMap.put(menu.getMenuId(), menu);
            //确保每个菜单都有初始化children列表
            if(menu.getChildren() == null){
                menu.setChildren(new ArrayList<>());
            }else {
                //清空列表现有的children列表，避免重复添加
                menu.getChildren().clear();
            }
        }
        //查找顶级菜单
        HashSet<Long> addedTopMenuIds = new HashSet<>();
        for(Menu menu: uniqueMenus){
            if(menu.getParentId() == 0 || menu.getParentId() == null){
                //添加顶级菜单
                if(!addedTopMenuIds.contains(menu.getMenuId())){
                    returnlist.add(menu);
                    addedTopMenuIds.add(menu.getMenuId());
                }
            }else {
                //不是顶级菜单
                Menu parentMenu = menuMap.get(menu.getParentId());
                if(parentMenu != null){
                    //添加子菜单
                    parentMenu.getChildren().add(menu);
                }else {
                    //父菜单不存在
                    //添加为顶级菜单
                    if(!addedTopMenuIds.contains(menu.getMenuId())){
                        returnlist.add(menu);
                        addedTopMenuIds.add(menu.getMenuId());
                    }
                }
            }
        }
        return returnlist;
    }
}
