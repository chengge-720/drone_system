<script setup lang="ts">

import {ref} from "vue";
import {login} from "@/api/login.js";

const loading = ref(false)
const loginRef = ref()
//表单参数
const loginForm = ref( {
  userName: null,
  password: null
})

//登录方法
const handleLogin = () => {
  loginRef.value.validate(async valid => {
    if( valid ){
      //打开加载首页
      loading.value = true
      console.log(loginForm.value,'看看用户输入的用户名和密码')
      try {
        const response = await login(loginForm.value)
        console.log('登录成功:', response)
        loading.value = false
      } catch (error) {
        console.error('登录失败:', error)
        console.error('错误响应:', error.response)
        console.error('错误响应数据:', error.response?.data)
        console.error('错误状态:', error.response?.status)
        loading.value = false
      }
    }
  })
}

//表单校验
const rules = ref({
  userName: [{required: true, message: '请输入用户名', trigger: 'blur'}],
  password: [{required: true, message: '请输入密码！', trigger: 'blur'}],
})


</script>

<template>
<div class="login-container">
  <div style="display: flex;width: 500px;background-color: rgba(255,255,255,0.7)">
    <div style="flex: 1;padding: 40px;display: flex;flex-direction: column;justify-content: center;">
      <div style="text-align: center">
        <h3 style="font-size: 28px;color:#333">登录</h3>
        <p style="color: #999;font-size: 14px">请输入您的登录信息</p>
      </div>
      <el-form :model="loginForm" ref="loginRef" :rules="rules">
        <el-form-item prop="userName">
          <el-input v-model="loginForm.userName" size="large" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="loginForm.password" size="large" placeholder="请输入密码" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="handleLogin">登录</el-button>
        </el-form-item>

        <div style="color: #666;text-align: end ;">
          没有账户？<router-link to="/register" style="text-decoration: none">点击注册</router-link>
        </div>
      </el-form>
    </div>


  </div>
</div>
</template> 

<style scoped>
.login-container{
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: url("@/assets/images/BG1.jpg") no-repeat center;
  background-size: cover;
  position: relative;
}
</style>