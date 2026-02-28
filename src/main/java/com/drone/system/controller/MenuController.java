package com.drone.system.controller;

import com.drone.system.domain.AjaxResult;
import com.drone.system.domain.Menu;
import com.drone.system.domain.vo.RouterVo;
import com.drone.system.service.IMenuService;
import com.drone.system.utils.SecurityUtils;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 菜单信息控制
 */
@RestController
@RequestMapping("/system/menu")
public class MenuController extends BaseController {
    @Resource
    private IMenuService menuService;

    /**
     * 获取菜单列表
     *
     * @return
     */
    @GetMapping("/selectMenuList")
    public AjaxResult selectMenuList(Menu menu) {
        List<Menu> list = menuService.selectMenuList(menu, SecurityUtils.getUserId());
        return success(list);
    }

    /**
     * 新增菜单
     */
    @PostMapping("/insertMenu")
    public AjaxResult insertMenu(@RequestBody Menu menu) {
        return toAjax(menuService.insertMenu(menu));
    }

    /**
     * 根据菜单ID查询菜单详情
     */
    @GetMapping("/selectMenuByMenuId/{menuId}")
    public AjaxResult selectMenuByMenuId(@PathVariable Long menuId) {
        return success(menuService.selectMenuByMenuId(menuId));
    }

    /**
     * 修改菜单
     */
    @PutMapping("/updateMenu")
    public AjaxResult updateMenu(@RequestBody Menu menu) {
        //上级菜单不能选择自己或其子菜单
        if (menu.getParentId().equals(menu.getMenuId())) {
            return AjaxResult.error("上级菜单不能选择自己!");
        }
        return toAjax(menuService.updateMenu(menu));
    }

    /**
     * 删除菜单
     */
    @DeleteMapping("/deleteMenuByMenuId/{menuId}")
    public AjaxResult deleteMenuByMenuId(@PathVariable Long menuId) {
        return toAjax(menuService.deleteMenuByMenuId(menuId));
    }

    /**
     * 根据角色ID查询对应的菜单树
     */
    @GetMapping("/selectRoleMenuTree/{roleId}")
    public AjaxResult selectRoleMenuTree(@PathVariable Long roleId) {
        //获取所有菜单列表
        List<Menu> menus = menuService.selectMenuList(new Menu(), SecurityUtils.getUserId());
        //获取角色对应的菜单树
        AjaxResult ajax = AjaxResult.success();
        //获取角色对应的菜单ID列表放入checkedKeys
        ajax.put("checkedKeys", menuService.selectMenuListByRoleId(roleId));
        //构建前端所需的下拉菜单树形结构
        ajax.put("menus", menuService.buildMenuTreeSelect(menus));
        return ajax;
    }

    /**
     * 查询前端所需要的下拉菜单树形结构
     */
    @GetMapping("/selectRoleMenusTree")
    public AjaxResult selectRoleMenusTree() {
        List<Menu> menus = menuService.selectMenuList(new Menu(), SecurityUtils.getUserId());
        return success(menuService.buildMenuTreeSelect(menus));
    }

    /**
     * 获取路由权限
     * 获取用户所有的菜单权限，用于前端动态生成路由
     */
     @GetMapping("/getRouters")
    public AjaxResult getRouters() {
        //获取当前用户ID
        Long userId = SecurityUtils.getUserId();
        //根据用户ID查询对应的菜单树路由
        List<RouterVo> routers = menuService.selectMenuTreeRoutersByUserId(userId);
        return success(routers);
    }
}