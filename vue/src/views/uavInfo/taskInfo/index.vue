<script setup lang="ts">
import { ref, onMounted, watch } from "vue"
import { selectTaskList, insertTask, updateTask, deleteTaskByTaskIds, getAvailableUavs } from '@/api/system/task.js'
import { selectUavList } from '@/api/system/uav.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import {VxeModal} from "vxe-pc-ui";
import 'vxe-pc-ui/lib/style.css'

// 任务列表数据
const taskList = ref([])
const total = ref(0)
const query = ref({
  pageNum: 1,
  pageSize: 5,
  taskName: '',
  taskType: ''
})

// 任务表单数据
const taskForm = ref({
  taskId: null,
  taskName: '',
  taskType: '',
  startLocation: '',
  endLocation: '',
  description: '',
  uavId: null,
  status: 1 // 1-待执行，2-执行中，3-已完成，4-已取消
})

// 任务状态选项
const taskStatusOptions = [
  { label: '待执行', value: 1 },
  { label: '执行中', value: 2 },
  { label: '已完成', value: 3 },
  { label: '已取消', value: 4 }
]

// 任务类型选项
const taskTypeOptions = [
  { label: '救援', value: '救援' },
  { label: '运送', value: '运送' },
  { label: '测绘', value: '测绘' },
  { label: '航拍', value: '航拍' },
  { label: '巡检', value: '巡检' },
  { label: '其他', value: '其他' }
]

// 可用无人机列表
const availableUavs = ref([])

// 对话框状态
const taskDialogVisible = ref(false)
const title = ref('发布任务')

// 地图相关
const map = ref(null)
const mapContainer = ref(null)
const startPoint = ref(null)
const endPoint = ref(null)
const pathLine = ref(null)

// 加载任务列表
const getTaskList = async () => {
  try {
    const response = await selectTaskList(query.value)
    taskList.value = response.rows || []
    total.value = response.total || 0
  } catch (error) {
    console.error('获取任务列表失败:', error)
  }
}

// 搜索任务
const searchTask = () => {
  query.value.pageNum = 1
  getTaskList()
}

// 重置搜索
const resetSearch = () => {
  query.value.taskName = ''
  query.value.taskType = ''
  searchTask()
}

// 打开发布任务对话框
const openTaskDialog = () => {
  taskForm.value = {
    taskId: null,
    taskName: '',
    taskType: '',
    startLocation: '',
    endLocation: '',
    description: '无',
    uavId: null
  }
  title.value = '发布任务'
  taskDialogVisible.value = true
  // 初始化地图
  setTimeout(() => {
    initMap()
  }, 100)
}

// 初始化地图
const initMap = () => {
  if (typeof BMap !== 'undefined' && mapContainer.value) {
    map.value = new BMap.Map(mapContainer.value)
    const point = new BMap.Point(115.892151, 28.676493) // 南昌
    map.value.centerAndZoom(point, 13)
    map.value.enableScrollWheelZoom(true)
    map.value.addControl(new BMap.NavigationControl())
    map.value.addControl(new BMap.ScaleControl())
  }
}

// 搜索地点
const searchLocation = (location, callback) => {
  if (map.value) {
    const geocoder = new BMap.Geocoder()
    geocoder.getPoint(location, callback, '南昌市')
  }
}

// 计算路径并获取可用无人机
const calculatePathAndGetUavs = () => {
  if (!taskForm.value.startLocation || !taskForm.value.endLocation) {
    ElMessage.warning('请输入起始地点和终点')
    return
  }

  // 清除之前的标记和路径
  clearMapMarkers()

  // 搜索起点
  searchLocation(taskForm.value.startLocation, (startPointObj) => {
    if (startPointObj) {
      startPoint.value = startPointObj
      const startMarker = new BMap.Marker(startPointObj)
      map.value.addOverlay(startMarker)

      // 搜索终点
      searchLocation(taskForm.value.endLocation, (endPointObj) => {
        if (endPointObj) {
          endPoint.value = endPointObj
          const endMarker = new BMap.Marker(endPointObj)
          map.value.addOverlay(endMarker)

          // 绘制路径
          pathLine.value = new BMap.Polyline([startPointObj, endPointObj], {
            strokeColor: '#4D4FC3',
            strokeWeight: 5,
            strokeOpacity: 0.8
          })
          map.value.addOverlay(pathLine.value)

          // 计算距离
          const distance = map.value.getDistance(startPointObj, endPointObj) / 1000 // 转换为公里

          // 获取可用无人机
          getAvailableUavList(distance)
        } else {
          ElMessage.error('终点地址解析失败')
        }
      })
    } else {
      ElMessage.error('起点地址解析失败')
    }
  })
}

// 获取可用无人机列表
const getAvailableUavList = async (distance) => {
  try {
    const response = await getAvailableUavs({
      taskType: taskForm.value.taskType,
      distance: distance
    })
    availableUavs.value = response.data || []
    if (availableUavs.value.length === 0) {
      ElMessage.info('没有找到符合条件的无人机')
    } else {
      ElMessage.success(`找到 ${availableUavs.value.length} 架符合条件的无人机`)
    }
  } catch (error) {
    console.error('获取可用无人机失败:', error)
    //  fallback: 直接获取所有无人机
    const uavResponse = await selectUavList({ pageNum: 1, pageSize: 100 })
    availableUavs.value = uavResponse.rows || []
  }
}

// 清除地图标记
const clearMapMarkers = () => {
  if (map.value) {
    map.value.clearOverlays()
    startPoint.value = null
    endPoint.value = null
    pathLine.value = null
  }
}

// 提交任务
const submitTask = async () => {
  if (!taskForm.value.taskName || !taskForm.value.taskType || !taskForm.value.startLocation || !taskForm.value.endLocation || !taskForm.value.uavId) {
    ElMessage.warning('请填写完整任务信息')
    return
  }

  try {
    let response
    if (taskForm.value.taskId) {
      // 修改任务
      response = await updateTask(taskForm.value)
    } else {
      // 新增任务
      response = await insertTask(taskForm.value)
    }
    
    if (response.code === 200) {
      ElMessage.success(taskForm.value.taskId ? '任务修改成功' : '任务发布成功')
      taskDialogVisible.value = false
      getTaskList()
    } else {
      ElMessage.error(taskForm.value.taskId ? '任务修改失败' : '任务发布失败')
    }
  } catch (error) {
    console.error('操作任务失败:', error)
    ElMessage.error('操作任务失败')
  }
}

// 编辑任务
const handleUpdate = (row) => {
  // 填充表单数据
  taskForm.value = {
    taskId: row.taskId,
    taskName: row.taskName,
    taskType: row.taskType,
    startLocation: row.startLocation,
    endLocation: row.endLocation,
    description: row.description,
    uavId: row.uavId,
    status: row.status || 1
  }
  title.value = '编辑任务'
  taskDialogVisible.value = true
  // 初始化地图
  setTimeout(() => {
    initMap()
  }, 100)
}

// 删除任务
const handleDelete = (row) => {
  ElMessageBox.confirm(
    '确定要删除该任务吗？',
    '删除确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      const response = await deleteTaskByTaskIds([row.taskId])
      if (response.code === 200) {
        ElMessage.success('任务删除成功')
        getTaskList()
      } else {
        ElMessage.error('任务删除失败')
      }
    } catch (error) {
      console.error('删除任务失败:', error)
      ElMessage.error('任务删除失败')
    }
  }).catch(() => {
    // 取消删除
  })
}

// 组件挂载时加载任务列表
onMounted(() => {
  getTaskList()
})
</script>

<template>
  <div class="app-container">
    <h1 class="art-text">无人机任务信息</h1>
    
    <!-- 搜索和操作按钮 -->
    <div class="card fade-in">
      <div class="search-container">
        <el-form :model="query" class="search-form">
          <!-- :gutter 用于紧凑布局 -->
          <el-row :gutter="20">
            <el-col :span="8">
              <el-form-item label="任务名称">
                <el-input v-model="query.taskName" placeholder="请输入任务名称" />
              </el-form-item>
            </el-col>
            <el-col :span="4">
              <el-form-item label="任务类型">
                <el-select v-model="query.taskType" placeholder="请选择任务类型">
                  <el-option 
                    v-for="option in taskTypeOptions" 
                    :key="option.value" 
                    :label="option.label" 
                    :value="option.value" 
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12" style="display: flex; gap: 10px;">
              <el-button type="primary" @click="searchTask" class="action-button primary">搜索</el-button>
              <el-button @click="resetSearch" class="action-button">重置</el-button>
              <el-button type="primary" icon="Plus" @click="openTaskDialog" class="action-button primary">发布任务</el-button>
            </el-col>
          </el-row>
        </el-form>
      </div>
    </div>
    
    <!-- 任务列表 -->
    <div class="card fade-in" style="margin-top: 20px;">
      <el-table :data="taskList" style="width: 100%" border>
        <el-table-column prop="taskId" label="任务编号" width="120" align="center"/>
        <el-table-column prop="taskName" label="任务名称" align="center"/>
        <el-table-column prop="taskType" label="任务类型" align="center"/>
        <el-table-column prop="startLocation" label="起始地点" align="center"/>
        <el-table-column prop="endLocation" label="终点" align="center"/>
        <el-table-column prop="uavModel" label="使用无人机" align="center"/>
        <el-table-column prop="createTime" label="创建时间" width="180" align="center"/>
        <el-table-column label="操作" align="center" width="150">
          <template #default="scope">
            <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)">编辑</el-button>
            <el-button link type="danger" icon="Delete" @click="handleDelete(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table> 
    </div>
    
    <!-- 分页 -->
    <div class="fade-in" style="margin-top: 20px;">
      <pagination
        v-model:current-page="query.pageNum"
        v-model:page-size="query.pageSize"
        :page-sizes="[5, 10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        @size-change="getTaskList"
        @current-change="getTaskList"
      />
    </div>
    
    <!-- 发布任务对话框 -->
    <vxe-modal
      v-model="taskDialogVisible"
      :title="title"
      width="500px"
      show-footer
      :max-height="450"
    >
      <div class="task-form compact ultra-compact">
        <div class="form-row ultra-tight">
          <div class="form-item">
            <label>任务名称</label>
            <vxe-input v-model="taskForm.taskName" placeholder="请输入任务名称" size="mini" />
          </div>
          <div class="form-item">
            <label>任务类型</label>
            <vxe-select v-model="taskForm.taskType" placeholder="请选择任务类型" size="mini">
              <vxe-option 
                v-for="option in taskTypeOptions" 
                :key="option.value" 
                :label="option.label" 
                :value="option.value" 
              />
            </vxe-select>
          </div>
        </div>
        <div class="form-row ultra-tight">
          <div class="form-item">
            <label>任务状态</label>
            <vxe-select v-model="taskForm.status" placeholder="请选择任务状态" size="mini">
              <vxe-option 
                v-for="option in taskStatusOptions" 
                :key="option.value" 
                :label="option.label" 
                :value="option.value" 
              />
            </vxe-select>
          </div>
        </div>
        <div class="form-row ultra-tight">
          <div class="form-item">
            <label>起始地点</label>
            <vxe-input v-model="taskForm.startLocation" placeholder="请输入起始地点" size="mini" />
          </div>
          <div class="form-item">
            <label>终点</label>
            <vxe-input v-model="taskForm.endLocation" placeholder="请输入终点" size="mini" />
          </div>
        </div>
        <div class="form-row ultra-tight">
          <div class="form-item full-width">
            <label>任务描述</label>
            <vxe-textarea v-model="taskForm.description" placeholder="请输入任务描述" rows="1" size="mini" />
          </div>
        </div>
        <div class="form-row ultra-tight">
          <div class="form-item full-width">
            <label>地图预览</label>
            <div class="map-container ultra-mini" ref="mapContainer"></div>
            <vxe-button type="primary" @click="calculatePathAndGetUavs" style="margin-top: 4px;" size="mini">计算路径并获取可用无人机</vxe-button>
          </div>
        </div>
        <div class="form-row ultra-tight">
          <div class="form-item full-width">
            <label>选择无人机</label>
            <vxe-select v-model="taskForm.uavId" placeholder="推荐选择无人机" size="mini">
              <vxe-option 
                v-for="uav in availableUavs" 
                :key="uav.uavId" 
                :label="uav.uavModel" 
                :value="uav.uavId" 
              />
            </vxe-select>
            <p v-if="availableUavs.length === 0" style="color: #999; margin-top: 2px; font-size: 11px;">请先计算路径以获取可用无人机</p>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer ultra-compact">
          <vxe-button size="mini" @click="taskDialogVisible = false">取消</vxe-button>
          <vxe-button type="primary" size="mini" @click="submitTask">发布任务</vxe-button>
        </div>
      </template>
    </vxe-modal>
  </div>
</template>

<style scoped>
/* 搜索容器 */
.search-container {
  padding: 20px;
}

.search-form {
  width: 100%;
}

/* 任务表单 */
.task-form {
  padding: 20px 0;
}

.task-form.compact {
  padding: 10px 0;
}

.task-form.ultra-compact {
  padding: 8px 0;
}

.form-row {
  display: flex;
  margin-bottom: 20px;
  gap: 20px;
}

.task-form.compact .form-row {
  margin-bottom: 15px;
  gap: 15px;
}

.form-row.tight {
  margin-bottom: 10px;
  gap: 10px;
}

.form-row.ultra-tight {
  margin-bottom: 8px;
  gap: 8px;
}

.form-row.tight .form-item label {
  margin-bottom: 4px;
  font-size: 13px;
}

.form-row.ultra-tight .form-item label {
  margin-bottom: 3px;
  font-size: 12px;
}

.task-form.ultra-compact .form-item label {
  margin-bottom: 3px;
  font-size: 12px;
}

.form-item {
  flex: 1;
}

.form-item.full-width {
  flex: 1 1 100%;
}

.form-item label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #333;
}

.task-form.compact .form-item label {
  margin-bottom: 6px;
  font-size: 14px;
}

/* 地图容器 */
.map-container {
  width: 100%;
  height: 400px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e0e0e0;
}

.map-container.compact {
  height: 250px;
  border-radius: 6px;
}

.map-container.mini {
  height: 200px;
  border-radius: 4px;
}

.map-container.ultra-mini {
  height: 160px;
  border-radius: 4px;
}

/* 操作按钮样式 */
.action-button {
  border-radius: 8px;
  font-weight: 500;
  transition: var(--transition);
}

.action-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.action-button.primary:hover {
  box-shadow: 0 4px 12px rgba(77, 79, 200, 0.3);
}

/* 对话框footer */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-footer.ultra-compact {
  gap: 8px;
  padding-top: 8px;
}

/* 动画效果 */
.fade-in {
  animation: fadeIn 0.5s ease-in-out;
}

.fade-in:nth-child(2) {
  animation-delay: 0.1s;
}

.fade-in:nth-child(3) {
  animation-delay: 0.2s;
}

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

/* 响应式设计 */
@media (max-width: 768px) {
  .form-row {
    flex-direction: column;
  }
  
  .el-row {
    flex-direction: column;
  }
  
  .el-col {
    width: 100% !important;
  }
  
  .map-container {
    height: 300px;
  }
  
  .action-button {
    margin: 5px 0;
  }
}
</style>