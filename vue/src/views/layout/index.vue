<template>
  <div class="main-container">
    <!--顶部导航栏-->
    <el-header class="layout-header">
      <div class="layout-header__brand">
        <img :src="logo" alt="logo" class="layout-header__logo">
        <span class="layout-header__title">无人机路径规划后台管理端</span>
      </div>

      <div class="layout-header__right">
        <el-breadcrumb separator="/" class="layout-header__breadcrumb">
          <el-breadcrumb-item v-for="(item, index) in breadItems" :key="index">
            <!--
            <span style="color: white">{{ item.meta.title }}</span>
            -->
          </el-breadcrumb-item>
        </el-breadcrumb>

        <div class="layout-header__actions">
          <span class="layout-header__hello">你好：{{ userStore.name }}</span>
          <el-button type="text" @click="logout" class="layout-header__logout">
            <svg-icon icon-class="logout"/>
            <span class="layout-header__logoutText">退出登录</span>
          </el-button>
          <el-dropdown trigger="click" class="layout-header__dropdown">
            <div class="layout-header__user">
              <img :src="userStore.avatar" alt="" class="layout-header__avatar">
                <el-icon class="el-icon--right">
                  <arrow-down/>
                </el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <router-link to="/user/profile" style="text-decoration: none">
                <el-dropdown-item>个人中心</el-dropdown-item>
                </router-link>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

        </div>

      </div>

    </el-header>

    <!--主内容区域-->
    <main class="layout-main">
      <AppMain/>
    </main>

    <!--侧边栏-->
    <el-aside class="layout-aside">
      <SideBar/>
    </el-aside>

  </div>
</template>

<script setup lang="ts">
import logo from '@/assets/logo/logo.png'
import {onMounted, ref, watch} from 'vue';
import {RouteLocation, RouteLocationMatched, useRoute} from "vue-router";
import useUserStore from "@/stores/modules/userStore.js";
import {ElMessageBox ,ElMessage} from "element-plus";
import {ArrowDown, ArrowDownBold} from "@element-plus/icons-vue";
import AppMain from "@/views/layout/components/AppMain.vue";
import SvgIcon from "@/components/SvgIcon/index.vue";
import SideBar from './components/Sidebar/index.vue';

//面包屑数组
const breadItems = ref([])

const route = useRoute()

const userStore = useUserStore()

//退出登录实现
const logout = () => {
  ElMessageBox.confirm(
      '确定退出系统吗？',
      '系统提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
  }).then(() => {
    userStore.logOut().then(() => {
      //退出成功后，跳转到登录页
      location.href = '/login'
    })
  })
}


//判断当前路由是否是首页
const isDashboard = (route) =>{
  const name =route && route.name
  if(!name) return false
  return name.trim() === 'Index'
}

//获取面包屑
const getBread = () =>{
  const matched = route.matched.filter(
      item => {item.meta && item.meta.title
      })

  if(!isDashboard(matched[0])){
    matched.unshift({
      path: '/index',
      meta: { title: '首页' }
    } as unknown as RouteLocationMatched)
  }
  //更新面包数组
  breadItems.value = matched
}

//组件挂载时获取面包屑
onMounted(() => {
  getBread()
})

//监听路由变化，更新面包屑
watch(() => route.path, () => {
  getBread()
})

</script>

<style scoped>
.main-container{
  height: 100%;
  display: flex;
  flex-direction: column;
}

.layout-header{
  height: var(--layout-header-height, 60px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  z-index: 2000;
  padding: 0 18px;
  background: linear-gradient(135deg, rgba(77, 79, 200, 0.96), rgba(108, 99, 255, 0.92));
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(10px);
}

.layout-header__brand{
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 220px;
}

.layout-header__logo{
  height: 40px;
  width: 40px;
  opacity: 0.9;
  border-radius: 10px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
}

.layout-header__title{
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.2px;
  color: rgba(255, 255, 255, 0.96);
  white-space: nowrap;
}

.layout-header__right{
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  min-width: 0;
}

.layout-header__breadcrumb{
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
  opacity: 0.9;
}

.layout-header__actions{
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.layout-header__hello{
  color: rgba(255, 255, 255, 0.92);
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
}

.layout-header__logout{
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.12);
}

.layout-header__logoutText{
  color: rgba(255, 255, 255, 0.92);
  font-weight: 700;
}

.layout-header__dropdown{
  cursor: pointer;
}

.layout-header__user{
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}

.layout-header__avatar{
  height: 34px;
  width: 34px;
  border-radius: 999px;
  object-fit: cover;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
}

.layout-main{
  margin-left: var(--layout-aside-width, 240px);
  position: relative;
  top: var(--layout-header-height, 60px);
  min-height: calc(100vh - var(--layout-header-height, 60px));
}

.layout-aside{
  width: var(--layout-aside-width, 240px);
  position: fixed;
  top: calc(var(--layout-header-height, 60px) + 6px);
  bottom: 0;
  left: 0;
  padding: 10px 10px 12px;
  box-sizing: border-box;
}

@media (max-width: 960px) {
  .layout-header__breadcrumb{
    display: none;
  }
}
</style>