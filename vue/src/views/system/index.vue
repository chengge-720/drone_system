<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { selectUserList } from '@/api/system/user.js'
import { selectUavList } from '@/api/system/uav.js'
import { selectAllRole } from '@/api/system/role.js'

const currentTime = ref('')
const userChart = ref(null)
const uavChart = ref(null)
const roleChart = ref(null)
const statusChart = ref(null)

onMounted(() => {
  updateTime()
  const timeInterval = setInterval(updateTime, 1000)
  
  // 初始化图表
  initCharts()
  
  onUnmounted(() => {
    // 清理定时器
    clearInterval(timeInterval)
    // 销毁图表实例
    userChart.value?.dispose()
    uavChart.value?.dispose()
    roleChart.value?.dispose()
    statusChart.value?.dispose()
  })
})

const updateTime = () => {
  const now = new Date()
  currentTime.value = now.toLocaleString('zh-CN')
}

const initCharts = async () => {
  try {
    // 获取用户数据
    const userResponse = await selectUserList({ pageNum: 1, pageSize: 100 })
    const userCount = userResponse.total || 0
    
    // 获取无人机数据
    const uavResponse = await selectUavList({ pageNum: 1, pageSize: 100 })
    const uavCount = uavResponse.total || 0
    
    // 统计无人机状态分布
    const uavStatusData = []
    const statusMap = {
      1: { name: '正常', value: 0 },
      2: { name: '任务中', value: 0 },
      3: { name: '维修中', value: 0 },
      4: { name: '停用', value: 0 }
    }
    
    if (uavResponse.rows && uavResponse.rows.length > 0) {
      uavResponse.rows.forEach(uav => {
        const status = uav.uavStatus || 1
        if (statusMap[status]) {
          statusMap[status].value++
        }
      })
    }
    
    for (const status in statusMap) {
      if (statusMap[status].value > 0) {
        uavStatusData.push({
          name: statusMap[status].name,
          value: statusMap[status].value
        })
      }
    }
    
    // 获取角色数据
    const roleResponse = await selectAllRole()
    const roleList = roleResponse.data || []
    
    // 统计角色分布
    const roleData = []
    if (userResponse.rows && userResponse.rows.length > 0) {
      const roleCountMap = {}
      
      // 初始化角色计数
      roleList.forEach(role => {
        roleCountMap[role.roleId] = 0
      })
      
      // 统计每个角色的用户数
      userResponse.rows.forEach(user => {
        const roleId = user.roleId
        if (roleCountMap[roleId] !== undefined) {
          roleCountMap[roleId]++
        }
      })
      
      // 转换为图表数据格式
      roleList.forEach(role => {
        if (roleCountMap[role.roleId] > 0) {
          roleData.push({
            name: role.roleName,
            value: roleCountMap[role.roleId]
          })
        }
      })
    }
    
    // 用户总数图表
    const userChartDom = document.getElementById('userChart')
    if (userChartDom) {
      userChart.value = echarts.init(userChartDom)
      userChart.value.setOption({
        title: {
          text: '用户总数',
          left: 'center',
          textStyle: {
            fontSize: 16,
            fontWeight: 'normal'
          }
        },
        series: [{
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          min: 0,
          max: Math.max(100, userCount * 1.5),
          splitNumber: 10,
          axisLine: {
            lineStyle: {
              width: 20,
              color: [
                [0.3, '#67e0e3'],
                [0.7, '#37a2da'],
                [1, '#667eea']
              ]
            }
          },
          pointer: {
            icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
            length: '12%',
            width: 20,
            offsetCenter: [0, '-60%'],
            itemStyle: {
              color: 'auto'
            }
          },
          axisTick: {
            length: 12,
            lineStyle: {
              color: 'auto',
              width: 2
            }
          },
          splitLine: {
            length: 20,
            lineStyle: {
              color: 'auto',
              width: 5
            }
          },
          axisLabel: {
            color: '#464646',
            fontSize: 12,
            distance: -60,
            formatter: function (value) {
              if (value === 0 || value === Math.max(100, userCount * 1.5)) {
                return value
              }
              return ''
            }
          },
          detail: {
            fontSize: 30,
            offsetCenter: [0, '-10%'],
            valueAnimation: true,
            formatter: function (value) {
              return Math.round(value)
            },
            color: 'auto'
          },
          data: [{
            value: userCount,
            name: '用户数'
          }]
        }]
      })
    }

    // 无人机总数图表
    const uavChartDom = document.getElementById('uavChart')
    if (uavChartDom) {
      uavChart.value = echarts.init(uavChartDom)
      uavChart.value.setOption({
        title: {
          text: '无人机总数',
          left: 'center',
          textStyle: {
            fontSize: 16,
            fontWeight: 'normal'
          }
        },
        series: [{
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          min: 0,
          max: Math.max(50, uavCount * 1.5),
          splitNumber: 10,
          axisLine: {
            lineStyle: {
              width: 20,
              color: [
                [0.3, '#67e0e3'],
                [0.7, '#37a2da'],
                [1, '#667eea']
              ]
            }
          },
          pointer: {
            icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
            length: '12%',
            width: 20,
            offsetCenter: [0, '-60%'],
            itemStyle: {
              color: 'auto'
            }
          },
          axisTick: {
            length: 12,
            lineStyle: {
              color: 'auto',
              width: 2
            }
          },
          splitLine: {
            length: 20,
            lineStyle: {
              color: 'auto',
              width: 5
            }
          },
          axisLabel: {
            color: '#464646',
            fontSize: 12,
            distance: -60,
            formatter: function (value) {
              if (value === 0 || value === Math.max(50, uavCount * 1.5)) {
                return value
              }
              return ''
            }
          },
          detail: {
            fontSize: 30,
            offsetCenter: [0, '-10%'],
            valueAnimation: true,
            formatter: function (value) {
              return Math.round(value)
            },
            color: 'auto'
          },
          data: [{
            value: uavCount,
            name: '无人机数'
          }]
        }]
      })
    }

    // 角色占比图表
    const roleChartDom = document.getElementById('roleChart')
    if (roleChartDom) {
      roleChart.value = echarts.init(roleChartDom)
      roleChart.value.setOption({
        title: {
          text: '用户角色占比',
          left: 'center',
          textStyle: {
            fontSize: 16,
            fontWeight: 'normal'
          }
        },
        tooltip: {
          trigger: 'item'
        },
        legend: {
          orient: 'vertical',
          left: 'left'
        },
        series: [
          {
            name: '角色',
            type: 'pie',
            radius: '70%',
            data: roleData.length > 0 ? roleData : [{ value: 1, name: '无数据' }],
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            },
            animationType: 'scale',
            animationEasing: 'elasticOut'
          }
        ]
      })
    }

    // 无人机状态分布图表
    const statusChartDom = document.getElementById('statusChart')
    if (statusChartDom) {
      statusChart.value = echarts.init(statusChartDom)
      statusChart.value.setOption({
        title: {
          text: '无人机状态分布',
          left: 'center',
          textStyle: {
            fontSize: 16,
            fontWeight: 'normal'
          }
        },
        tooltip: {
          trigger: 'item'
        },
        legend: {
          orient: 'vertical',
          left: 'left'
        },
        series: [
          {
            name: '状态',
            type: 'pie',
            radius: '70%',
            data: uavStatusData.length > 0 ? uavStatusData : [{ value: 1, name: '无数据' }],
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            },
            animationType: 'scale',
            animationEasing: 'elasticOut'
          }
        ]
      })
    }

    // 响应式调整
    window.addEventListener('resize', () => {
      userChart.value?.resize()
      uavChart.value?.resize()
      roleChart.value?.resize()
      statusChart.value?.resize()
    })
  } catch (error) {
    console.error('获取图表数据失败:', error)
    // 使用默认数据作为 fallback
    initDefaultCharts()
  }
}

// 使用默认数据的 fallback 方法
const initDefaultCharts = () => {
  // 用户总数图表
  const userChartDom = document.getElementById('userChart')
  if (userChartDom) {
    userChart.value = echarts.init(userChartDom)
    userChart.value.setOption({
      title: {
        text: '用户总数',
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'normal'
        }
      },
      series: [{
        type: 'gauge',
        startAngle: 180,
        endAngle: 0,
        min: 0,
        max: 100,
        splitNumber: 10,
        axisLine: {
          lineStyle: {
            width: 20,
            color: [
              [0.3, '#67e0e3'],
              [0.7, '#37a2da'],
              [1, '#667eea']
            ]
          }
        },
        pointer: {
          icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
          length: '12%',
          width: 20,
          offsetCenter: [0, '-60%'],
          itemStyle: {
            color: 'auto'
          }
        },
        axisTick: {
          length: 12,
          lineStyle: {
            color: 'auto',
            width: 2
          }
        },
        splitLine: {
          length: 20,
          lineStyle: {
            color: 'auto',
            width: 5
          }
        },
        axisLabel: {
          color: '#464646',
          fontSize: 12,
          distance: -60,
          formatter: function (value) {
            if (value === 0 || value === 100) {
              return value
            }
            return ''
          }
        },
        detail: {
          fontSize: 30,
          offsetCenter: [0, '-10%'],
          valueAnimation: true,
          formatter: function (value) {
            return Math.round(value)
          },
          color: 'auto'
        },
        data: [{
          value: 0,
          name: '用户数'
        }]
      }]
    })
  }

  // 无人机总数图表
  const uavChartDom = document.getElementById('uavChart')
  if (uavChartDom) {
    uavChart.value = echarts.init(uavChartDom)
    uavChart.value.setOption({
      title: {
        text: '无人机总数',
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'normal'
        }
      },
      series: [{
        type: 'gauge',
        startAngle: 180,
        endAngle: 0,
        min: 0,
        max: 50,
        splitNumber: 10,
        axisLine: {
          lineStyle: {
            width: 20,
            color: [
              [0.3, '#67e0e3'],
              [0.7, '#37a2da'],
              [1, '#667eea']
            ]
          }
        },
        pointer: {
          icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
          length: '12%',
          width: 20,
          offsetCenter: [0, '-60%'],
          itemStyle: {
            color: 'auto'
          }
        },
        axisTick: {
          length: 12,
          lineStyle: {
            color: 'auto',
            width: 2
          }
        },
        splitLine: {
          length: 20,
          lineStyle: {
            color: 'auto',
            width: 5
          }
        },
        axisLabel: {
          color: '#464646',
          fontSize: 12,
          distance: -60,
          formatter: function (value) {
            if (value === 0 || value === 50) {
              return value
            }
            return ''
          }
        },
        detail: {
          fontSize: 30,
          offsetCenter: [0, '-10%'],
          valueAnimation: true,
          formatter: function (value) {
            return Math.round(value)
          },
          color: 'auto'
        },
        data: [{
          value: 0,
          name: '无人机数'
        }]
      }]
    })
  }

  // 角色占比图表
  const roleChartDom = document.getElementById('roleChart')
  if (roleChartDom) {
    roleChart.value = echarts.init(roleChartDom)
    roleChart.value.setOption({
      title: {
        text: '用户角色占比',
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'normal'
        }
      },
      tooltip: {
        trigger: 'item'
      },
      legend: {
        orient: 'vertical',
        left: 'left'
      },
      series: [
        {
          name: '角色',
          type: 'pie',
          radius: '70%',
          data: [{ value: 1, name: '无数据' }],
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          },
          animationType: 'scale',
          animationEasing: 'elasticOut'
        }
      ]
    })
  }

  // 无人机状态分布图表
  const statusChartDom = document.getElementById('statusChart')
  if (statusChartDom) {
    statusChart.value = echarts.init(statusChartDom)
    statusChart.value.setOption({
      title: {
        text: '无人机状态分布',
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'normal'
        }
      },
      tooltip: {
        trigger: 'item'
      },
      legend: {
        orient: 'vertical',
        left: 'left'
      },
      series: [
        {
          name: '状态',
          type: 'pie',
          radius: '70%',
          data: [{ value: 1, name: '无数据' }],
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          },
          animationType: 'scale',
          animationEasing: 'elasticOut'
        }
      ]
    })
  }
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
    
    <!-- 系统概览区域 -->
    <div class="overview-section">
      <h2 class="section-title">系统概览</h2>
      <div class="overview-grid">
        <!-- 用户总数 -->
        <div class="overview-card fade-in">
          <div id="userChart" class="chart-container"></div>
        </div>
        <!-- 无人机总数 -->
        <div class="overview-card fade-in">
          <div id="uavChart" class="chart-container"></div>
        </div>
        <!-- 用户角色占比 -->
        <div class="overview-card fade-in">
          <div id="roleChart" class="chart-container"></div>
        </div>
        <!-- 无人机状态分布 -->
        <div class="overview-card fade-in">
          <div id="statusChart" class="chart-container"></div>
        </div>
      </div>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card fade-in">
        <h3>📊 系统概览</h3>
        <p>这里是系统的主要数据展示区域</p>
      </div>
      <div class="stat-card fade-in">
        <h3>📈 实时监控</h3>
        <p>无人机实时状态监控面板</p>
      </div>
      <div class="stat-card fade-in">
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
  animation: fadeIn 0.5s ease-in-out;
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

/* 系统概览区域 */
.overview-section {
  margin-bottom: 30px;
}

.section-title {
  color: white;
  font-size: 24px;
  margin-bottom: 20px;
  font-weight: 500;
  text-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

.overview-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.overview-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 25px rgba(0,0,0,0.15);
}

.chart-container {
  width: 100%;
  height: 300px;
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
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 25px rgba(0,0,0,0.15);
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

/* 动画效果 */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-in {
  animation: fadeIn 0.5s ease-in-out;
}

/* 动画延迟 */
.fade-in:nth-child(1) {
  animation-delay: 0.1s;
}

.fade-in:nth-child(2) {
  animation-delay: 0.2s;
}

.fade-in:nth-child(3) {
  animation-delay: 0.3s;
}

.fade-in:nth-child(4) {
  animation-delay: 0.4s;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .chart-container {
    height: 250px;
  }
  
  .welcome-card h1 {
    font-size: 24px;
  }
  
  .section-title {
    font-size: 20px;
  }
}
</style>