import request from "@/utils/request.js";
//设置个用户操作方法接口API，这是连接后端方法和前端使用的“桥梁”

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

//查询用户列表,使用params传递参数，不使用data
//1.get请求通常不包括请求体，浏览器和服务器不会缓存get请求
//2.@RequestBody期望从请求体中获取数据，但get请求没有body,所以报错
//3.params会自动拼加到url中，这才符合get的请求语义
export function selectUserList(query){
    return request({
        url:"/system/user/selectUserList",
        method:"get",
        params: query
    })
}

//查询用户详情
export function selectUserByUserId(userId){
    return request({
        url:"/system/user/selectUserByUserId/" + userId,
        method:"get",
    })
}

//新增用户
export function insertUser(data){
    return request({
        url:"/system/user/insertUser",
        method:"post",
        data: data
    })
}

//修改用户
export function updateUser(data){
    return request({
        url:"/system/user/updateUser",
        method:"put",
        data: data
    })
}
