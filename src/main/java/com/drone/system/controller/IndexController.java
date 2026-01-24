package com.drone.system.controller;

import com.drone.system.domain.AjaxResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 首页控制器
 */
@RestController
@RequestMapping("/")
public class IndexController {
    @GetMapping
    public AjaxResult home(){
        return AjaxResult.success("成功！").put("username","张三");
    }
}
