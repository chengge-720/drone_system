<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ref, onMounted } from 'vue'

const router = useRouter()
const countdown = ref(5)

// 倒计时功能
onMounted(() => {
  const timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(timer)
      goHome()
    }
  }, 1000)
})

const goHome = () => {
  router.push('/index')
}

const goBack = () => {
  router.go(-1)
}

onMounted(()=>{
})
</script>

<template>
  <div class="not-found-container">
    <div class="content-wrapper">
      <div class="error-graphic">
        <div class="error-code">404</div>
        <div class="error-message">页面未找到</div>
      </div>
      
      <div class="description">
        <p>抱歉，您访问的页面不存在</p>
        <p>可能是网址输入错误或页面已被移除</p>
      </div>
      
      <div class="countdown-info">
        <span>{{ countdown }}秒后自动返回首页</span>
      </div>
      
      <div class="action-buttons">
        <el-button type="primary" @click="goHome">
          <el-icon><House /></el-icon>
          返回首页
        </el-button>
        <el-button @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回上一页
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.not-found-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.content-wrapper {
  text-align: center;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 60px 40px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  max-width: 500px;
  width: 100%;
}

.error-graphic {
  margin-bottom: 30px;
}

.error-code {
  font-size: 80px;
  font-weight: 800;
  color: #667eea;
  margin-bottom: 15px;
  letter-spacing: 5px;
  text-shadow: 3px 3px 6px rgba(102, 126, 234, 0.3);
}

.error-message {
  font-size: 24px;
  font-weight: 600;
  color: #333;
  margin-bottom: 10px;
}

.description {
  margin-bottom: 30px;
  color: #666;
}

.description p {
  margin: 8px 0;
  font-size: 16px;
  line-height: 1.6;
}

.countdown-info {
  margin-bottom: 30px;
  color: #888;
  font-size: 14px;
}

.action-buttons {
  display: flex;
  gap: 15px;
  justify-content: center;
  flex-wrap: wrap;
}

.action-buttons .el-button {
  padding: 12px 24px;
  font-size: 16px;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.action-buttons .el-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .content-wrapper {
    padding: 40px 20px;
    margin: 10px;
  }
  
  .error-code {
    font-size: 60px;
  }
  
  .error-message {
    font-size: 20px;
  }
  
  .action-buttons {
    flex-direction: column;
    align-items: center;
  }
  
  .action-buttons .el-button {
    width: 200px;
  }
}

@media (max-width: 480px) {
  .error-code {
    font-size: 50px;
  }
  
  .content-wrapper {
    padding: 30px 15px;
  }
}
</style>