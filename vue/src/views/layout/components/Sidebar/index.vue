<script setup lang="ts">
//计算当前高亮菜单项
import {computed, onMounted, ref} from "vue";
import {useRoute} from "vue-router";
import SidebarItem from "@/views/layout/components/Sidebar/SidebarItem.vue";
import useRouteStore from "@/stores/modules/routeStore.js";

const route = useRoute();

const routeStore = useRouteStore();

//路由数据(动态)
const sidebarRouters = computed(() => routeStore.sidebarRouters);

//查询动态路由数据
onMounted(()=>{
  console.log('获取路由数据',sidebarRouters.value)
})

//模拟数据(静态)
/**
const sidebarRouters = ref( [
  {
    path: '/index',
    meta: { title: '首页' ,icon: '首页',hidden: false}
  },
  {
    path: '/system',
    meta: { title: '系统管理' ,icon: '系统管理',hidden: false},
    children:[
        {
          path: 'user',
          meta: { title: '用户管理' ,icon: '用户管理',hidden: false}
        },
        {
          path: 'role',
          meta: { title: '角色管理' ,icon: '角色管理',hidden: false}
        },
        {
          path: 'menu',
          meta: { title: '菜单管理' ,icon: '菜单管理',hidden: false}
        },
    ]
  },
  {
    path: '/uavInfo',
    meta: { title: '无人机管理' ,icon: '无人机管理',hidden: false},
    children:[
        {
          path: 'baseInfo',
          meta: { title: '基础信息' ,icon: '基础信息管理',hidden: false}
        },
        {
          path: 'flightInfo',
          meta: { title: '飞行信息' ,icon: '飞行信息管理',hidden: false}
        },
        {
          path: 'taskInfo',
          meta: { title: '任务信息' ,icon: '任务信息管理',hidden: false}
        }
    ]
  },
  {
    path: '/uavNavigation',
    meta: { title: '导航管理' ,icon: '导航管理',hidden: false},
    children:[
      {
        path: 'mapShow',
        meta: { title: '地图展示' ,icon: '地图展示',hidden: false}
      },
      {
        path: 'routeInfo',
        meta: { title: '路径信息' ,icon: '路径信息',hidden: false}
      }
    ]
  },

])
 */

const activeMenu = computed(()=>{
  //从当前路由对象中解构数据
  const {meta, path} = route

  return meta.activeMenu || path
})
</script>

<template>
  <el-scrollbar>
    <el-menu :default-active="activeMenu" class="sidebar-menu" router>
      <sidebar-item v-for="(route, index) in sidebarRouters"
                    :key="route.path + index"
                    :item="route"
                    :base-path="route.path"/>
    </el-menu>
  </el-scrollbar>
</template>

<style scoped>
.sidebar-menu{
  padding: 12px 0;
  border-right: none;
  background-color: var(--card-background);
  height: 100%;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.08);
}

.sidebar-menu :deep(.el-menu-item){
  border-radius: 8px;
  height: 55px;
  margin: 0 12px 8px 12px;
  transition: var(--transition);
}

.sidebar-menu :deep(.el-menu-item):hover{
  background-color: rgba(77, 79, 200, 0.05) !important;
  color: var(--primary-color);
  transform: translateX(4px);
}

.sidebar-menu :deep(.el-menu-item).is-active{
  background: linear-gradient(135deg, var(--primary-color), var(--secondary-color)) !important;
  color: white;
  position: relative;
  box-shadow: 0 4px 12px rgba(77, 79, 200, 0.3);
  border-radius: 8px;
  transform: translateX(4px);
}

.sidebar-menu :deep(.el-menu-item).is-active::before{
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 30px;
  background-color: var(--accent-color);
  border-radius: 0 2px 2px 0;
}

.sidebar-menu :deep(.el-sub-menu__title){
  border-radius: 8px;
  height: 55px;
  margin: 0 12px 8px 12px;
  transition: var(--transition);
}

.sidebar-menu :deep(.el-sub-menu__title):hover{
  background-color: rgba(77, 79, 200, 0.05) !important;
  color: var(--primary-color);
  transform: translateX(4px);
}

.sidebar-menu :deep(.el-sub-menu.is-active > .el-sub-menu__title){
  background: linear-gradient(135deg, var(--primary-color), var(--secondary-color)) !important;
  color: white;
  box-shadow: 0 4px 12px rgba(77, 79, 200, 0.3);
  transform: translateX(4px);
}

.sidebar-menu :deep(.el-sub-menu.is-active > .el-sub-menu__title)::before{
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 30px;
  background-color: var(--accent-color);
  border-radius: 0 2px 2px 0;
}

.sidebar-menu :deep(.el-sub-menu .el-menu){
  background-color: transparent;
  padding: 0;
}

.sidebar-menu :deep(.el-sub-menu .el-menu-item){
  margin: 4px 12px;
  padding-left: 32px !important;
}
</style>