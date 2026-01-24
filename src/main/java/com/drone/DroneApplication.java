package com.drone;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
//排除数据源的自动配置
@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class})
public class DroneApplication {
    //java程序入口点
    public static void main(String[] args) {
        //启动springboot应用
        SpringApplication.run(DroneApplication.class, args);
    }

}
