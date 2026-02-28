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
    <el-menu :default-active="activeMenu" class="sidebar-menu">
      <sidebar-item v-for="(route, index) in sidebarRouters"
                    :key="route.path + index"
                    :item="route"
                    :base-path="route.path"/>
    </el-menu>
  </el-scrollbar>
</template>

<style scoped>
.sidebar-menu{
  padding: 8px 0;
  border-right: none;
}

.sidebar-menu :deep(.el-menu-item){

  border-radius: 4px;
  height: 55px;
}

.sidebar-menu :deep(.el-menu-item).is-active{
  background: var(--el-color-primary) !important;
  color: white;
  position: relative;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  border-radius: 8px;
}
</style>