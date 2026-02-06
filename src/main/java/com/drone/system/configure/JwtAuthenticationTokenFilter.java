package com.drone.system.configure;

import com.drone.system.domain.LoginUser;
import jakarta.annotation.Resource;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.WebAuthenticationDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Objects;

/**
 * JWT认证令牌过滤器，拦截所有HTTP请求
 */
@Component
public class JwtAuthenticationTokenFilter extends OncePerRequestFilter {
    @Resource
    private TokenService tokenService;
    /**
     * 每个请求都会执行过滤
     * @param request
     * @param response
     * @param chain
     * @throws ServletException
     * @throws IOException
     */
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        // 检查是否是登录或注册接口，如果是，直接放行
        /**
         String requestURI = request.getRequestURI();
        if ("/login".equals(requestURI) || "/register".equals(requestURI) || "/base/login".equals(requestURI) || "/base/register".equals(requestURI)) {
            chain.doFilter(request, response);
            return;
        }
         */
        
        LoginUser loginUser = tokenService.getLoginUser(request);
        if(Objects.nonNull(loginUser) && SecurityContextHolder.getContext().getAuthentication() == null){
            try{
                tokenService.verifyToken(loginUser);
                //构建security认证令牌
                UsernamePasswordAuthenticationToken authenticationToken = new UsernamePasswordAuthenticationToken(loginUser,null,loginUser.getAuthorities());
                //设置认证详情
                authenticationToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                //设置认证信息到security上下文
                SecurityContextHolder.getContext().setAuthentication(authenticationToken);

            }catch (Exception e){
                SecurityContextHolder.clearContext();
            }
        }
        //无论是否成功，都要继续执行后续
        chain.doFilter(request,response);
    }
}