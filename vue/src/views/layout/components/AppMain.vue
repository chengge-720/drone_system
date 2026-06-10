<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isDashboard = computed(() => route.name === 'Index')
</script>

<template>
  <div class="app-main" :class="{ 'app-main--dashboard': isDashboard }">
    <router-view v-slot="{ Component, route: currentRoute }">
      <template v-if="isDashboard">
        <component :is="Component" :key="currentRoute.path" />
      </template>
      <el-card v-else class="app-main__card">
        <div v-if="!Component">
          <p>暂无匹配的组件</p>
          <p>当前路径: {{ currentRoute.path }}</p>
        </div>
        <component v-else :is="Component" :key="currentRoute.path" />
      </el-card>
    </router-view>
  </div>
</template>

<style scoped>
.app-main {
  min-height: 100%;
}

.app-main--dashboard {
  padding: 0;
}

.app-main__card {
  min-height: calc(100vh - var(--layout-header-height, 50px) - 32px);
  border-radius: 4px;
  border: 1px solid #ebeef5;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  overflow: hidden;
}
</style>
