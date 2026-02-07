package com.drone.system.controller;

import com.drone.system.config.droneConfig;
import com.drone.system.domain.AjaxResult;
import com.drone.system.domain.LoginUser;
import com.drone.system.service.IUserService;
import com.drone.system.utils.SecurityUtils;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.IIOException;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

/**
 * 个人中心控制器
 */
@RestController
@RequestMapping("/system/user/profile")
public class ProfileController extends BaseController{
    @Resource
    private IUserService userService;
    private final droneConfig droneConfig;

    public ProfileController(droneConfig droneConfig) {
        super();
        this.droneConfig = droneConfig;
    }

    /**
     * 头像上传
     */
    @PostMapping("/avatar")
    public AjaxResult avatar(@RequestParam MultipartFile file) throws IOException {
        //判断文件是否为空
        if(!file.isEmpty()){
            //获取当前登录用户的信息
            LoginUser loginUser = SecurityUtils.getLoginUser();
            //准备存放头像的文件夹
            String uploadDir = droneConfig.getProfile() + "/avatar";
            //创建一个File对象
            File dir = new File(uploadDir);
            if(!dir.exists()){
                dir.mkdirs();
            }
            //为上传的文件创建一个唯一的文件名
            String originalFilename = file.getOriginalFilename();
            //获取文件扩展名
            String extension = "";

            if(originalFilename != null && originalFilename.contains( ".")){
                extension = originalFilename.substring(originalFilename.lastIndexOf("."));
            }else{
                //文件没有扩展名，默认使用空字符串
                extension = "";
            }
            //生成一个uuid，创建一个唯一的文件名
            String uuid = UUID.randomUUID().toString().replaceAll("-", "");
            //最终文件名
            String uniqueFilename = uuid + extension;
            //将文件保存到指定目录
            Path filePath = Paths.get(uploadDir, uniqueFilename);
            //将文件写入指定的目录并上传文件的字节数据
            Files.write(filePath, file.getBytes());
            //构建头像的访问路径
            String avatar = "/profile/avatar/" + uniqueFilename;
            //更新数据库中用户的头像字段
            if(userService.updateUserAvatar(loginUser.getUserId(), avatar) > 0){
                //返回上传成功的响应
                AjaxResult ajax = AjaxResult.success();
                //前端通过data.imgUrl属性获取图片路径
                ajax.put("imgUrl", avatar);
                //更新缓存中的用户头像
                loginUser.getUser().setAvatar(avatar);
                //返回上传成功的响应
                return ajax;
            }
        }
        //返回上传失败的响应（1.用户没有上传头像2.文件保存成功，但数据库更新失败）
        return error("上传头像失败！请尝试重新上传!");
    }
}
