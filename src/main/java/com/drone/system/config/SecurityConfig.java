package com.drone.system.config;

import com.drone.system.configure.JwtAuthenticationEntryPoint;
import com.drone.system.configure.JwtAuthenticationTokenFilter;
import jakarta.annotation.Resource;
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
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.http.HttpMethod;

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

    @Resource
    private JwtAuthenticationEntryPoint authenticationEntryPoint;
    @Resource
    private JwtAuthenticationTokenFilter authenticationTokenFilter;

    //安全过滤链
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
                .sessionManagement(session->session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                //异常处理
                .exceptionHandling(e->e.authenticationEntryPoint(authenticationEntryPoint))
                //路径权限配置
                .authorizeHttpRequests(req->
                        //登录和注册接口是公开接口，所有人都可以访问
                        req.requestMatchers("/login", "/register").permitAll()//, "/base/login", "/base/register"
                            .requestMatchers("/profile/**").permitAll()
                                //而其他接口必须授权
                                .anyRequest().authenticated()
                        )
                //退出登录逻辑
                .logout(logout->logout.logoutUrl("/logout")
                        //退出成功
                        .logoutSuccessHandler((req,res,auth)->res.setStatus(200))

                )
                //添加JWT过滤器
                .addFilterBefore(authenticationTokenFilter, UsernamePasswordAuthenticationFilter.class);
                // 禁用默认的UsernamePasswordAuthenticationFilter，该默认过滤器器会拦截所有POST请求，并尝试进行身份验证
                //.formLogin(AbstractHttpConfigurer::disable);

        return http.build();
    }

}