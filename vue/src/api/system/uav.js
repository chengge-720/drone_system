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