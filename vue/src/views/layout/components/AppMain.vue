<script setup>

</script>

<template>
<div style="padding: 16px">

  
  <router-view v-slot="{ Component, route }">
    <el-card style="min-height: calc(100vh - 64px)">
      <div v-if="!Component">
        <p>⚠暂无匹配的组件</p>
        <p>当前路径: {{ route.path }}</p>
        <p>路由名称: {{ route.name }}</p>
        <p>匹配的路由数: {{ route.matched?.length || 0 }}</p>
      </div>
      <component v-else :is="Component" :key="route.path"/>
      <!--
      <component v-if="!route.meta.link" :is="Component" :key="route.path"/>
      -->
    </el-card>
  </router-view>
</div>
</template>

<style scoped>

</style>