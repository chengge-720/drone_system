<script setup lang="ts">
import {ref} from "vue";
import {register} from "@/api/register.js";
import {ElMessage} from "element-plus";
import {useRouter} from "vue-router";

const loading = ref(false)
const registerRef = ref()
//表单参数
const registerForm = ref( {
  userName: null,
  password: null,
  confirmPassword: null,
})
//密码校验
const equalToPassword = (rule, value, callback) => {
  if(value !== registerForm.value.password){
    callback(new Error('密码不一致'))
  }else{
    callback()
  }
}

//表单校验
const rules = ref({
  userName: [{required: true, message: '请输入用户名', trigger: 'blur'}],
  password: [{required: true, message: '请输入密码！', trigger: 'blur'}],
  confirmPassword: [{required: true, message: '请输入确认密码！', trigger: 'blur'},
    {required: true, validator: equalToPassword, trigger: 'blur'}
  ],
})

//路由实例
const router = useRouter()

//注册方法
const handleRegister = () => {
  registerRef.value.validate(valid => {
    if( valid ){
      //打开加载状态
      loading.value = true
      //调用注册方法
      register(registerForm.value).then(res => {
        ElMessage.success("恭喜！账号" + registerForm.value.userName + "注册成功！")
        router.push('/login')
      }).catch(()=>{
        loading.value = false
        ElMessage.error("注册失败！用户名已存在！")
      })
    }
  })
}

</script>

<template>
  <div class="login-container">
    <div style="display: flex;width: 500px;background-color: rgba(255,255,255,0.7)">
      <div style="flex: 1;padding: 40px;display: flex;flex-direction: column;justify-content: center;">
        <div style="text-align: center">
          <h3 style="font-size: 28px;color:#333">注册</h3>
          <p style="color: #999;font-size: 14px">请输入您的注册信息</p>
        </div>
        <el-form :model="registerForm" ref="registerRef" :rules="rules">
          <el-form-item prop="userName">
            <el-input v-model="registerForm.userName" size="large" placeholder="请输入用户名" />
          </el-form-item>

          <el-form-item prop="password">
            <el-input show-password v-model="registerForm.password" size="large" placeholder="请输入密码" />
          </el-form-item>

          <el-form-item prop="confirmPassword">
            <el-input show-password v-model="registerForm.confirmPassword" size="large" placeholder="请确认密码" />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="handleRegister">注册</el-button>
          </el-form-item>

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