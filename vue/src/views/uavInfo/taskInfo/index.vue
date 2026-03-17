<script setup lang="ts">

</script>

<template>
  <div class="app-container">
    <h1 class="art-text">无人机任务信息</h1>
    
    <!-- 空状态提示 -->
    <div class="card fade-in" style="text-align: center; padding: 60px 20px;">
      <div style="font-size: 48px; color: #e0e0e0; margin-bottom: 20px;">
        📋
      </div>
      <h3 style="color: #666; margin-bottom: 10px;">任务信息功能开发中</h3>
      <p style="color: #999;">该功能正在开发中，敬请期待...</p>
    </div>
  </div>
</template>

<style scoped>
/* 动画延迟效果 */
.fade-in {
  animation: fadeIn 0.5s ease-in-out;
}

.fade-in:nth-child(2) {
  animation-delay: 0.1s;
}
</style>