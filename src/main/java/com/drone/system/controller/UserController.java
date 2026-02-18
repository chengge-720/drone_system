package com.drone.system.controller;

import com.drone.system.domain.AjaxResult;
import com.drone.system.domain.TableDataInfo;
import com.drone.system.domain.User;
import com.drone.system.service.IUserService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 用户控信息
 */
@RestController
@RequestMapping("/system/user")
public class UserController extends BaseController {
    @Resource
    private IUserService userService;
    /**
     * 获取用户列表
     */
    @GetMapping("/selectUserList")
    public TableDataInfo selectUserList(User user) {
        //分页查询
        startPage();
        //查询用户列表
        List<User> list = userService.selectUserList(user);
        return getDataTable(list);
    }

    /**
     * 根据用户ID查询用户
     */
    @GetMapping("/selectUserByUserId/{userId}")
    public AjaxResult selectUserByUserId(@PathVariable Long userId) {
        User user = userService.selectUserByUserId(userId);
        return success(user);
    }

    /**
     * 新增用户
     */
    @PostMapping("/insertUser")
    public AjaxResult insertUser(@RequestBody User user) {
        return toAjax(userService.insertUser(user));
    }

    /**
     * 修改用户
     */
    @PutMapping("/updateUser")
    public AjaxResult updateUser(@RequestBody User user) {
        return toAjax(userService.updateUser(user));
    }

}
