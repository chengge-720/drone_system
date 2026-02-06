import request from "@/utils/request.js";
//登录方法
export function login(data){
    return request({
        url:'/login', //后端接口地址
        headers:{//请求头配置
            isToken:false,//告诉拦截器，不需要token
        },
        method:'post',//请求方式: post(严格遵守后端路径)
        data: data//要发送的数据
    })
}

//获取用户信息
export function getInfo(){
    return request({
        url:'/getInfo', //后端接口地址
        method:'post',//请求方式: post(严格遵守后端路径)
    })
}

//登出方法
export function logout(){
    return request({
        url:'/logout', //后端接口地址
        method:'post',//请求方式: post(严格遵守后端路径)
    })
}
