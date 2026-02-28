//导入路由实例
import router from './router'
import {getToken} from "@/utils/auth.js";
import useUserStore from "@/stores/modules/userStore.js";
import {isReLogin} from "@/utils/request.js";
import {ElMessage} from "element-plus";
import useRouteStore from "@/stores/modules/routeStore.js";

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
                useUserStore().getInfo().then(res => {
                    isReLogin.show = false
                    //调用路由状态工具方法
                    useRouteStore().generateRoutes().then(accessRoutes => {
                        //根据角色权限生成路由
                        accessRoutes.forEach(route => {
                            //动态添加路由
                            router.addRoute(route)
                        })
                        //根据角色名称确定跳转路径
                        const userRoleName = res.data.roleName
                        //根据角色名称确定跳转路径
                        let redirectPath = to.path
                        //如果是根路径，根据角色名称跳转页面
                        if(to.path === '/' || to.path === '/index'){
                            if(userRoleName === 'admin'){
                                //管理员角色默认跳转到默认路径
                                redirectPath = '/index'
                            }else if(userRoleName === 'user'){
                                //普通用户跳转到其他页面
                                redirectPath = '/index'
                            }
                        }
                        //如果需要跳转到特殊页面
                        if(redirectPath !== to.path){
                            next({ path: redirectPath , replace: true })
                        }else{
                            //跳转到首页
                            next({ ...to , replace: true })
                        }
                    }).catch(err => {
                        console.error('生成路由失败:', err)
                        //即使生成路由失败，也继续跳转
                        next({ ...to , replace: true })
                    })
                }).catch(err => {
                    //获取用户信息失败
                    console.error('获取用户信息失败:', err)
                    //删除令牌
                    useUserStore().logOut().then( ()=>{
                        ElMessage.error(err?.message || '用户信息获取失败')
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