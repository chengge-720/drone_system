import { createRouter, createWebHistory } from 'vue-router'
//导入布局组件
import Layout from '@/views/layout/index.vue'

//路由配置
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
    path: '/',
    component: Layout,
    redirect: '/index',
    children: [
      {
        path: '/index',
        component: () => import('@/views/system/index.vue'),
        name: 'Index',
        meta: {
          title: '首页'
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
