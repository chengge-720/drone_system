package com.drone.system.domain;

import java.util.HashMap;
import java.util.Objects;

/**
 * 操作消息提醒
 * AjaxResult比作一个快递盒子，code是快递单号表示成功或失败，msg是快递盒的备注，data就是盒子里的商品
 */
public class AjaxResult extends HashMap<String, Object> {
    /**
     * 初始化一个空消息
     */
    public AjaxResult(){

    }

    /**
     * 创建一个AjaxResult对象
     * @param code 状态码
     * @param msg  返回消息
     */
    public AjaxResult(int code,String msg){
        super.put("code",code);
        super.put("msg",msg);
    }

    /**
     * @param data 数据对象
     */
    public AjaxResult(int code,String msg,Object data){
        super.put("code",code);
        super.put("msg",msg);
        if(data != null){
            super.put("data",data);
        }
    }
    public static AjaxResult success(String msg,Object data){
        return new AjaxResult(200,msg,data);
    }

    public static AjaxResult success(){
        return AjaxResult.success("操作成功！");
    }

    public static AjaxResult success(Object data){
        return AjaxResult.success("操作成功！",data);
    }

    public static AjaxResult success(String msg){
        return AjaxResult.success(msg,null);
    }

    /**
     * 返回错误消息
     */
    public static AjaxResult error(){
        return AjaxResult.error("操作失败！");
    }

    public static AjaxResult error(String msg){
        return AjaxResult.error(msg,null);
    }

    public static AjaxResult error(String msg,Object data){
        return new AjaxResult(500,msg,data);
    }

    public static AjaxResult error(int code,String msg){
        return new AjaxResult(code,msg,null);
    }

    /**
     * 方便链式调用
     * @param key 键
     * @param value 值
     * @return 数据对象
     */
    @Override
    public AjaxResult put(String key,Object value){
        super.put(key, value);
        return this;
    }
}
