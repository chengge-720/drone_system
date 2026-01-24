package com.drone.system.config;

import jakarta.servlet.http.HttpFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * spring security 安全配置类
 * 负责配置系统的安全规则
 * 1.哪些接口可以自由出入
 * 2.哪些接口要检查身份
 * 3.怎么检查身份（JWT认证）
 * 4.异常处理
 */

@EnableMethodSecurity(securedEnabled = true)//启用方法级别的安全控制
@Configuration
public class SecurityConfig {
    @Bean
    protected SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                //开启跨域支持（允许前端访问）
                .cors(Customizer.withDefaults())
                //禁用CSRF防护
                .csrf(AbstractHttpConfigurer::disable)
                //响应头配置
                .headers( headers -> headers.frameOptions(frame->frame.sameOrigin()))
                //禁用Session,使用无状态认证（JWT）
                .sessionManagement(session->session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
        return http.build();
    }

}
