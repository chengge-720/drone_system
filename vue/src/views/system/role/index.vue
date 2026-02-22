<script setup lang="ts">
//角色列表数据
import {nextTick, onMounted, ref} from "vue";
import {selectRoleList, selectRoleByRoleId ,insertRole ,updateRole ,deleteRoleByRoleIds} from "@/api/system/role.js";
import {selectRoleMenuTree} from "@/api/system/menu.js";
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
  open.value = true
  title.value = '添加角色'
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
  const roleId = row.roleId || ids.value
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
        //修改,调用修改api
        updateRole(form.value).then(res => {
          ElMessage.success('修改成功')
          open.value = false
          getList()
        })
      }else{
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
  const roleIds = row.roleId || ids.value

  ElMessageBox.confirm(
      '是否删除该角色?',
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
    <!--顶部搜索-->
    <el-form :model="query" ref="queryRef" label-width="70px" inline>
      <el-form-item label="角色名称" prop="roleName">
        <el-input v-model="query.roleName" placeholder="请输入角色名称"/>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" @click="handleQuery">搜索</el-button>
        <el-button icon="Refresh" @click="resetQuery">清空</el-button>
        <!--顶部按钮-->
        <el-button type="primary" icon="Plus" @click="handleInsert">新增</el-button>
      </el-form-item>
    </el-form>

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

</style>