import request from '@/utils/request.js'

//查询菜单列表
export function selectMenuList(query) {
  return request({
    url: '/system/menu/selectMenuList',
    method: 'get',
    params: query
  })
}

//新增菜单
export function insertMenu(data) {
  return request({
    url: '/system/menu/insertMenu',
    method: 'post',
    data: data
  })
}

//根据菜单ID查询菜单详情
export function selectMenuByMenuId(menuId) {
  return request({
    url: '/system/menu/selectMenuByMenuId/' + menuId,
    method: 'get',
  })
}