import request from "@/utils/request.js";
//设置个用户操作方法接口API

//修改个人信息
export function updateProfile(data){
    return request({
        url:"/system/user/profile",
        method:"put",
        data: data
    })
}

//修改密码
export function updatePwd(data){
    return request({
        url:"/system/user/profile/updatePwd",
        method:"put",
        data: data
    })
}