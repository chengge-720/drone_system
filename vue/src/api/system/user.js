import request from "@/utils/request.js";

//修改个人信息
export function updateProfile(data){
    return request({
        url:"/system/user/profile",
        method:"put",
        data: data
    })
}