import { createRouter, createWebHistory } from 'vue-router'
//导入布局组件
import Layout from '@/views/layout/index.vue'

//路由配置(静态)
export const constantRouters = [
  {
    path: '/login',
    component: () => import('@/views/login.vue'),
    hidden: true,
    meta: {
      title: '登录',
    }
  },
  {
    path: '/register',
    component: () => import('@/views/register.vue'),
    hidden: true,
    meta: {
      title: '注册',
    }
  },
  {
    path: '/user',
    component: Layout,
    hidden: true,
    children: [
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/system/user/profile.vue'),
        meta: {
          title: '个人中心'
        }
      },
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/views/404.vue'),
    hidden: true,
  },
  /**
  {
    path: '/',
    component: Layout,
    redirect: '/index',
    children: [
      {
        path: '/index',
        component: () => import('@/views/system/index.vue'),
        name: 'Index',
        meta: {
          title: '首页',
          icon: '首页',
        }
      },
    ]
  },

  {
    path: '/system',
    component: Layout,
    children: [
      {
        path: 'user',
        component: () => import('@/views/system/user/index.vue'),
      },
      {
        path: 'role',
        component: () => import('@/views/system/role/index.vue'),
      },
      {
        path: 'menu',
        component: () => import('@/views/system/menu/index.vue'),
      },
    ]
  },

  {
    path: '/uavInfo',
    component: Layout,
    children: [
      {
        path: 'baseInfo',
        component: () => import('@/views/uavInfo/baseInfo/index.vue'),
      },
      {
        path: 'flightInfo',
        component: () => import('@/views/uavInfo/flightInfo/index.vue'),
      },
      {
        path: 'taskInfo',
        component: () => import('@/views/uavInfo/taskInfo/index.vue'),
      },
    ]
  },
  {
    path: '/uavNavigation',
    component: Layout,
    children: [
      {
        path: 'mapShow',
        component: () => import('@/views/uavNavigation/mapShow/index.vue'),
      },
      {
        path: 'routeInfo',
        component: () => import('@/views/uavNavigation/routeInfo/index.vue'),
      },
    ]
  },
   **/

]

//创建路由器实例
const router = createRouter({
  history: createWebHistory(),
  routes: constantRouters,
  scrollBehavior(to, from, savedPosition) {
    if(savedPosition){
      return savedPosition
    }
    return {top:0}
  },
})

export default router
