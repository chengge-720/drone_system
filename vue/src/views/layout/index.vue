<template>
  <div class="uimaker-layout" :class="{ 'is-sidebar-collapsed': appStore.sidebarCollapsed }">
    <aside class="uimaker-sidebar-wrap">
      <div class="uimaker-sidebar-glass">
        <div class="uimaker-sidebar-logo">
          <img :src="logo" alt="logo">
          <span v-show="!appStore.sidebarCollapsed">无人机路径规划系统</span>
        </div>
        <SideBar />
      </div>
    </aside>

    <div class="uimaker-main-wrap">
      <header class="uimaker-header">
        <div class="uimaker-header__left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item v-for="(item, index) in breadItems" :key="index">
              {{ item.meta?.title }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="uimaker-header__right">
          <span class="uimaker-header__user">你好，{{ userStore.name }}</span>
          <el-button type="text" class="uimaker-header__logout" @click="logout">
            <svg-icon icon-class="logout" />
            退出
          </el-button>
          <el-dropdown trigger="click">
            <div class="uimaker-header__user">
              <img :src="userStore.avatar" alt="" class="uimaker-header__avatar">
              <el-icon><ArrowDown /></el-icon>
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
      </header>

      <main class="uimaker-content">
        <AppMain />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import logo from '@/assets/logo/logo.png'
import { onMounted, ref, watch } from 'vue'
import { RouteLocationMatched, useRoute } from 'vue-router'
import useUserStore from '@/stores/modules/userStore.js'
import { ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import AppMain from '@/views/layout/components/AppMain.vue'
import SvgIcon from '@/components/SvgIcon/index.vue'
import SideBar from './components/Sidebar/index.vue'
import useAppStore from '@/stores/modules/appStore.js'

const appStore = useAppStore()

const breadItems = ref<RouteLocationMatched[]>([])
const route = useRoute()
const userStore = useUserStore()

const logout = () => {
  ElMessageBox.confirm('确定退出系统吗？', '系统提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    userStore.logOut().then(() => {
      location.href = '/login'
    })
  })
}

const isDashboard = (r: RouteLocationMatched) => {
  const name = r?.name
  if (!name) return false
  return String(name).trim() === 'Index'
}

const getBread = () => {
  const matched = route.matched.filter((item) => item.meta && item.meta.title)
  if (!matched.length || !isDashboard(matched[0])) {
    matched.unshift({
      path: '/index',
      meta: { title: '首页' }
    } as unknown as RouteLocationMatched)
  }
  breadItems.value = matched
}

onMounted(() => {
  getBread()
})

watch(() => route.path, () => {
  getBread()
})
</script>
