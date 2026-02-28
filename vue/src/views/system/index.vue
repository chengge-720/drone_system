<script setup lang="ts">
import { ref, onMounted } from 'vue'

const currentTime = ref('')

onMounted(() => {
  updateTime()
  setInterval(updateTime, 1000)
})

const updateTime = () => {
  const now = new Date()
  currentTime.value = now.toLocaleString('zh-CN')
}
</script>

<template>
  <div class="dashboard-container">
    <div class="welcome-card">
      <h1>无人机路径规划后台管理系统</h1>
      <p>欢迎使用基于强化学习的无人机路径规划系统</p>
      <div class="time-display">
        当前时间: {{ currentTime }}
      </div>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card">
        <h3>📊 系统概览</h3>
        <p>这里是系统的主要数据展示区域</p>
      </div>
      <div class="stat-card">
        <h3>📈 实时监控</h3>
        <p>无人机实时状态监控面板</p>
      </div>
      <div class="stat-card">
        <h3>🗺️ 地图展示</h3>
        <p>无人机飞行路径可视化</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-container {
  padding: 20px;
  min-height: calc(100vh - 60px);
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.welcome-card {
  background: white;
  border-radius: 12px;
  padding: 30px;
  margin-bottom: 30px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.1);
  text-align: center;
}

.welcome-card h1 {
  color: #333;
  margin-bottom: 15px;
  font-size: 28px;
}

.welcome-card p {
  color: #666;
  font-size: 16px;
  margin-bottom: 20px;
}

.time-display {
  background: #f0f8ff;
  padding: 10px 20px;
  border-radius: 20px;
  display: inline-block;
  font-weight: 500;
  color: #4a90e2;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

.stat-card {
  background: white;
  border-radius: 10px;
  padding: 25px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.08);
  transition: transform 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-5px);
}

.stat-card h3 {
  color: #333;
  margin-bottom: 15px;
  font-size: 20px;
}

.stat-card p {
  color: #666;
  line-height: 1.6;
}
</style>