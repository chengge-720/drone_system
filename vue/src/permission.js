//导入路由实例
import router from './router'
import {getToken} from "@/utils/auth.js";
import useUserStore from "@/stores/modules/userStore.js";
import {isReLogin} from "@/utils/request.js";
import {ElMessage} from "element-plus";

//白名单
const whiteList = ['/login','/register']

//判断路径是否在白名单中
const isWhiteList = (path) => {
    return whiteList.includes(path)
}

//全局路由执行函数
router.beforeEach((to,from,next) => {
    //先检查用户的token
    if(getToken()){
        //情况1：用户有token，则判断用户是否访问的是登录页面
        if(to.path === '/login' || to.path === '/register'){
            //访问的是登录页面，直接跳转到首页
            next({path:'/'})
        }
        //情况2：用户有token，则判断用户是否访问白名单
        else if(isWhiteList(to.path)){
            next()
        }
        //情况3：用户有token，则判断用户是否访问的是其他页面
        else{
            //用户信息为空
            if(useUserStore().name === ''){

                isReLogin.show = true

                useUserStore().getInfo().then(() => {
                    isReLogin.show = false

                    next({path:to.path})
                }).catch(err => {
                    isReLogin.show = false
                    //获取用户信息失败
                    //删除令牌
                    useUserStore().logOut().then( ()=>{
                        ElMessage.error(err)
                        //跳转到登录页
                        next({path:'/login'})
                    })
                })
            }else {
                //用户信息已存在，直接放行
                next()
            }
        }
    }else{
        //情况4：用户没有token，则判断用户是否访问白名单
        if(isWhiteList(to.path)){
            //访问的是白名单，直接放行
            next()
        }else{
            //用户没有token，跳转到登录页
            next({path:'/login'})
        }
    }
})