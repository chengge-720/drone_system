<script setup lang="ts">

import {onMounted, ref} from "vue";
import {selectMenuList ,insertMenu ,selectMenuByMenuId ,updateMenu ,deleteMenuByMenuId} from "@/api/system/menu.js"
import SvgIcon from "@/components/SvgIcon/index.vue";
import {VxeModal} from "vxe-pc-ui";
import {ElMessage, ElMessageBox, ElTreeSelect} from "element-plus";
import {Search} from "@element-plus/icons-vue";
import IconSelect from "@/components/IconSelect/index.vue";

//图标选择组件
const iconSelectRef = ref()

//选择图标回调数据
const selectedIcon = (name) => {
  form.value.icon = name
}

//对话框Title
const title = ref('')

//对话框是否打开
const open = ref(false)

//表单参数
const form = ref({
  menuId: null,
  parentId: null,
  menuName: null,
  icon: null,
  menuType: 'M',
  menuSort: null,
  path: null,
  component: null,
})

//表单校验
const rules = {
  menuName: [
    {required: true, message: '请输入菜单名称', trigger: 'blur'},
  ],
  menuSort: [
    {required: true, message: '请输入菜单排序', trigger: 'blur'},
  ],
  path: [
    {required: true, message: '请输入菜单路径', trigger: 'blur'},
  ],
  component: [
    {required: true, message: '请输入组件路径', trigger: 'blur'},
  ]
}

//对话框表单实例
const menuRef = ref()

//新增按钮
const handleInsert = ()=>{
  form.value = {
    menuId: null,
    parentId: 0,
    menuName: null,
    icon: null,
    menuType: 'M',
    menuSort: null,
    path: null,
    component: null,
  }
  getTreeSelect()
  open.value = true
  title.value = '新增菜单'
}

//修改按钮
const handleUpdate = (row) => {
  const menuId = row.menuId
  getTreeSelect()
  selectMenuByMenuId(menuId).then(res => {
    form.value = res.data
    open.value = true
    title.value = '修改菜单'
  })
}

//删除按钮
const handleDelete = (row) => {
  const menuId = row.menuId
  ElMessageBox.confirm(
      '是否删除该菜单?',
      '删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
  )
      .then(() => {
        //删除,调用删除api
        deleteMenuByMenuId(menuId).then(res => {
          ElMessage.success('删除成功')
          getList()
        })
      })
}

const menuOptions = ref( [])

//查询菜单下拉树形结构
const getTreeSelect = ()=>{
  //查询所有菜单
  selectMenuList().then(res=>{
    const menu = {menuId:0, menuName:'顶级菜单', children:[]}
    menu.children = buildTree(res.data,0)
    //添加顶级菜单,注意，如果多次打开下拉弹出，树内会有重复数据，所以要清空
    menuOptions.value = []
    menuOptions.value.push(menu)
  })
}

//菜单列表
const menuList = ref([])

//顶部查询表单实例
const queryRef = ref()

//查询参数
const query = ref({
  menuName: null,
})

//保存按钮
const submitForm = () => {
  menuRef.value.validate(valid => {
    if (valid) {
      if(form.value.menuId != null){
        //调用修改api
        updateMenu(form.value).then(res => {
          ElMessage.success('修改成功')
          open.value = false
          getList()
        })
      }else{
        //调用新增api
        insertMenu(form.value).then(res=>{
          ElMessage.success('保存成功')
          open.value = false
          getList()
        })
      }
    }
  })
}

//搜索方法
const handleQuery = () => {
  getList()
}

//清空方法
const resetQuery = () => {
  queryRef.value.resetFields()
  handleQuery()
}

//查询数据
const getList = ()=>{
  selectMenuList(query.value).then(res=>{
    if(query.value.menuName !== null){
      //如果有查询参数
      menuList.value = res.data
    }else{
      menuList.value = buildTree(res.data,0)
    }
  })
}

//构建树形结构数据
//之前的数据:[{menuId:1 ,parentId:0},{menuId:2 ,parentId:1}]
//构建后的数据:[{menuId:1 ,parentId:0,children:[{menuId:2 ,parentId:1}]}]
const buildTree = (data, parentId)=>{
  //存放当前层级的所有菜单项
  const result = []
  //遍历菜单项
  for(const item of data){
    //判断当前菜单项的父级ID是否等于父级ID
    if(item.parentId === parentId){
      //递归构建子菜单
      const children = buildTree(data,item.menuId);
      //如果有子菜单
      if(children.length > 0){
        //添加子菜单
        item.children = children
      }
      //添加到结果中
      result.push(item)
    }
  }
  //返回结果
  return result
}

onMounted(()=>{
  getList()
})
</script>

<template>
  <div class="app-container">
    <h1>菜单管理</h1>

    <!--顶部搜索-->
    <el-form :model="query" ref="queryRef" label-width="70px" inline>
      <el-form-item label="菜单名称" prop="menuName">
        <el-input v-model="query.menuName" placeholder="请输入菜单名称"/>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" @click="handleQuery">搜索</el-button>
        <el-button icon="Refresh" @click="resetQuery">清空</el-button>
        <el-button type="primary" icon="Plus" @click="handleInsert">新增</el-button>
      </el-form-item>
    </el-form>

    <!-- 列表 -->
    <el-table :data="menuList" style="width: 100%" border row-key="menuId"
              :tree-props="{children: 'children' , hasChildren: 'hasChildren'}">
      <el-table-column prop="menuName" label="菜单名称" align="center"/>
      <el-table-column prop="icon" label="图标" align="center">
        <template #default="scope">
          <svg-icon :icon-class="scope.row.icon"/>
        </template>
      </el-table-column>
      <el-table-column prop="menuSort" label="排序" align="center"/>
      <el-table-column prop="component" label="菜单路径" align="center"/>
      <el-table-column label="操作" align="center" width="180">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)">修改</el-button>
          <el-button link type="danger" icon="Delete" @click="handleDelete(scope.row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加或修改菜单对话框 -->
    <!-- 添加角色管理框 -->
    <vxe-modal :title="title" width="50%" v-model="open" showFooter show-maximize resize>
      <el-form ref="menuRef" :model="form" :rules="rules" label-width="80px">
        <el-row>
          <el-col :span="12">
            <el-form-item label="上级菜单">
              <el-tree-select v-model="form.parentId"
                              :data="menuOptions"
                              :props="{ value: 'menuId',label: 'menuName', children: 'children' }"
                              check-strictly
                              value-key="menuId"
                              placeholder="请选择上级菜单">
              </el-tree-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="菜单类型" prop="menuType">
              <el-radio-group v-model="form.menuType">
                <el-radio label="M">目录</el-radio>
                <el-radio label="C">菜单</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="12">
            <el-form-item label="图标" prop="icon">
              <el-popover placement="bottom-start" width="550" trigger="click">
                <template #reference>
                  <el-input v-model="form.icon" placeholder="请选择图标" @blur="">
                    <template #prefix>
                      <svg-icon v-if="form.icon" :icon-class="form.icon" style="height: 32px;width: 16px;"/>
                      <el-icon v-else>
                        <Search />
                      </el-icon>
                    </template>
                  </el-input>
                </template>
                <icon-select ref="iconSelectRef" @selected="selectedIcon" style="font-size: medium"/>
              </el-popover>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="显示排序" prop="menuSort">
              <el-input-number v-model="form.menuSort" :min="0" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="12">
            <el-form-item label="菜单名称" prop="menuName">
              <el-input v-model="form.menuName" placeholder="请输入菜单名称"/>
            </el-form-item>
          </el-col>
          <el-col :span="12" v-if="form.menuType === 'C'">
            <el-form-item label="路由地址" prop="path">
              <el-input v-model="form.path" placeholder="请输入路由地址"/>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="12" v-if="form.menuType === 'C'">
            <el-form-item label="组件路径" prop="component">
              <el-input v-model="form.component" placeholder="请输入组件路径"/>
            </el-form-item>
          </el-col>
        </el-row>
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