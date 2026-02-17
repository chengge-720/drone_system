<template>
  <div >
    <!--顶部导航栏-->
    <el-header style="background-color: #4d4fc8;height: 60px;display: flex;
    position: fixed;left: 0;right: 0;top:0;box-shadow:0 0 20px rgba(0,25,55,0.8);">
      <div style="display: flex;align-items: center">
        <img :src="logo" alt="logo" style="height: 40px;width: 40px;margin-right: 10px;opacity: 0.85">
        <span style="font-size: 24px;color: #fff;">无人机路径规划后台管理端</span>
      </div>

      <div style="flex: 1;display: flex;margin: 20px">
        <el-breadcrumb separator="/" style="display: flex;align-items: center;flex: 1;">
          <el-breadcrumb-item v-for="(item, index) in breadItems" :key="index">
            <!--
            <span style="color: white">{{ item.meta.title }}</span>
            -->
          </el-breadcrumb-item>
        </el-breadcrumb>

        <div style="display: flex;align-items: center;">
          <span style="margin-right: 15px;color: white">你好：{{ userStore.name }}</span>
          <el-button type="text" @click="logout" style="display: flex;margin: 10px 20px;">
            <svg-icon icon-class="logout"/>
            <span style="color: #d6c571">退出登录</span>
          </el-button>
          <el-dropdown trigger="click" style="cursor: pointer">
            <div style="margin: 10px">
              <img :src="userStore.avatar" alt="" style="height: 36px;width: 36px;border-radius: 50%;">
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
    <main style="margin-left: 240px;position: relative;top: 60px;border: #007ddd">
      <AppMain />
    </main>

    <!--侧边栏-->
    <el-aside style="width: 240px;position: fixed;top: 65px;bottom: 0;border-radius: 5px">
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

</style>