package com.drone.system.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 读取项目配置
 * 配置文件中的自定义配置，可以看做系统的翻译官
 */
@Component
@ConfigurationProperties(prefix = "drone")//告诉Spring读取项目配置文件中drone开头的配置项
public class droneConfig {
    /**
     * 文件上传路径配置
     */
    private static String profile;


    public static String getProfile() {
        return profile;
    }

    /**
     * 设置上传路径
     * spring会自动调用该方法，把配置的值传进来
     * @param profile
     */
    public void setProfile(String profile) {
        droneConfig.profile = profile;
    }
}
