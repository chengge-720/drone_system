<script setup lang="ts">
//角色列表数据
import {nextTick, onMounted, ref} from "vue";
import {selectRoleList, selectRoleByRoleId ,insertRole ,updateRole ,deleteRoleByRoleIds} from "@/api/system/role.js";
import {selectRoleMenuTree,selectRoleMenusTree} from "@/api/system/menu.js";
import Pagination from "@/components/Pagination/index.vue";
import {VxeModal} from "vxe-pc-ui";
import {ElMessage, ElMessageBox} from "element-plus";

//菜单权限表单实例
const menuRef = ref()

//表单实例
const roleRef = ref()

//表单title
const title = ref('');

//对话框是否打开
const open = ref(false);

//表单参数
const form = ref({
  roleId: null,
  roleName: null,
  roleSort: null,
  menuIds: []
})

//表单验证规则
const rules = {
  roleName: [
    {required: true, message: '请输入角色名称', trigger: 'blur'},
  ],
  roleSort: [
    {required: true, message: '请输入角色排序', trigger: 'blur'},
  ],
}

//新增按钮
const handleInsert = () => {
  if(menuRef.value){
    menuRef.value.setCheckedKeys([])
  }
  form.value = {
    roleId: null,
    roleName: null,
    roleSort: null,
    menuIds: []
  }
  selectRoleMenusTree().then(res => {
    menuOptions.value = res.data
    //获取树形结构菜单数据
    open.value = true
    title.value = '添加角色'
  })


}

//修改按钮
const handleUpdate = (row) => {
  // 使用可选链操作符安全地清除菜单选中状态
  if(menuRef.value){
    menuRef.value.setCheckedKeys([])
  }
  form.value = {
    roleId: null,
    roleName: null,
    roleSort: null,
    menuIds: []
  }
  // 确保只使用单个角色ID，避免传递数组导致400错误
  const roleId = row.roleId || (ids.value.length === 1 ? ids.value[0] : null)
  
  // 如果没有有效的角色ID，给出提示
  if (!roleId) {
    ElMessage.warning('请选择一个角色进行修改')
    return
  }
  
  //根据角色ID查询菜单树
  const roleMenu = getRoleMenuTreeSelect(roleId)
  selectRoleByRoleId(roleId).then(res => {
    form.value = res.data
    open.value = true
    title.value = '修改角色'

    //等待DOM渲染完毕，再设置默认选中的菜单
    nextTick(() => {
      roleMenu.then((res) => {
        //获取该角色已选中的菜单
        let checkedKeys = res.checkedKeys
        //遍历菜单树，找到已选中的菜单
        checkedKeys.forEach((v) => {
          nextTick(() => {
            menuRef.value.setChecked(v,true,false)
          })
        })
      })
    })
  })
}

//保存按钮
const submitForm = () => {
  roleRef.value.validate(valid => {
    if (valid) {
      if(form.value.roleId != null){
        //修改,设置选中的菜单ID
        form.value.menuIds = getMenuAllCheckedKeys()
        //修改,调用修改api
        updateRole(form.value).then(res => {
          ElMessage.success('修改成功')
          open.value = false
          getList()
        })
      }else{
        form.value.menuIds = getMenuAllCheckedKeys()
        console.log(form.value,'保存数据')
        //新增,调用新增api
        insertRole(form.value).then(res => {
          ElMessage.success('保存成功')
          open.value = false
          getList()
        })
      }
    }
  })
}

//获取所有已选的菜单ID
const getMenuAllCheckedKeys = () => {
  //获取全选中的菜单ID
  let checkedKeys = menuRef.value.getCheckedKeys()
  //获取半选的菜单ID
  let halfCheckedKeys = menuRef.value.getHalfCheckedKeys()
  //将半选的菜单ID添加到已选的菜单ID数组中
  checkedKeys.unshift.apply(checkedKeys, halfCheckedKeys)
  //返回所有选择的菜单ID
  return checkedKeys
}

//获取树形结构菜单数据
const menuOptions = ref([])

//根据角色ID查询菜单树
const getRoleMenuTreeSelect = (roleId) => {
  return selectRoleMenuTree(roleId).then(res => {
    //清空数组，避免重复添加
    menuOptions.value =  []
    //将返回的菜单树赋值给menuOptions
    console.log(res, '看看数据')
    menuOptions.value = res.menus
    return res
  })
}

//删除按钮
const handleDelete = (row) => {
  // 处理删除的roleIds，确保正确的数据类型
  let roleIds =  []
  if (row.roleId) {
    // 单行删除
    roleIds = row.roleId
  } else if (ids.value && ids.value.length > 0) {
    // 多选删除
    roleIds = ids.value
  } else {
    ElMessage.warning('请至少选择一个角色进行删除')
    return
  }

  const message = Array.isArray(roleIds) ? `是否删除选中的${roleIds.length}个角色?` : '是否删除该角色?'
  
  ElMessageBox.confirm(
      message,
      '删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
  )
      .then(() => {
        //删除,调用删除api
        deleteRoleByRoleIds(roleIds).then(res => {
          ElMessage.success('删除成功')
          getList()
        })
      })
}

//多选的ID数组
const ids = ref([]);

//当前是否未选中单行
const single = ref(true);

//当前是否未选中多行
const multiple = ref(true);

//顶部查询表单实例
const queryRef = ref()

//多选触发
const handleSelectionChange = (selection)=>{
  ids.value = selection.map(item => item.roleId)
  single.value = selection.length !== 1
  multiple.value = !selection.length
}

//角色列表数据
const roleList = ref([]);

//数据总数
const total = ref(0);

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

//查询参数
const query = ref({
  pageNum: 1,
  pageSize: 5,
  roleName: null,
})

//查询数据
const getList = ()=>{
  selectRoleList(query.value).then(res=>{
    roleList.value = res.rows
    total.value = res.total
  })
}

onMounted(()=>{
  getList()
})
</script>

<template>
<div class="app-container">
    <h1>角色管理</h1>
    <!--顶部搜索和按钮-->
    <div class="card fade-in">
      <div class="search-container">
        <el-form :model="query" ref="queryRef" label-width="70px" inline class="search-form">
          <el-form-item label="角色名称" prop="roleName">
            <el-input v-model="query.roleName" placeholder="请输入角色名称" class="search-input"/>
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
    <el-table :data="roleList" style="width: 100%" border @selection-change="handleSelectionChange">
      <el-table-column type="selection" width="80" align="center"/>
      <el-table-column prop="roleId" label="角色编号" width="180" align="center"/>
      <el-table-column prop="roleName" label="角色名称" align="center"/>
      <el-table-column label="操作" align="center" width="180">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)">修改</el-button>
          <el-button link type="danger" icon="Delete" @click="handleDelete(scope.row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

  <!-- 分页 -->
  <pagination :total="total"
              v-model:page="query.pageNum"
              v-model:limit="query.pageSize"
              @pagination="getList"
  />

  <!-- 添加角色管理框 -->
  <vxe-modal :title="title" width="500px" v-model="open" showFooter show-maximize resize>
    <el-form ref="roleRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="角色名称" prop="roleName">
        <el-input v-model="form.roleName" placeholder="请输入角色名称" />
      </el-form-item>
      <el-form-item label="角色排序" prop="roleSort">
        <el-input v-model="form.roleSort" placeholder="请输入角色排序" />
      </el-form-item>
      <el-form-item label="菜单权限">
        <el-tree
                  style="width: 100%"
                  :data="menuOptions"
                  show-checkbox
                  default-expand-all
                  ref="menuRef"
                  node-key="id"
                  :props="{label: 'label', children: 'children'}"
        />
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