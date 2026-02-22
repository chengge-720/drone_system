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
    form.value = res.data
    open.value = true
    title.value = '修改无人机'
  })
}

//删除按钮
const handleDelete = (row) => {
  const uavIds = row.uavId || ids.value
  ElMessageBox.confirm(
      '是否删除该无人机?',
      '删除',
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
            ElMessage.success('删除成功')
            getList()
          }
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
    <!--顶部搜索-->
    <el-form :model="query" ref="queryRef" label-width="100px" inline>
      <el-form-item label="无人机编号" prop="uavCode">
        <el-input v-model="query.uavCode" placeholder="请输入无人机编号"/>
      </el-form-item>
      <el-form-item label="无人机型号" prop="uavModel">
        <el-input v-model="query.uavModel" placeholder="请输入无人机型号"/>
      </el-form-item>
      <el-form-item label="状态" prop="uavStatus">
        <el-select v-model="query.uavStatus" placeholder="请选择状态" clearable style="width: 100px">
          <el-option label="正常" value="1" />
          <el-option label="任务中" value="2" />
          <el-option label="维修中" value="3" />
          <el-option label="停用" value="4" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" @click="handleQuery">搜索</el-button>
        <el-button icon="Refresh" @click="resetQuery">清空</el-button>
            <!--顶部按钮-->
            <el-button type="primary" icon="Plus" @click="handleInsert">新增</el-button>
            <el-button :disabled="single" type="success" icon="Edit" @click="handleUpdate">修改</el-button>
            <el-button :disabled="multiple" type="danger" icon="Delete" @click="handleDelete">批量删除</el-button>
      </el-form-item>
    </el-form>

    <!-- 列表 -->
    <el-table :data="uavList" style="width: 100%" border @selection-change="handleSelectionChange">
      <el-table-column type="selection" width="5" align="center"/>
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
          <el-tag :type="getStatusType(scope.row.uavStatus)">
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

    <!-- 分页 -->
    <pagination :total="total"
                v-model:page="query.pageNum"
                v-model:limit="query.pageSize"
                @pagination="getList"
    />

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

</style>