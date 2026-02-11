<template>
  <div style="text-align: center;margin: 20px auto;max-width: 500px;">
    <h2>用户个人中心</h2>
    <!-- 头像上传区域 -->
    <div>
      <el-upload
          class="avatar-uploader"
          :action="uploadUrl"
          :headers="headers"
          :show-file-list="false"
          :on-success="handleAvatarSuccess"
          :on-error="handleAvatarError"
          :before-upload="beforeUpload">
        <img :src="userStore.avatar" class="avatar" alt=""/>
      </el-upload>
    </div>

    <!-- 用户信息列表 -->
    <ul class="list-group" style="display: inline-block;text-align: left;width: 100%;max-width: 300px">
      <li class="list-group-item">
        名称
        <div class="pull-right">{{userStore.name}}</div>
      </li>

      <li class="list-group-item">
        性别
        <div class="pull-right" v-if="state.user.sex === 0">男</div>
        <div class="pull-right" v-else>女</div>
      </li>
    </ul>

    <!-- 操作按钮 -->
    <div style="margin-top: 20px">
      <el-button type="primary" @click="editUserInfo">修改信息</el-button>
      <el-button type="primary" @click="editPassword">修改密码</el-button>
    </div>


    <!-- 基本资料状态管理框 -->
    <vxe-modal title="修改用户信息" width="500px" v-model="userInfoOpen" showFooter show-maximize resize>
      <el-form ref="userRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="用户名" prop="userName">
          <el-input v-model="form.userName" />
        </el-form-item>
        <el-form-item label="性别" prop="sex">
          <el-radio-group v-model="form.sex">
            <el-radio :label="0">男</el-radio>
            <el-radio :label="1">女</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <div style="text-align: center">
          <el-button type="primary" @click="submitUserInfo">保存</el-button>
          <el-button @click="userInfoOpen = false">取消</el-button>
        </div>
      </template>
    </vxe-modal>

    <!-- 用户密码状态管理框 -->
    <vxe-modal title="修改用户密码" width="500px" v-model="pwdOpen" showFooter show-maximize resize>
      <el-form ref="pwdRef" :model="pwdForm" :rules="pwdRules" label-width="80px">
        <el-form-item label="原密码" prop="oldPassword">
          <el-input v-model="pwdForm.oldPassword" placeholder="请输入原密码"/>
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="pwdForm.newPassword" placeholder="请输入新密码"/>
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="pwdForm.confirmPassword" placeholder="请确认新密码"/>
        </el-form-item>
      </el-form>
      <template #footer>
        <div style="text-align: center">
          <el-button type="primary" @click="submitPwd">保存</el-button>
          <el-button @click="pwdOpen = false">取消</el-button>
        </div>
      </template>
    </vxe-modal>

  </div>
</template>

<script setup>
import {ref, reactive, onMounted, watch} from 'vue'
import { ElMessage } from 'element-plus'
import useUserStore from "@/stores/modules/userStore.js";
import { getInfo } from "@/api/login.js";
import { getToken } from "@/utils/auth.js";
import {VxeModal} from 'vxe-pc-ui'
import {updateProfile, updatePwd} from "@/api/system/user.js";

// 响应式数据
const userInfoOpen = ref(false)
const pwdOpen = ref(false)
const passwordDialogVisible = ref(false)
const userStore = useUserStore()

//表单实例
const pwdRef = ref()
const userRef = ref()
//用户资料表单参数
const form = ref({})
const pwdForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

//表单校验
const rules = ref({
  userName:[{ required: true, message: '请输入用户名', trigger: 'blur'}],
})
//密码表单校验
const pwdRules = ref({
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur'}],
  newPassword: [{ required: true, message: '请输入新密码', trigger: 'blur'}],
  confirmPassword: [{ required: true, message: '请确认新密码', trigger: 'blur'}],
})

//提交用户信息
const submitUserInfo = () => {
  userRef.value.validate(valid => {
    if( valid ){
      updateProfile(form.value).then(res => {
        userInfoOpen.value = false
        ElMessage.success("修改成功！")
        getUser()//刷新用户信息
        userStore.name = form.value.userName
      })
      //userInfoOpen.value = false
    }
  })
}

//用户密码表单提交
const submitPwd = () => {
  if(pwdForm.value.newPassword !== pwdForm.value.confirmPassword){
    ElMessage.error("新密码和确认密码不一致！")
    return
  }
  pwdRef.value.validate(valid => {
    if( valid ){
      updatePwd(pwdForm.value).then(res => {
        ElMessage.success("修改成功！")
        pwdOpen.value = false
      })
    }
  })
}

const state = reactive({
  user: {}
})

// 后端配置
const uploadUrl = import.meta.env.VITE_APP_BASE_API + "/system/user/profile/avatar"
const headers = {"Authorization": "Bearer " + getToken()}

// 主要功能方法
const editUserInfo = () => {
  userInfoOpen.value = true
}

// 修改密码方法
const editPassword = () => {
  pwdOpen.value = true
}



// 上传相关方法
const beforeUpload = (file) => {
  const isJPG = file.type === 'image/jpeg' || file.type === 'image/png'
  if (!isJPG) {
    ElMessage.error('上传头像图片只能是 JPG 格式!')
  }
  return isJPG;
}

const handleAvatarSuccess = (res, file) => {
  if(res.code === 200){
    ElMessage.success("上传成功！")
    userStore.avatar = import.meta.env.VITE_APP_BASE_API + res.imgUrl
  }else{
    ElMessage.error(res.msg,"上传失败！")
  }
}

const handleAvatarError = () => {
  ElMessage.error("上传失败！")
}

// 获取用户信息
const getUser = () => {
  getInfo().then(res => {
    state.user = res.data
    //初始化表单参数
    form.value = {
      userName: res.data.userName,
      sex: res.data.sex
    }
    console.log('获取到用户数据:', state.user)
  }).catch(error => {
    console.error('获取用户信息失败:', error)
  })
}

// 组件挂载时获取用户信息
onMounted(() => {
  getUser()
})

//监听表单
watch(() => state.user,
    user => {
      if(user){
        form.value = {userName: user.userName, sex: user.sex}
      }
    },
    {immediate: true}
)
</script>

<style scoped>
.list-group{
  padding-left: 0;
  list-style: none;
}
.pull-right{
  float: right;
}
.list-group-item{
  margin-bottom: -1px;
  padding: 11px 0;
  font-size: 14px;
}
.avatar-uploader .avatar{
  width: 100px;
  height: 100px;
  display: block;
  border-radius: 20px;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>