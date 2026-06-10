<script setup lang="ts">
import { ref } from 'vue'
import { register } from '@/api/register.js'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { User, Lock } from '@element-plus/icons-vue'

const loading = ref(false)
const registerRef = ref()
const registerForm = ref({
  userName: null,
  password: null,
  confirmPassword: null
})

const equalToPassword = (_rule: unknown, value: string, callback: (err?: Error) => void) => {
  if (value !== registerForm.value.password) {
    callback(new Error('密码不一致'))
  } else {
    callback()
  }
}

const rules = ref({
  userName: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  confirmPassword: [
    { required: true, message: '请输入确认密码', trigger: 'blur' },
    { required: true, validator: equalToPassword, trigger: 'blur' }
  ]
})

const router = useRouter()

const handleRegister = () => {
  registerRef.value.validate((valid: boolean) => {
    if (valid) {
      loading.value = true
      register(registerForm.value).then(() => {
        ElMessage.success(`恭喜！账号 ${registerForm.value.userName} 注册成功！`)
        router.push('/login')
      }).catch(() => {
        loading.value = false
        ElMessage.error('注册失败！用户名已存在！')
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
          <h2 class="uimaker-login-panel__title">用户注册</h2>
          <p class="uimaker-login-panel__subtitle">请填写账号信息完成注册</p>
        </div>

        <el-form
          ref="registerRef"
          :model="registerForm"
          :rules="rules"
          class="uimaker-login-form"
          @keyup.enter="handleRegister"
        >
          <el-form-item prop="userName">
            <el-input
              v-model="registerForm.userName"
              size="large"
              placeholder="用户名"
              :prefix-icon="User"
            />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="registerForm.password"
              size="large"
              show-password
              placeholder="密码"
              :prefix-icon="Lock"
            />
          </el-form-item>
          <el-form-item prop="confirmPassword">
            <el-input
              v-model="registerForm.confirmPassword"
              size="large"
              show-password
              placeholder="确认密码"
              :prefix-icon="Lock"
            />
          </el-form-item>
          <el-form-item class="uimaker-login-form__submit">
            <el-button
              type="primary"
              size="large"
              class="uimaker-login-btn"
              :loading="loading"
              @click="handleRegister"
            >
              注 册
            </el-button>
          </el-form-item>
        </el-form>

        <div class="uimaker-login-footer">
          已有账户？
          <router-link to="/login">返回登录</router-link>
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
