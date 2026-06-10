package com.drone.system.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Collections;

/**
 * 资源处理类
 * 1.配置静态路径访问资源（比如用户上传的图片和文件）
 * 2.配置跨域访问规则（允许前端应用访问后端API）
 */
@Configuration
public class ResourcesConfig implements WebMvcConfigurer {
    /**
     * 配置静态资源处理器
     * @param registry
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry){
        //本地文件上传配置
        registry.addResourceHandler("/profile/**")
                .addResourceLocations( "file:" + droneConfig.getProfile() + "/");
    }

    /**
     * 跨域配置源，配置哪些“外部”网站可以访问我们的后端API,前端属于“外部”网站
     * 后端端口为8081
     */
    @Bean//告诉Spring把方法返回的对象放置到容器里进行管理
    public CorsConfigurationSource corsConfigurationSource(){
        CorsConfiguration config = new CorsConfiguration();
        //1.允许所有的网站访问后端API,*表示所有的意思
        config.setAllowedOriginPatterns(Collections.singletonList("*"));
        //2.允许携带哪些请求头
        config.setAllowedHeaders(Collections.singletonList("*"));
        //3.允许哪些HTTP方法（get,post,put,delete）
        config.setAllowedMethods(Collections.singletonList("*"));
        //4.是否允许发送凭证（cookies）
        config.setAllowCredentials(true);
        //5.预检请求的缓存时间，让请求留存更久（1800秒）
        config.setMaxAge(1800L);

        //基于URL的跨域配置源
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();

        //注册配置
        source.registerCorsConfiguration("/**",config);

        return source;
    }

}