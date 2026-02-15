<script setup lang="ts">
//这个组件只接受一个参数to，用于跳转指定的路由路径
defineProps({
  //to属性表示目标的连接地址
  to:{
    type:String,
    required:true,
  }
})
</script>

<template>
  <router-link :to="to">
    <!--slot插槽：用于显示包裹在组件标签内的内容-->
    <slot/>
  </router-link>
</template>
