<script setup lang="ts">

import {onMounted, ref} from "vue";
import {selectUavList, insertUav, selectUavByUavId, updateUav, deleteUavByUavIds} from "@/api/system/uav.js";

import Pagination from "@/components/Pagination/index.vue";
import {VxeModal} from "vxe-pc-ui";
import {ElMessage, ElMessageBox} from "element-plus";

//表单实例
const uavRef = ref()

//表单title
const title = ref('');

//对话框是否打开
const open = ref(false);

//表单参数
const form = ref({
  uavId: null,
  uavCode: null,
  uavModel: null,
  uavType: null,
  uavMaxFlightTime: null,
  uavMaxLoad: null,
  uavBatteryType: null,
  uavBatteryCapacity: null,
  uavManufacturer: null,
  uavStatus: null,
  remark: null
})

//表单验证规则
const rules = {
  uavCode: [
    {required: true, message: '请输入无人机编号', trigger: 'blur'},
  ],
  uavModel: [
    {required: true, message: '请输入无人机型号', trigger: 'blur'},
  ],
  uavType: [
    {required: true, message: '请输入无人机类型', trigger: 'blur'},
  ],
  uavMaxFlightTime: [
    {required: true, message: '请输入最大续航时长', trigger: 'blur'},
    {type: 'number', message: '请输入有效数字', trigger: 'blur'}
  ],
  uavMaxLoad: [
    {required: true, message: '请输入最大载重', trigger: 'blur'},
    {type: 'number', message: '请输入有效数字', trigger: 'blur'}
  ],
  uavBatteryType: [
    {required: true, message: '请输入电池类型', trigger: 'blur'},
  ],
  uavBatteryCapacity: [
    {required: true, message: '请输入电池容量', trigger: 'blur'},
    {type: 'number', message: '请输入有效数字', trigger: 'blur'}
  ],
  uavManufacturer: [
    {required: true, message: '请输入生产厂商', trigger: 'blur'},
  ],
  uavStatus: [
    {required: true, message: '请选择状态', trigger: 'change'},
  ],
}

//新增按钮
const handleInsert = ()=>{
  form.value = {
    uavId: null,
    uavCode: null,
    uavModel: null,
    uavType: null,
    uavMaxFlightTime: null,
    uavMaxLoad: null,
    uavBatteryType: null,
    uavBatteryCapacity: null,
    uavManufacturer: null,
    uavStatus: null,
    remark: null
  }
  open.value = true
  title.value = '添加无人机'
}

//修改按钮
const handleUpdate = (row) => {
  const uavId = row.uavId || ids.value
  selectUavByUavId(uavId).then(res => {
    console.log('查询详情响应:', res)
    console.log('查询的ID:', uavId)
    form.value = res.data
    open.value = true
    title.value = '修改无人机'
  }).catch(err => {
    console.error('查询详情失败:', err)
  })
}

//删除按钮
const handleDelete = (row) => {
  // 判断是单个删除还是批量删除
  const isBatchDelete = !row.uavId && ids.value.length > 0
  const uavIds = row.uavId ? [row.uavId] : ids.value
  
  const message = isBatchDelete 
    ? `是否删除选中的${ids.value.length}架无人机?`
    : '是否删除该无人机?'
  
  ElMessageBox.confirm(
      message,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
      .then(() => {
        //删除,调用删除api
        deleteUavByUavIds(uavIds).then(res => {
          if(res.code === 200){
            ElMessage.success(isBatchDelete ? `成功删除${ids.value.length}架无人机` : '删除成功')
            // 清空选中状态
            ids.value = []
            single.value = true
            multiple.value = true
            getList()
          }
        }).catch(err => {
          console.error('删除失败:', err)
          ElMessage.error('删除失败，请稍后重试')
        })
      })
}

//保存按钮
const submitForm = () => {
  uavRef.value.validate(valid => {
    if (valid) {
      if(form.value.uavId != null){
        //修改,调用修改api
        updateUav(form.value).then(res => {
          console.log('修改响应:', res)
          console.log('修改发送的数据:', form.value)
          if(res.code === 200){
            ElMessage.success('修改成功')
            open.value = false
            getList()
          }
        })
      }else{
        //新增,调用新增api
        insertUav(form.value).then(res => {
          console.log(res,'看看新增')
          if(res.code === 200){
            ElMessage.success('新增成功')
            open.value = false
            getList()
          }
        })
      }
      }
  })
}

//顶部查询表单实例
const queryRef = ref()

//查询参数
const query = ref({
  pageNum: 1,
  pageSize: 5,
  uavCode: null,
  uavModel: null,
  uavType: null,
  uavStatus: null
})

//无人机列表数据
const uavList = ref([]);

//当前是否未选中单行
const single = ref(true);

//当前是否未选中多行
const multiple = ref(true);

//数据总数
const total = ref(0);

//查询数据
const getList = ()=>{
  selectUavList(query.value).then(res=>{
    uavList.value = res.rows;
    total.value = res.total
  })
}

//多选的ID数组
const ids = ref([]);

//多选触发
const handleSelectionChange = (selection)=>{
  ids.value = selection.map(item => item.uavId)
  single.value = selection.length !== 1
  multiple.value = !selection.length
}

// 获取状态标签文本
const getStatusLabel = (status) => {
  const statusMap = {
    '1': '正常',
    '2': '任务中',
    '3': '维修中',
    '4': '停用'
  }
  return statusMap[status] || status
}

// 获取状态标签类型
const getStatusType = (status) => {
  const typeMap = {
    '1': 'success',
    '2': 'primary',
    '3': 'warning',
    '4': 'danger'
  }
  return typeMap[status] || 'info'
}

//搜索方法
const handleQuery = () => {
  query.value.pageNum = 1
  getList()
}

//清空方法
const resetQuery = () => {
  queryRef.value.resetFields()
  handleQuery()
}

onMounted(()=>{
  getList()
})

</script>

<template>
  <div class="app-container">
    <h1 class="art-text">无人机基础信息</h1>
    
    <!--顶部搜索和按钮-->
    <div class="card fade-in">
      <div class="search-container">
        <el-form :model="query" ref="queryRef" label-width="100px" inline class="search-form">
          <el-form-item label="无人机编号" prop="uavCode">
            <el-input v-model="query.uavCode" placeholder="请输入无人机编号" class="search-input"/>
          </el-form-item>
          <el-form-item label="无人机型号" prop="uavModel">
            <el-input v-model="query.uavModel" placeholder="请输入无人机型号" class="search-input"/>
          </el-form-item>
          <el-form-item label="状态" prop="uavStatus">
            <el-select v-model="query.uavStatus" placeholder="请选择状态" clearable style="width: 100px" class="search-select">
              <el-option label="正常" value="1" />
              <el-option label="任务中" value="2" />
              <el-option label="维修中" value="3" />
              <el-option label="停用" value="4" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" icon="Search" @click="handleQuery" class="search-button">搜索</el-button>
            <el-button icon="Refresh" @click="resetQuery" class="reset-button">清空</el-button>
          </el-form-item>
        </el-form>
        <div class="action-buttons">
          <el-button type="primary" icon="Plus" @click="handleInsert" class="action-button primary">新增</el-button>
          <el-button :disabled="single" type="success" icon="Edit" @click="handleUpdate" class="action-button success">修改</el-button>
          <el-button :disabled="multiple" type="danger" icon="Delete" @click="handleDelete" class="action-button danger">批量删除</el-button>
        </div>
      </div>
    </div>

    <!-- 列表 -->
    <div class="card fade-in" style="margin-top: 20px;">
      <el-table :data="uavList" style="width: 100%" border @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="55" align="center"/>
        <el-table-column prop="uavId" label="无人机ID" width="80" align="center"/>
        <el-table-column prop="uavCode" label="无人机编号" width="120" align="center"/>
        <el-table-column prop="uavModel" label="无人机型号" width="120" align="center"/>
        <el-table-column prop="uavType" label="无人机类型" width="100" align="center"/>
        <el-table-column prop="uavMaxFlightTime" label="最大续航(分钟)" width="120" align="center"/>
        <el-table-column prop="uavMaxLoad" label="最大载重(kg)" width="120" align="center"/>
        <el-table-column prop="uavBatteryType" label="电池类型" width="100" align="center"/>
        <el-table-column prop="uavBatteryCapacity" label="电池容量(mAh)" width="120" align="center"/>
        <el-table-column prop="uavManufacturer" label="生产厂商" width="120" align="center"/>
        <el-table-column prop="uavStatus" label="状态" width="100" align="center">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.uavStatus)" class="status-tag">
              {{ getStatusLabel(scope.row.uavStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" align="center" width="150" fixed="right">
          <template #default="scope">
            <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)">修改</el-button>
            <el-button link type="danger" icon="Delete" @click="handleDelete(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分页 -->
    <div class="fade-in" style="margin-top: 20px;">
      <pagination :total="total"
                  v-model:page="query.pageNum"
                  v-model:limit="query.pageSize"
                  @pagination="getList"
      />
    </div>

    <!-- 添加无人机管理框 -->
    <vxe-modal :title="title" width="600px" v-model="open" showFooter show-maximize resize>
      <el-form ref="uavRef" :model="form" :rules="rules" label-width="120px">
        <el-row>
          <el-col :span="12">
            <el-form-item label="无人机编号" prop="uavCode">
              <el-input v-model="form.uavCode" placeholder="请输入无人机编号" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="无人机型号" prop="uavModel">
              <el-input v-model="form.uavModel" placeholder="请输入无人机型号" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item label="无人机类型" prop="uavType">
              <el-input v-model="form.uavType" placeholder="请输入无人机类型" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="最大续航时长" prop="uavMaxFlightTime">
              <el-input-number v-model="form.uavMaxFlightTime" :min="1" :max="9999" placeholder="分钟" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item label="最大载重" prop="uavMaxLoad">
              <el-input-number v-model="form.uavMaxLoad" :min="0" :step="0.1" placeholder="公斤" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="电池类型" prop="uavBatteryType">
              <el-input v-model="form.uavBatteryType" placeholder="请输入电池类型" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item label="电池容量" prop="uavBatteryCapacity">
              <el-input-number v-model="form.uavBatteryCapacity" :min="0" placeholder="mAh" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="生产厂商" prop="uavManufacturer">
              <el-input v-model="form.uavManufacturer" placeholder="请输入生产厂商" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item label="状态" prop="uavStatus">
              <el-select v-model="form.uavStatus" placeholder="请选择状态" style="width: 100%">
                <el-option label="正常" value="1" />
                <el-option label="任务中" value="2" />
                <el-option label="维修中" value="3" />
                <el-option label="停用" value="4" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div style="text-align: center">
          <el-button type="primary" @click="submitForm">保存</el-button>
          <el-button @click="open = false">取消</el-button>
        </div>
      </template>
    </vxe-modal>

  </div>
</template>

<style scoped>
/* 搜索和按钮容器样式 */
.search-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.search-form {
  flex: 1;
  min-width: 300px;
}

.action-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

/* 搜索输入框样式 */
.search-input {
  width: 200px;
  border-radius: 8px;
  transition: var(--transition);
}

.search-input:focus {
  box-shadow: 0 0 0 2px rgba(77, 79, 200, 0.2);
}

/* 搜索选择框样式 */
.search-select {
  border-radius: 8px;
  transition: var(--transition);
}

.search-select:focus {
  box-shadow: 0 0 0 2px rgba(77, 79, 200, 0.2);
}

/* 搜索按钮样式 */
.search-button {
  border-radius: 8px;
  font-weight: 500;
  transition: var(--transition);
}

.search-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(77, 79, 200, 0.3);
}

/* 重置按钮样式 */
.reset-button {
  border-radius: 8px;
  transition: var(--transition);
}

.reset-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* 操作按钮样式 */
.action-button {
  border-radius: 8px;
  font-weight: 500;
  transition: var(--transition);
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.action-button.primary:hover {
  box-shadow: 0 4px 12px rgba(77, 79, 200, 0.3);
}

.action-button.success:hover {
  box-shadow: 0 4px 12px rgba(102, 187, 106, 0.3);
}

.action-button.danger:hover {
  box-shadow: 0 4px 12px rgba(244, 67, 54, 0.3);
}

/* 状态标签样式 */
.status-tag {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 12px;
  font-weight: 500;
}

/* 动画延迟效果 */
.fade-in {
  animation: fadeIn 0.5s ease-in-out;
}

.fade-in:nth-child(2) {
  animation-delay: 0.1s;
}

.fade-in:nth-child(3) {
  animation-delay: 0.2s;
}

.fade-in:nth-child(4) {
  animation-delay: 0.3s;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .search-container {
    flex-direction: column;
    align-items: stretch;
  }
  
  .search-form {
    width: 100%;
  }
  
  .search-input {
    width: 100%;
  }
  
  .action-buttons {
    justify-content: center;
  }
}
</style>