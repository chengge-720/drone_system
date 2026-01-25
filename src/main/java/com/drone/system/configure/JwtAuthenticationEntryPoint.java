package com.drone.system.configure;

import com.drone.system.domain.AjaxResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * JWT认证入口点处理类
 * 相当于系统的门卫，防止没有通信证的用户随意查看信息
 */
@Component
public class JwtAuthenticationEntryPoint implements AuthenticationEntryPoint {
    @Resource
    private ObjectMapper objectMapper;
    /**
     * 认证入口点方法
     * @param request
     * @param response
     * @param e
     * @throws IOException
     */
    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException e) throws IOException {
        //设置HTTP状态码为未认证（401）
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        //设置响应内容为JSON
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        //设置字符编码为UTF-8
        response.setCharacterEncoding("UTF-8");
        //构建错误响应
        String jsonResponse = objectMapper.writeValueAsString(AjaxResult.error(401,"登录已过期，请重新登录"));
        //将响应数据写入HTTP响应体
        response.getWriter().println(jsonResponse);

    }
}
