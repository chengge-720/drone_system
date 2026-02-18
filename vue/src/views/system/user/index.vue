<script setup lang="ts">

import {onMounted, ref} from "vue";
import {selectUserList} from "@/api/system/user.js";

//用户默认头像
import defaultAvatar from '@/assets/images/profile.jpg'
import Pagination from "@/components/Pagination/index.vue";

const baseUrl = import.meta.env.VITE_APP_BASE_API

//顶部查询表单实例
const queryRef = ref()

//查询参数
const query = ref({
  pageNum: 1,
  pageSize: 10,
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

onMounted(()=>{
  getList();
})

</script>

<template>
  <div class="app-container">
    <!--顶部搜索-->
    <el-form :model="query" ref="queryRef" label-width="70px" inline>
      <el-form-item label="用户名称" prop="userName">
        <el-input v-model="query.userName" placeholder="请输入用户名称"/>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" @click="handleQuery">搜索</el-button>
        <el-button icon="Refresh" @click="resetQuery">清空</el-button>
            <!--新增按钮-->
            <el-button type="primary" icon="Plus" @click="">新增</el-button>
            <el-button type="success" icon="Edit" @click="">修改</el-button>
            <el-button type="danger" icon="Delete" @click="">批量删除</el-button>

      </el-form-item>
    </el-form>

    <!--新增按钮
    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-button type="primary" plain icon="Plus" @click="">新增</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="success" plain icon="Edit" @click="">修改</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="danger" icon="Delete" @click="">批量删除</el-button>
      </el-col>
    </el-row>

    -->


    <!-- 列表 -->
    <el-table :data="userList" style="width: 100%" border @selection-change="handleSelectionChange">
      <el-table-column type="selection" width="80" align="center"/>
      <el-table-column prop="userId" label="用户编号" width="180" align="center"/>
      <el-table-column prop="userName" label="用户名称" align="center"/>
        <el-table-column prop="sex" label="性别" align="center">
          <template #default="scope">
            <span v-if="scope.row.sex === 0">男</span>
            <span v-else-if="scope.row.sex === 1">女</span>
            <span v-else>未设置</span>
          </template>
        </el-table-column>
      <el-table-column prop="avatar" label="头像" align="center">
        <template #default="scope">
          <el-avatar :size="50" :src="scope.row.avatar? baseUrl + scope.row.avatar : defaultAvatar " />
        </template>
      </el-table-column>
      <el-table-column label="操作" align="center" width="180">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="">修改</el-button>
          <el-button link type="danger" icon="Delete" @click="">删除</el-button>
        </template>
      </el-table-column>
    </el-table>


    <!-- 分页 -->
    <pagination :total="total"
                v-model:page="query.pageNum"
                v-model:limit="query.pageSize"
                @pagination="getList"
    />

  </div>
</template>

<style scoped>

</style>