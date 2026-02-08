
<template>
  <div style="text-align: center;margin: 20px auto;max-width: 500px;">
    <div >
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

    <div style="margin-top: 20px">
      <el-button type="primary" @click="">修改信息</el-button>
      <el-button type="primary" @click="">修改密码</el-button>
    </div>
  </div>

</template>

<script setup>

import useUserStore from "@/stores/modules/userStore.js";
import {onMounted, reactive} from "vue";
import {getInfo} from "@/api/login.js";
import {getToken} from "@/utils/auth.js";
import {ElMessage} from "element-plus";

//后端头像上传接口
const uploadUrl = import.meta.env.VITE_APP_BASE_API + "/system/user/profile/avatar"

//请求头
const headers = {"Authorization": "Bearer " + getToken()}

//用户信息
const userStore = useUserStore()
//数据状态
const state = reactive( {
  user:{}
})

//上传前处理
const beforeUpload = (file) =>{
  const isJPG = file.type === 'image/jpeg' || file.type === 'image/png'
  if (!isJPG) {
    ElMessage.error('上传头像图片只能是 JPG 格式!')
  }
  return isJPG;
}

//处理上传成功
const handleAvatarSuccess = (res, file) =>{
  if(res.code === 200){
    ElMessage.success("上传成功！")
    userStore.avatar = import.meta.env.VITE_APP_BASE_API + res.imgUrl
  }else{
    ElMessage.error(res.msg,"上传失败！")
  }
}

//处理上传失败
const handleAvatarError = () =>{
  ElMessage.error("上传失败！")
}

//读取用户信息
const getUser =  () =>{
  getInfo().then(res =>{
    state.user = res.data
  })
}

onMounted(()=>{
  getUser()
})

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
</style>