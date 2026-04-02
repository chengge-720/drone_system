import request from "@/utils/request.js";

//查询任务列表
export function selectTaskList(query){
    return request({
        url:"/uavInfo/taskInfo/selectTaskList",
        method:"get",
        params: query
    })
}

//查询任务详情
export function selectTaskByTaskId(taskId){
    return request({
        url:"/uavInfo/taskInfo/selectTaskByTaskId/" + taskId,
        method:"get",
    })
}

//新增任务
export function insertTask(data){
    return request({
        url:"/uavInfo/taskInfo/insertTask",
        method:"post",
        data: data
    })
}

//修改任务
export function updateTask(data){
    return request({
        url:"/uavInfo/taskInfo/updateTask",
        method:"put",
        data: data
    })
}

//删除任务
export function deleteTaskByTaskIds(taskIds){
    return request({
        url:"/uavInfo/taskInfo/deleteTaskByTaskIds/" + taskIds,
        method:"delete",
    })
}

//获取可用无人机列表（根据任务需求）
export function getAvailableUavs(taskParams){
    return request({
        url:"/uavInfo/taskInfo/getAvailableUavs",
        method:"post",
        data: taskParams
    })
}

//智能推荐无人机（根据任务需求）
export function recommendUavs(data){
    return request({
        url:"/uavInfo/taskInfo/recommendUavs",
        method:"post",
        data: data
    })
}