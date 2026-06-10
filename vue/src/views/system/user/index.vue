<script setup lang="ts">

import {onMounted, ref} from "vue";
import {selectUserList, insertUser, selectUserByUserId, updateUser, deleteUserByUserIds} from "@/api/system/user.js";
import {selectAllRole} from "@/api/system/role.js";

//用户默认头像
import defaultAvatar from '@/assets/images/profile.jpg'
import Pagination from "@/components/Pagination/index.vue";
import {validators, VxeModal} from "vxe-pc-ui";
import {ElMessage, ElMessageBox} from "element-plus";

//表单实例
const userRef = ref()

//表单title
const title = ref('');

//对话框是否打开
const open = ref(false);

//表单参数
const form = ref({
  userId: null,
  userName: null,
  sex: null,
  password: null,
  roleId: null,
})

//表单验证规则
const rules = {
  userName: [
    {required: true, message: '请输入用户名', trigger: 'blur'},
  ],
  password: [
    {required: true, message: '请输入密码', trigger: 'blur'},
  ],
  roleId: [
    {required: true, message: '请选择角色', trigger: 'change'},
  ],
}

//新增按钮
const handleInsert = ()=>{
  form.value = {
    userId: null,
    userName: null,
    sex: null,
    password: null,
    roleId: null,
  }
  open.value = true
  title.value = '添加用户'
}

//修改按钮
const handleUpdate = (row) => {
  const userId = row.userId || ids.value
  selectUserByUserId(userId).then(res => {
    form.value = res.data
    open.value = true
    title.value = '修改用户'
  })
}

//删除按钮
const handleDelete = (row) => {
  const userIds = row.userId || ids.value
  ElMessageBox.confirm(
      '是否删除该用户?',
      '删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
      .then(() => {
        //删除,调用删除api
        deleteUserByUserIds(userIds).then(res => {
          if(res.code === 200){
            ElMessage.success('删除成功')
            getList()
          }
        })
      })
}

//保存按钮
const submitForm = () => {
  userRef.value.validate(valid => {
    if (valid) {
      if(form.value.userId != null){
        //修改,调用修改api
        updateUser(form.value).then(res => {
          if(res.code === 200){
            ElMessage.success('修改成功')
            open.value = false
            getList()
          }
        })
      }else{
        //新增,调用新增api
        insertUser(form.value).then(res => {
          if(res.code === 200){
            ElMessage.success('新增成功')
            open.value = false
            getList()
          }
        })
      }
      }
  })
}

//后端路径
const baseUrl = import.meta.env.VITE_APP_BASE_API

//顶部查询表单实例
const queryRef = ref()

//查询参数
const query = ref({
  pageNum: 1,
  pageSize: 5,
  userName: null,
})

//用户列表数据
const userList = ref([]);

//当前是否未选中单行
const single = ref(true);

//当前是否未选中多行
const multiple = ref(true);

//数据总数
const total = ref(0);

//查询数据
const getList = ()=>{
  selectUserList(query.value).then(res=>{
    userList.value = res.rows;
    total.value = res.total
  })
}

//多选的ID数组
const ids = ref([]);

//多选触发
const handleSelectionChange = (selection)=>{
  ids.value = selection.map(item => item.userId)
  single.value = selection.length !== 1
  multiple.value = !selection.length
}

//搜索方法
const handleQuery = () => {
  query.value.pageNum = 1
  getList()
}

//清空方法
const resetQuery = () => {
  queryRef.value.resetFields()
  handleQuery()
}

//角色列表数据
const roleList = ref([]);

onMounted(()=>{
  getList()
  //查询角色列表
  selectAllRole().then(res=>{
    roleList.value = res.data
  })

})

</script>

<template>
  <div class="admin-page">
    <div class="admin-page__header">
      <div>
        <h1 class="admin-page__title">用户管理</h1>
        <p class="admin-page__subtitle">管理系统用户账号、角色分配与基础信息</p>
      </div>
      <span class="admin-page__header-meta">共 {{ total }} 条记录</span>
    </div>

    <div class="admin-page__toolbar">
      <el-form :model="query" ref="queryRef" label-width="70px" inline class="admin-page__search">
        <el-form-item label="用户名称" prop="userName">
          <el-input
            v-model="query.userName"
            placeholder="请输入用户名称"
            clearable
            class="admin-page__search-input"
            @keyup.enter="handleQuery"
          >
            <template #append>
              <el-button type="primary" icon="Search" @click="handleQuery" />
              <el-button icon="Refresh" @click="resetQuery" />
            </template>
          </el-input>
        </el-form-item>
      </el-form>
      <div class="admin-page__actions">
        <el-button type="primary" icon="Plus" @click="handleInsert">新增</el-button>
        <el-button :disabled="single" type="success" icon="Edit" @click="handleUpdate">修改</el-button>
        <el-button :disabled="multiple" type="danger" icon="Delete" @click="handleDelete">批量删除</el-button>
      </div>
    </div>

    <div class="admin-page__panel">
      <div class="admin-page__panel-head">
        <span class="admin-page__panel-title">用户列表</span>
        <span class="admin-page__panel-meta">当前第 {{ query.pageNum }} 页</span>
      </div>
      <el-table :data="userList" class="admin-table" style="width: 100%" border @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="48" align="center"/>
        <el-table-column prop="userId" label="用户编号" width="100" align="center"/>
        <el-table-column prop="userName" label="用户名称" align="center" min-width="140"/>
        <el-table-column prop="roleName" label="角色名称" align="center" width="120">
          <template #default="scope">
            <span v-if="scope.row.roleId === 1" class="admin-badge admin-badge--primary">管理员</span>
            <span v-else-if="scope.row.roleId === 2" class="admin-badge admin-badge--success">普通用户</span>
          </template>
        </el-table-column>
        <el-table-column prop="sex" label="性别" align="center" width="100">
          <template #default="scope">
            <span v-if="scope.row.sex === 0" class="admin-badge admin-badge--info">男</span>
            <span v-else-if="scope.row.sex === 1" class="admin-badge admin-badge--danger">女</span>
            <span v-else class="admin-badge admin-badge--warning">未设置</span>
          </template>
        </el-table-column>
        <el-table-column prop="avatar" label="头像" align="center" width="90">
          <template #default="scope">
            <el-avatar :size="40" :src="scope.row.avatar? baseUrl + scope.row.avatar : defaultAvatar " />
          </template>
        </el-table-column>
        <el-table-column label="操作" align="center" width="168" class-name="admin-table-ops">
          <template #default="scope">
            <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)">修改</el-button>
            <el-button link type="danger" icon="Delete" @click="handleDelete(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="admin-page__pagination">
        <pagination
          :total="total"
          v-model:page="query.pageNum"
          v-model:limit="query.pageSize"
          @pagination="getList"
        />
      </div>
    </div>

    <vxe-modal :title="title" width="500px" v-model="open" showFooter show-maximize resize class-name="admin-modal">
      <el-form ref="userRef" :model="form" :rules="rules" label-width="80px" class="admin-form">
        <el-form-item label="用户名" prop="userName">
          <el-input v-model="form.userName" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="性别" prop="sex">
          <el-radio-group v-model="form.sex">
            <el-radio :label="0">男</el-radio>
            <el-radio :label="1">女</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" placeholder="请输入密码" />
        </el-form-item>
        <el-form-item label="角色" prop="roleId">
          <el-select v-model="form.roleId" placeholder="请选择角色">
            <el-option v-for="role in roleList"
                       :key="role.roleId"
                       :label="role.roleName"
                       :value="role.roleId" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <div style="text-align: center">
          <el-button type="primary" @click="submitForm">保存</el-button>
          <el-button @click="open = false">取消</el-button>
        </div>
      </template>
    </vxe-modal>
  </div>
</template>