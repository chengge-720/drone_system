import {defineStore} from "pinia";
import {getRouters} from "@/api/system/menu.js";
import {constantRouters} from "@/router/index.js";

//使用vite的自动导入功能：一次性导入views目录下的所有.vue文件
const modules = import.meta.glob('./../../views/**/*.vue')

//导入布局组件
import Layout from '@/views/layout/index.vue'


const useRouteStore = defineStore(
    'permission',//这里必须全局唯一
    {
        //状态定义
        state: () => ({
            routes: [],//存储所有路由(包括固定路由和用户专属路由)
            sidebarRouters: [],//存储左侧菜单栏路由(用于显示菜单)
        }),
        actions: {
            //设置路由数据
            setRoutes(routes) {
                this.sidebarRouters = routes
            },
            //设置侧边栏路由数据 - 专门用来显示菜单的路由
            setSidebarRouters(routes) {
                this.sidebarRouters = routes
            },
            //根据用户角色生成专属路由
            generateRoutes() {
                return new Promise(resolve => {
                    //调用api从后端获取用路由数据
                    getRouters().then(res => {
                        //深拷贝获取到的路由数据
                        const routerData = JSON.parse(JSON.stringify(res.data))
                        //数据转换，把后端的路由数据转换成前端路由能使用的格式
                        const sidebarRoutes = convertToRoutes(routerData);
                        //保存到state中
                        this.setRoutes(sidebarRoutes)
                        //侧边栏显示：固定路由+用户路由
                        this.setSidebarRouters(constantRouters.concat(sidebarRoutes))
                        //处理完后返回路由数据
                        resolve(sidebarRoutes)
                    }).catch(err => {
                        console.error('获取路由数据失败:', err)
                        //如果获取失败，使用默认路由
                        this.setSidebarRouters(constantRouters)
                        resolve([])
                    })
                })
            }
        }
    }
)

/**
 * 路由数据转换
 * 后端给的数据格式：
 * [
 *      {
 *          "name": "system",
 *          "path": "/system/xxx",
 *          "component": "Layout",
 *          "children": [...],
 *      }
 * ]
 * 转换为前端路由数据格式：
 * [
 *      {
 *          "name": "system",
 *          "path": "/system/xxx",
 *          "component": Layout组件对象,
 *          "children": [...],
 *      }
 * ]
 * @param routes 后端返回的路由数据
 */
const convertToRoutes = (routes) => {
    //对每个路由进行处理
    return routes.map(route => {
        //1.把组件名称String转换成组件对象
        if(route.component){
            if(route.component === 'Layout'){
                //如果是Layout组件，就用导入的Layout组件对象替换
                route.component = Layout
            }else{
                //如果不是Layout组件，就动态加载
                //比如将system/user/index变为对应的VUE组件
                route.component = loadView(route.component)
            }
        }

        //2.递归处理子路由
        if(route.children && route.children.length){
            //子路由存在，递归处理
            route.children = convertToRoutes(route.children)
        }else{
            //子路由不存在，删除children属性
            delete route.children
        }
        return route
    })
}

//动态加载路由组件
const loadView = (view) => {
    for(const path in modules){
        //从完整路径中提取相对路径
        //完整路径：./../views/system/user/index.vue -> system/user/index
        const dir = path.split('views/')[1].split('.vue')[0]
        //如果找到了匹配的组件路径
        if(dir === view){
            return () => modules[path]()
        }
    }
    //如果没有找到匹配的组件路径，返回null
    return null
}

//导出路由模块
export default useRouteStore