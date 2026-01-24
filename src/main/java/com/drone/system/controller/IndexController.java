package com.drone.system.controller;

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
    public String home(){
        LocalDateTime now = LocalDateTime.now();
        String nowStr = now.toString();
        return "你好！恭喜成功启动了后端！" + nowStr;
    }
}
