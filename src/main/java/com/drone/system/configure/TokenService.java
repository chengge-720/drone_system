package com.drone.system.configure;

import com.drone.system.domain.LoginUser;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

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
@Slf4j
public class TokenService {
    //令牌自定义表示符，在application.yml内部定义
    @Value("Authorization")
    private String header;

    //令牌秘钥
    @Value("${token.secret}")
    private String secret;

    //令牌有效期
    @Value("300")
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

    /**
     * 从HTTP中提取token
     */
    public LoginUser getLoginUser(HttpServletRequest request){
        String token = getToken(request);
        if(!StringUtils.hasText(token)){
            return null;
        }
        try{
            //解析token
            Claims claims = parseToken(token);
            String userJson = claims.get("user_key",String.class);
            return objectMapper.readValue(userJson, LoginUser.class);

        }catch (Exception e){
            log.info("解析用户信息异常=>{}",String.valueOf(e));
        }
        return null;//解析失败
    }
    public String getToken(HttpServletRequest request){
        String token = request.getHeader(header);
        if(StringUtils.hasText(token) && token.startsWith("Bearer ")){
            return token.substring(7);
        }
        return token;
    }

    public Claims parseToken(String token){
        return Jwts.parserBuilder()
                .setSigningKey(secretKey)
                .build()
                .parseClaimsJws(token)//解析token
                .getBody();//获取数据

    }

    /**
     * 验证令牌有效期
     */
    public void verifyToken(LoginUser loginUser){
        Long expireTime = loginUser.getExpireTime();
        long currentTime = System.currentTimeMillis();
        if(expireTime - currentTime <= 0){
            throw new RuntimeException("Token已过期");
        }
    }
}
