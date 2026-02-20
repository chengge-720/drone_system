package com.drone.system.controller;

import com.drone.system.domain.AjaxResult;
import com.drone.system.domain.Menu;
import com.drone.system.service.IMenuService;
import com.drone.system.utils.SecurityUtils;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
}
