import request from "@/utils/request.js";

//查询无人机列表
export function selectUavList(query){
    return request({
        url:"/uavInfo/baseInfo/selectUavList",
        method:"get",
        params: query
    })
}

//查询无人机详情
export function selectUavByUavId(uavId){
    return request({
        url:"/uavInfo/baseInfo/selectUavByUavId/" + uavId,
        method:"get",
    })
}

//新增无人机
export function insertUav(data){
    return request({
        url:"/uavInfo/baseInfo/insertUav",
        method:"post",
        data: data
    })
}

//修改无人机
export function updateUav(data){
    return request({
        url:"/uavInfo/baseInfo/updateUav",
        method:"put",
        data: data
    })
}

//删除无人机
export function deleteUavByUavIds(uavIds){
    return request({
        url:"/uavInfo/baseInfo/deleteUavByUavIds/" + uavIds,
        method:"delete",
    })
}

//路径规划
export function planPath(data){
    // 历史接口：后端已移除 /uavInfo/pathPlanning/planPath
    // 统一在业务侧改用：
    // - 2D：AMap.Driving
    // - 3D/RL：/api/path/plan
    // - 本地降级：前端网格规划
    return Promise.reject(new Error('路径规划接口已废弃：/uavInfo/pathPlanning/planPath（请改用 AMap.Driving 或 /api/path/plan）'))
}