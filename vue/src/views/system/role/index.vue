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
  <div class="admin-page">
    <div class="admin-page__header">
      <div>
        <h1 class="admin-page__title">角色管理</h1>
        <p class="admin-page__subtitle">配置系统角色权限与菜单访问范围</p>
      </div>
      <span class="admin-page__header-meta">共 {{ total }} 条记录</span>
    </div>

    <div class="admin-page__toolbar">
      <el-form :model="query" ref="queryRef" label-width="70px" inline class="admin-page__search">
        <el-form-item label="角色名称" prop="roleName">
          <el-input
            v-model="query.roleName"
            placeholder="请输入角色名称"
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
        <span class="admin-page__panel-title">角色列表</span>
        <span class="admin-page__panel-meta">当前第 {{ query.pageNum }} 页</span>
      </div>
      <el-table :data="roleList" class="admin-table" style="width: 100%" border @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="48" align="center"/>
        <el-table-column prop="roleId" label="角色编号" width="100" align="center"/>
        <el-table-column prop="roleName" label="角色名称" align="center" min-width="200"/>
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
      <el-form ref="roleRef" :model="form" :rules="rules" label-width="80px" class="admin-form">
        <el-form-item label="角色名称" prop="roleName">
          <el-input v-model="form.roleName" placeholder="请输入角色名称" />
        </el-form-item>
        <el-form-item label="角色排序" prop="roleSort">
          <el-input v-model="form.roleSort" placeholder="请输入角色排序" />
        </el-form-item>
        <el-form-item label="菜单权限">
          <el-tree
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