package com.drone.system.controller;

import com.drone.system.configure.TokenService;
import com.drone.system.domain.AjaxResult;
import com.drone.system.domain.LoginBody;
import com.drone.system.domain.LoginUser;
import com.drone.system.domain.User;
import com.drone.system.service.IUserService;
import com.drone.system.utils.SecurityUtils;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import static com.drone.system.domain.AjaxResult.success;

/**
 * 登录验证
 */
@Slf4j
@RestController
public class LoginController extends BaseController{
    @Resource
    private IUserService userService;
    @Autowired
    private TokenService tokenService;
    /**
     * 登录接口
     */
    @PostMapping("/login")
    public AjaxResult login(@RequestBody LoginBody loginBody){
        try {
            //1.验证参数是否为空
            if(loginBody.getUserName() == null || loginBody.getPassword() == null ||
                    loginBody.getUserName().trim().isEmpty() || loginBody.getPassword().trim().isEmpty()){
                return AjaxResult.error("用户名或密码不能为空！");
            }
            
            //2.验证用户是否存在
            User user = userService.selectUserByUserName(loginBody.getUserName());
            if(user == null){
                return AjaxResult.error("用户名错误！");
            }
            
            //3.验证密码是否正确
            if(!loginBody.getPassword().equals(user.getPassword())){
                return AjaxResult.error("密码错误！");
            }
            
            //4.创建登录用户对象
            LoginUser loginUser = new LoginUser(user.getUserId(),user);
            
            //5.生成JWT令牌
            String token = tokenService.createToken(loginUser);
            
            //6.返回成功结果，并且包含Token
            return success().put("token",token);
        } catch (Exception e) {
            log.error("登录失败: {}", e.getMessage(), e);
            return AjaxResult.error(e.getMessage());
        }
    }


    /**
     * 获取用户信息
     */
    @GetMapping("/getInfo")
    public AjaxResult getInfo(){
        //获取当前用户ID
        Long userId = SecurityUtils.getUserId();
        User user = userService.selectUserByUserId(userId);
        return success(user);
    }
}