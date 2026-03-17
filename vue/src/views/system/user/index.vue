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
  <div class="app-container">
    <h1>用户管理</h1>
    <!--顶部搜索和按钮-->
    <div class="card fade-in">
      <div class="search-container">
        <el-form :model="query" ref="queryRef" label-width="70px" inline class="search-form">
          <el-form-item label="用户名称" prop="userName">
            <el-input v-model="query.userName" placeholder="请输入用户名称" class="search-input"/>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" icon="Search" @click="handleQuery" class="search-button">搜索</el-button>
            <el-button icon="Refresh" @click="resetQuery" class="reset-button">清空</el-button>
          </el-form-item>
        </el-form>
        <div class="action-buttons">
          <el-button type="primary" icon="Plus" @click="handleInsert" class="action-button primary">新增</el-button>
          <el-button :disabled="single" type="success" icon="Edit" @click="handleUpdate" class="action-button success">修改</el-button>
          <el-button :disabled="multiple" type="danger" icon="Delete" @click="handleDelete" class="action-button danger">批量删除</el-button>
        </div>
      </div>
    </div>

    <!-- 列表 -->
    <div class="card fade-in" style="margin-top: 20px;">
      <el-table :data="userList" style="width: 100%" border @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="80" align="center"/>
        <el-table-column prop="userId" label="用户编号" width="180" align="center"/>
        <el-table-column prop="userName" label="用户名称" align="center"/>
        <el-table-column prop="roleName" label="角色名称" align="center">
            <template #default="scope">
              <span v-if="scope.row.roleId === 1" class="role-badge admin">管理员</span>
              <span v-else-if="scope.row.roleId === 2" class="role-badge user">普通用户</span>
            </template>
        </el-table-column>
          <el-table-column prop="sex" label="性别" align="center">
            <template #default="scope">
              <span v-if="scope.row.sex === 0" class="sex-badge male">男</span>
              <span v-else-if="scope.row.sex === 1" class="sex-badge female">女</span>
              <span v-else class="sex-badge unknown">未设置</span>
            </template>
          </el-table-column>
        <el-table-column prop="avatar" label="头像" align="center">
          <template #default="scope">
            <el-avatar :size="50" :src="scope.row.avatar? baseUrl + scope.row.avatar : defaultAvatar " />
          </template>
        </el-table-column>
        <el-table-column label="操作" align="center" width="180">
          <template #default="scope">
            <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)">修改</el-button>
            <el-button link type="danger" icon="Delete" @click="handleDelete(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分页 -->
    <div class="fade-in" style="margin-top: 20px;">
      <pagination :total="total"
                  v-model:page="query.pageNum"
                  v-model:limit="query.pageSize"
                  @pagination="getList"
      />
    </div>

    <!-- 添加用户管理框 -->
    <vxe-modal :title="title" width="500px" v-model="open" showFooter show-maximize resize>
      <el-form ref="userRef" :model="form" :rules="rules" label-width="80px">
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

<style scoped>
/* 搜索和按钮容器样式 */
.search-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.search-form {
  flex: 1;
  min-width: 300px;
}

.action-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

/* 搜索输入框样式 */
.search-input {
  width: 300px;
  border-radius: 8px;
  transition: var(--transition);
}

.search-input:focus {
  box-shadow: 0 0 0 2px rgba(77, 79, 200, 0.2);
}

/* 搜索按钮样式 */
.search-button {
  border-radius: 8px;
  font-weight: 500;
  transition: var(--transition);
}

.search-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(77, 79, 200, 0.3);
}

/* 重置按钮样式 */
.reset-button {
  border-radius: 8px;
  transition: var(--transition);
}

.reset-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* 操作按钮样式 */
.action-button {
  border-radius: 8px;
  font-weight: 500;
  transition: var(--transition);
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.action-button.primary:hover {
  box-shadow: 0 4px 12px rgba(77, 79, 200, 0.3);
}

.action-button.success:hover {
  box-shadow: 0 4px 12px rgba(102, 187, 106, 0.3);
}

.action-button.danger:hover {
  box-shadow: 0 4px 12px rgba(244, 67, 54, 0.3);
}

/* 角色和性别徽章样式 */
.role-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  transition: var(--transition);
}

.role-badge.admin {
  background-color: rgba(77, 79, 200, 0.1);
  color: var(--primary-color);
}

.role-badge.user {
  background-color: rgba(102, 187, 106, 0.1);
  color: #66bb6a;
}

.sex-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  transition: var(--transition);
}

.sex-badge.male {
  background-color: rgba(33, 150, 243, 0.1);
  color: #2196f3;
}

.sex-badge.female {
  background-color: rgba(244, 67, 54, 0.1);
  color: #f44336;
}

.sex-badge.unknown {
  background-color: rgba(158, 158, 158, 0.1);
  color: #9e9e9e;
}

/* 动画延迟效果 */
.fade-in {
  animation: fadeIn 0.5s ease-in-out;
}

.fade-in:nth-child(2) {
  animation-delay: 0.1s;
}

.fade-in:nth-child(3) {
  animation-delay: 0.2s;
}

.fade-in:nth-child(4) {
  animation-delay: 0.3s;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .search-container {
    flex-direction: column;
    align-items: stretch;
  }
  
  .search-form {
    width: 100%;
  }
  
  .search-input {
    width: 100%;
  }
  
  .action-buttons {
    justify-content: center;
  }
}
</style>

<style scoped>

</style>