package com.drone.system.controller;

import com.drone.system.domain.AjaxResult;
import com.drone.system.domain.Role;
import com.drone.system.domain.TableDataInfo;
import com.drone.system.service.IRoleService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 角色信息控制
 */
@RestController
@RequestMapping("/system/role")
public class RoleController extends BaseController{
    @Resource
    private IRoleService roleService;

    /**
     * 查询所有角色列表
     */
    @GetMapping("/selectAllRole")
    public AjaxResult selectAllRole() {
        return success(roleService.selectRoleList(new Role()));
    }

    /**
     * 获取角色列表
     */
     @GetMapping("/selectRoleList")
     public TableDataInfo selectRoleList(Role role) {
         startPage();
         List<Role> list = roleService.selectRoleList(role);
         return getDataTable(list);
     }
}
