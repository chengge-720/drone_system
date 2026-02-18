<script setup lang="ts">
//当前页码
const currentPage = defineModel('page', { default: 1 });

//每页显示条数
const pageSize = defineModel('limit', { default: 10 });

//定义组件接收的参数
const props = defineProps({
  total: {
    type: Number,
    required: true,
  },
  pageSizes: {
    type: Array,
    default: () => [2,5,10,20]
  },
  layout: {
    type: String,
    default: 'total, prev, pager, next, jumper, sizes'
  }
})

//定义组件事件,当分页发生变化时触发
const emit = defineEmits(['pagination'])

//处理每页显示条数
const handleSizeChange = (val) => {
  //检查特殊情况,如果当前页码*新条数大于总条数,重置为第一页
  if(currentPage.value * val > props.total){
    // 当前页码大于总页数,重置为第一页
    currentPage.value = 1
  }
  //携带两个参数请求分页事件
  emit('pagination', {
    page: currentPage.value,
    limit: val
  })
}

//处理页码变化时的函数
const handleCurrentChange = (val) => {
  emit('pagination', {
    page: val,
    limit: pageSize.value
  })
}

</script>

<template>
<div class="container">
  <!-- 分页 -->
  <el-pagination :layout="layout"
                 :total="total"
                 v-model:current-page="currentPage"
                 v-model:page-size="pageSize"
                 :page-sizes="pageSizes"
                 @size-change="handleSizeChange"
                 @current-change="handleCurrentChange"
  />
</div>
</template>

<style scoped>
.container{
  display: flex;
  justify-content: center;
  padding: 30px 15px;
}
</style>