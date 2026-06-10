<script setup lang="ts">
import useUserStore from '@/stores/modules/userStore.js'
import { useRouter } from 'vue-router'
import { ref } from 'vue'
import { User, Lock } from '@element-plus/icons-vue'

const loading = ref(false)
const loginRef = ref()
const loginForm = ref({
  userName: null,
  password: null
})

const rules = ref({
  userName: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
})

const userStore = useUserStore()
const router = useRouter()

const handleLogin = () => {
  loginRef.value.validate((valid: boolean) => {
    if (valid) {
      loading.value = true
      userStore.login(loginForm.value).then(() => {
        router.push('/')
      }).catch(() => {
        loading.value = false
      })
    }
  })
}
</script>

<template>
  <div class="uimaker-login-page">
    <section class="uimaker-login-brand">
      <div class="uimaker-login-brand__content">
        <div class="uimaker-login-brand__badge">UAV PATH PLANNING</div>
        <h1 class="uimaker-login-brand__title">基于强化学习的<br>无人机路径规划系统</h1>
        <p class="uimaker-login-brand__desc">
          面向低空巡检与应急任务场景，提供路径规划、任务管理与可视化分析的一体化平台，
          助力无人机作业高效、安全、可追溯。
        </p>
        <div class="uimaker-login-brand__features">
          <div class="uimaker-login-brand__feature">
            <span class="uimaker-login-brand__feature-dot" />
            <span>智能路径规划与任务配置</span>
          </div>
          <div class="uimaker-login-brand__feature">
            <span class="uimaker-login-brand__feature-dot" />
            <span>多场景任务管理与对比分析</span>
          </div>
          <div class="uimaker-login-brand__feature">
            <span class="uimaker-login-brand__feature-dot" />
            <span>地图可视化与路径信息导出</span>
          </div>
        </div>
      </div>
    </section>

    <section class="uimaker-login-panel">
      <div class="uimaker-login-panel__bg" aria-hidden="true">
        <span class="uimaker-login-panel__orb uimaker-login-panel__orb--1" />
        <span class="uimaker-login-panel__orb uimaker-login-panel__orb--2" />
        <span class="uimaker-login-panel__orb uimaker-login-panel__orb--3" />
        <div class="uimaker-login-panel__grid" />
      </div>

      <div class="uimaker-login-panel__inner">
        <div class="uimaker-login-panel__header">
          <h2 class="uimaker-login-panel__title">用户登录</h2>
          <p class="uimaker-login-panel__subtitle">请输入账号和密码进入系统</p>
        </div>

        <el-form
          ref="loginRef"
          :model="loginForm"
          :rules="rules"
          class="uimaker-login-form"
          @keyup.enter="handleLogin"
        >
          <el-form-item prop="userName">
            <el-input
              v-model="loginForm.userName"
              size="large"
              placeholder="用户名"
              :prefix-icon="User"
            />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="loginForm.password"
              size="large"
              show-password
              placeholder="密码"
              :prefix-icon="Lock"
            />
          </el-form-item>
          <el-form-item class="uimaker-login-form__submit">
            <el-button
              type="primary"
              size="large"
              class="uimaker-login-btn"
              :loading="loading"
              @click="handleLogin"
            >
              登 录
            </el-button>
          </el-form-item>
        </el-form>

        <div class="uimaker-login-footer">
          没有账户？
          <router-link to="/register">立即注册</router-link>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.uimaker-login-panel__header,
.uimaker-login-panel__title,
.uimaker-login-panel__subtitle {
  text-align: center;
}

.uimaker-login-form :deep(.el-form-item) {
  display: block;
  width: 100%;
}

.uimaker-login-form :deep(.el-form-item__content) {
  width: 100% !important;
  margin-left: 0 !important;
}

.uimaker-login-btn {
  width: 100%;
}
</style>
