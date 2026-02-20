import request from '@/utils/request.js'

//查询菜单列表
export function selectMenuList(query) {
  return request({
    url: '/system/menu/selectMenuList',
    method: 'get',
    params: query
  })
}