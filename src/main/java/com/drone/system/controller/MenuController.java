package com.drone.system.controller;

import com.drone.system.domain.AjaxResult;
import com.drone.system.domain.Menu;
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
public class MenuController extends BaseController{
    @Resource
    private IMenuService menuService;

    /**
     * 获取菜单列表
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

}
