package com.drone.system.configure;

import com.drone.system.domain.LoginUser;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.Resource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Date;
import java.util.HashMap;
import java.util.concurrent.TimeUnit;

/**
 * Token 验证处理
 * 作用：JWT令牌的生成、解析、认证
 */
@Component
public class TokenService {
    //令牌自定义表示符，在application.yml内部定义
    @Value("${token.header}")
    private String header;

    //令牌秘钥
    @Value("${token.secret}")
    private String secret;

    //令牌有效期
    @Value("${token.expireTime}")
    private int expireTime;

    //JWT签名秘钥
    private Key secretKey;

    //json处理器
    @Resource
    private ObjectMapper objectMapper;

    //初始化秘钥
    @PostConstruct//在Bean创建完成之后，依赖注入完成后执行
    public void init(){
        //将配置的令牌秘钥字符串转化为JWT可用的Key对象
        this.secretKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 创建令牌
     * 根据用户信息生成JWT token
     * 用户登录成功后调用
     */
    public String createToken(LoginUser loginUser){
        //1.获取当前时间戳
        Long now = System.currentTimeMillis();

        //2.计算过期时间（将分钟转换为毫秒）
        Long expirationTime = now + TimeUnit.MINUTES.toMillis(expireTime);

        //3.更新用户信息中的时间字段
        loginUser.setLoginTime(now);
        loginUser.setExpireTime(expirationTime);

        //4.准备JWT的声明数据
        HashMap<String,Object> claims = new HashMap<>();

        //5.将LoginUser对象转化为JSON字符串
        try{
            claims.put("user_key",objectMapper.writeValueAsString(loginUser));
        } catch(Exception e){
            throw new RuntimeException("序列化用户信息失败",e);
        }

        //构建JWT token
        return Jwts.builder()
                .setClaims(claims)//设置声明数据
                .setExpiration(new Date(expirationTime))//设置过期时间
                .signWith(secretKey)//用秘钥签名
                .compact();//生成字符串
    }


}
