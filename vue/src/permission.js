//导入路由实例
import router from './router'

//白名单
const whiteList = ['/login','/register']

//判断路径是否在白名单中
const isWhiteList = (path) => {
    return whiteList.includes(path)
}

//全局路由执行函数
router.beforeEach((to,from,next) => {
    if(isWhiteList(to.path)){
        next()
    }else{
        next('/login')
    }
})