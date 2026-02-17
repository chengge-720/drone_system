package com.drone.system.controller;

import com.drone.system.domain.TableDataInfo;
import com.drone.system.domain.User;
import com.drone.system.service.IUserService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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

}
