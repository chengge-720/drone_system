<script setup lang="ts">
//计算当前高亮菜单项
import {computed, ref} from "vue";
import {useRoute} from "vue-router";
import SidebarItem from "@/views/layout/components/Sidebar/SidebarItem.vue";

const route = useRoute();

//模拟数据
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
    path: '/droneInfo',
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

])

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