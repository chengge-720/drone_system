import {defineStore} from "pinia";
import {getRouters} from "@/api/system/menu.js";
import {constantRouters} from "@/router/index.js";

// 预扫描所有视图；勿用 import(`@/views/${path}.vue`)，Vite 要求变量仅代表「一层」文件名
const viewModules = import.meta.glob('@/views/**/*.vue')

//导入布局组件
import Layout from '@/views/layout/index.vue'
import ParentView from '@/views/ParentView.vue'


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
            }else if(route.component === 'ParentView'){
                route.component = ParentView
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

/**
 * 把后端 component 统一成 views 下相对路径，如 system/index、uavNavigation/pathPlanning/index
 * 支持：../../views/system/index.vue、src/views/...、views/...、反斜杠
 */
const normalizeViewKey = (view) => {
  if (!view || typeof view !== 'string') return ''
  let s = view.trim().replace(/\\/g, '/')
  const lower = s.toLowerCase()
  const idx = lower.indexOf('/views/')
  if (idx !== -1) {
    s = s.slice(idx + '/views/'.length)
  } else if (lower.startsWith('views/')) {
    s = s.slice('views/'.length)
  }
  s = s.replace(/^\//, '').replace(/\.vue$/i, '')
  if (s.includes('..')) return ''
  if (!/^[\w./-]+$/i.test(s)) return ''
  return s
}

/**
 * 将 normalize 后的 key 与 import.meta.glob 的模块路径匹配（兼容 Windows 键名中的 \）
 */
const loadView = (view) => {
  const target = normalizeViewKey(view)
  if (!target) {
    console.error('[routeStore] 非法或无法解析的 component 路径:', view)
    return () => import('@/views/404.vue')
  }

  const withRetry = (loader, retry = 2, delayMs = 220) => {
    return async () => {
      let lastErr = null
      for (let i = 0; i <= retry; i++) {
        try {
          return await loader()
        } catch (e) {
          lastErr = e
          const msg = String(e?.message || e || '')
          const maybeTransient =
            msg.includes('Failed to fetch dynamically imported module') ||
            msg.includes('fetch dynamically imported module') ||
            msg.includes('Outdated Optimize Dep')
          if (!maybeTransient || i === retry) break
          // 给 Vite 一点时间完成首轮 transform / optimize
          await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
        }
      }
      throw lastErr
    }
  }

  for (const p in viewModules) {
    const normalized = p.replace(/\\/g, '/')
    const m = normalized.match(/\/views\/(.+?)\.vue$/i)
    if (!m) continue
    if (m[1] === target) {
      return withRetry(viewModules[p])
    }
  }

  console.error('[routeStore] 未找到视图文件，请核对路径是否在 src/views 下:', view, '=>', target)
  return () => import('@/views/404.vue')
}

//导出路由模块
export default useRouteStore