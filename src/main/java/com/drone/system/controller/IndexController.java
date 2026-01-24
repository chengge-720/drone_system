package com.drone.system.controller;

import com.drone.system.domain.AjaxResult;
import org.apache.ibatis.annotations.Mapper;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.HashMap;

/**
 * 首页控制器
 * 前端：用户在前端请求数据---->后端：Controller(接收数据、响应数据)---->Service(处理业务逻辑)
 * ---->Mapper(Dao,数据访问,包括增删改查)---->数据返回前端
 *
 */
@RestController
@RequestMapping("/")
public class IndexController extends BaseController{
    @GetMapping
    public AjaxResult home(){
        return success("恭喜你成功启动了后端！");
    }

    @GetMapping("/test")
    public AjaxResult test(){
        HashMap<Object,Object> map = new HashMap<>();
        map.put("userId","1");
        map.put("userName","张三");
        return toAjax(1);
    }
}
