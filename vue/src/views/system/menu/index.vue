<script setup lang="ts">

import {onMounted, ref} from "vue";
import {selectMenuList} from "@/api/system/menu.js"

//菜单列表
const menuList = ref([])

//查询参数
const query = ref({
  menuName: null,
})

//查询数据
const getList = ()=>{
  selectMenuList(query.value).then(res=>{
    menuList.value = buildTree(res.data,0)
    console.log(menuList.value,'菜单列表' )
  })
}

//构建树形结构数据
//之前的数据:[{menuId:1 ,parentId:0},{menuId:2 ,parentId:1}]
//构建后的数据:[{menuId:1 ,parentId:0,children:[{menuId:2 ,parentId:1}]}]
const buildTree = (data, parentId)=>{
  //存放当前层级的所有菜单项
  const result = []
  //遍历菜单项
  for(const item of data){
    //判断当前菜单项的父级ID是否等于父级ID
    if(item.parentId === parentId){
      //递归构建子菜单
      const children = buildTree(data,item.menuId);
      //如果有子菜单
      if(children.length > 0){
        //添加子菜单
        item.children = children
      }
      //添加到结果中
      result.push(item)
    }
  }
  //返回结果
  return result
}

onMounted(()=>{
  getList()
})
</script>

<template>
  <div>
    <h1>菜单管理</h1>
  </div>
</template>

<style scoped>

</style>