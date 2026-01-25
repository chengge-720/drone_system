package com.drone.system.utils;

import com.drone.system.domain.LoginUser;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * 安全服务工具类
 * 用于快速获取用户信息
 * 所有方法都是静态的
 */
public class SecurityUtils {
    /**
     * 获取当前登录用户
     * @return 返回一个LoginUser对象，包含所有用户信息
     * getContext() 获取Security上下文
     * getAuthentication() 获取认证信息
     * getPrincipal() 获取用户对象
     */
    public static LoginUser getLoginUser(){
        return (LoginUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    /**
     * 快速获取用户ID,不用先获取上下文再取的用户ID
     */
    public static Long getUserId(){
        return getLoginUser().getUserId();
    }
}
