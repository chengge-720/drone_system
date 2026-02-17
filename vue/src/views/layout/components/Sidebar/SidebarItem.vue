<script setup lang="ts">
import {computed} from "vue";
import AppLink from "@/views/layout/components/Sidebar/AppLink.vue";
import SvgIcon from "@/components/SvgIcon/index.vue";

const props = defineProps({
  //菜单项的数据对象
  item:{
    type:Object,
    required:true,
  },
  //标记是否嵌套使用
  isNext:{
    type:Boolean,
    default:false,
  },
  //基础路径，用于拼接完整的路由路径
  basePath:{
    type:String,
    default:'',
  }
})

//计算当前菜单项的唯一显示子项
const onlyOneChild = computed(()=>{
  //获取当前菜单项的子项类
  const children = props.item.children || []
  //筛选出不需要隐藏的子项
  const showingChildren = children.filter(item => !item.hidden)
  //如果只有一个需要显示的子项
  if(showingChildren.length === 1){
    return showingChildren[0]
  }
  //如果没有需要显示的子项
  if(showingChildren.length === 0){
    return{
      ...props.item,//复制父项的所有属性
      path:'',//路径设置为空
      noShowingChildren:true,//标记当前没有需要显示的子项
    }
  }
  //如果有多个需要显示的子项
  return null
})

//计算当前菜单项是否应该只显示一个子项
const shouldShowSingleItem = computed(()=>{
  //条件1：存在onlyOneChild
  //条件2：当前项没有子项
  //条件3：父项没有设置为折叠菜单
  return onlyOneChild.value && (!onlyOneChild.value.children || onlyOneChild.value.noShowingChildren)
      && !props.item.alwaysShow
 })

//计算单个菜单项点击后应该跳转的完整路径
const singleItemPath = computed(()=>{
  return resolvePath(onlyOneChild.value.path)
})

//解析并拼接路由路径
const resolvePath = (routePath) => {
  //拼接基础路径和相对路径
  const fullPath = props.basePath + '/' + routePath
  //如果路径为空
  if(!fullPath) return fullPath
  //处理特殊情况
  return fullPath.replace('//' , '/')
      .replace(/\/$/, '')
}

</script>

<template>
<!--第一步，检查菜单项是否需要显示-->
  <div v-if="!item.hidden">
    <!-- 当前菜单项只需要显示一个子项 -->
    <template v-if="shouldShowSingleItem">
      <app-link :to="singleItemPath">
        <el-menu-item :index="singleItemPath">
          <svg-icon :icon-class="onlyOneChild.meta.icon || (item.meta && item.meta.icon)"
                    style="margin-right: 10px"/>
            <template #title>
              <span style="margin-left: 2px">
                {{onlyOneChild.meta.title}}
              </span>
            </template>
        </el-menu-item>
      </app-link>
    </template>

    <!-- 当前菜单项需要显示子菜单 -->
    <el-sub-menu v-else :index="resolvePath(item.path)" teleported>
      <template v-if="item.meta" #title>
        <svg-icon :icon-class="item.meta.icon" style="margin-right: 10px"/>
        <span style="margin-left: 2px">
          {{item.meta.title}}
        </span>
      </template>
      <!-- 递归渲染子项 -->
      <sidebar-item v-for="child in item.children"
                    :key="child.path"
                    :item="child"
                    :base-path="resolvePath(child.path)"
                    is-next/>
    </el-sub-menu>
  </div>
</template>

<style scoped>

</style>