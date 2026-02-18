package com.drone.system.controller;

import com.drone.system.service.IRoleService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 角色信息控制
 */
@RestController
@RequestMapping("/system/role")
public class RoleController extends BaseController{
    @Resource
    private IRoleService roleService;


}
