package com.drone.system.domain;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

/**
 * 登录用户身份类
 * 作用：封装登录用户的信息
 * 相当于用户系统内部的身份证
 */
@Data
@NoArgsConstructor
public class LoginUser implements UserDetails {
    //用户ID
    private Long userId;

    //用户信息
    private User user;

    //登录时间
    private Long loginTime;

    //过期时间
    private Long expireTime;

    //带参数的构造方法
    public LoginUser(Long userId,User user){
        this.userId = userId;
        this.user = user;
    }

    /**
     * 获取用户的权限集合
     * @return
     */
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return null;
    }

    @Override
    public String getPassword() {
        return user.getPassword();
    }

    @Override
    public String getUsername() {
        return user.getUserName();
    }
}
