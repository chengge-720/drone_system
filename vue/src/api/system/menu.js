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

//修改菜单
export function updateMenu(data) {
  return request({
    url: '/system/menu/updateMenu',
    method: 'put',
    data: data
  })
}

//删除菜单
export function deleteMenuByMenuId(menuId) {
  return request({
    url: '/system/menu/deleteMenuByMenuId/' + menuId,
    method: 'delete',
  })
}

//根据角色ID查询菜单树
export function selectRoleMenuTree(roleId) {
  return request({
    url: '/system/menu/selectRoleMenuTree/' + roleId,
    method: 'get',
  })
}

