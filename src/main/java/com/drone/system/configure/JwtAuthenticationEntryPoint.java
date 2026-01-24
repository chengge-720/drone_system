package com.drone.system.configure;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;

import java.io.IOException;

/**
 * JWT认证入口点处理类
 * 相当于系统的门卫，防止没有通信证的用户随意查看信息
 */
public class JwtAuthenticationEntryPoint implements AuthenticationEntryPoint {
    /**
     * 认证入口点方法
     * @param request
     * @param response
     * @param authException
     * @throws IOException
     * @throws ServletException
     */
    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException authException) throws IOException, ServletException {

    }
}
