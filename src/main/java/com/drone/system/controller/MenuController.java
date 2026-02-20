package com.drone.system.controller;

import com.drone.system.service.IMenuService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 菜单信息控制
 */
@RestController
@RequestMapping("/system/menu")
public class MenuController extends BaseController{
    @Resource
    private IMenuService menuService;
}
