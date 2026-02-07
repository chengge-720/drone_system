package com.drone.system.controller;
import com.drone.system.domain.AjaxResult;
import com.drone.system.domain.RegisterBody;
import com.drone.system.domain.User;
import com.drone.system.service.IUserService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 用户注册
 */
@RestController
public class RegisterController extends BaseController{
    @Resource
    private IUserService userService;
    /**
     * 注册
     */
    @PostMapping("/register")
    public AjaxResult register(@RequestBody RegisterBody registerBody) {
        String userName = registerBody.getUserName();
        String password = registerBody.getPassword();
        //验证输入参数
        if(userName == null || password == null ||
                userName.trim().isEmpty() || password.trim().isEmpty()){
            return AjaxResult.error("用户名或密码不能为空！");
        }
        //创建用户对象
        User newUser = new User();
        newUser.setUserName(userName);
        newUser.setPassword(password);

        System.out.println(newUser);

        //执行注册逻辑
        boolean regFlag = userService.registerUser(newUser);
        if(regFlag){
            return success("注册成功！");
        }else{
            return error("注册失败！");
        }

    }

}
