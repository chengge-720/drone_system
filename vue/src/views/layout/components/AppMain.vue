<script setup>

</script>

<template>
<div class="app-main">

  
  <router-view v-slot="{ Component, route }">
    <el-card class="app-main__card">
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
.app-main{
  padding: 16px 18px 22px;
}

.app-main__card{
  min-height: calc(100vh - var(--layout-header-height, 60px) - 28px);
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}
</style>