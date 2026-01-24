package com.drone.system.controller;

import com.drone.system.domain.AjaxResult;

/**
 * web层通用数据处理，把常用的方法写进这里
 * 这是基类，其他的控制器都可以继承
 */
public class BaseController {
    //返回成功（无数据）
    public AjaxResult success(){
        return AjaxResult.success();
    }
    //返回错误(无数据)
    public AjaxResult error(){
        return AjaxResult.error();
    }
    //返回成功（带消息）
    public AjaxResult success(String msg){
        return AjaxResult.success(msg);
    }
    //返回成功（带数据）
    public AjaxResult success(Object data){
        return AjaxResult.success(data);
    }
    //返回错误（带消息）
    public AjaxResult error(String msg){
        return AjaxResult.error(msg);
    }
    //根据受到影响的行数判断操作是否成功
    protected AjaxResult toAjax(int rows){
        return rows > 0 ? AjaxResult.success() : AjaxResult.error();
    }
}
