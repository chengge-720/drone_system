<script setup lang="ts">
import { computed } from 'vue'
import SidebarIcon from '@/views/layout/components/Sidebar/SidebarIcon.vue'

const props = defineProps({
  item: {
    type: Object,
    required: true
  },
  isNext: {
    type: Boolean,
    default: false
  },
  basePath: {
    type: String,
    default: ''
  },
  collapsed: {
    type: Boolean,
    default: false
  }
})

const onlyOneChild = computed(() => {
  const children = props.item.children || []
  const showingChildren = children.filter((item) => !item.hidden)
  if (showingChildren.length === 1) {
    return showingChildren[0]
  }
  if (showingChildren.length === 0) {
    return {
      ...props.item,
      path: '',
      noShowingChildren: true
    }
  }
  return null
})

const shouldShowSingleItem = computed(() => {
  return (
    onlyOneChild.value &&
    (!onlyOneChild.value.children || onlyOneChild.value.noShowingChildren) &&
    !props.item.alwaysShow
  )
})

const singleItemPath = computed(() => resolvePath(onlyOneChild.value.path))

const resolvePath = (routePath) => {
  const fullPath = props.basePath + '/' + routePath
  if (!fullPath) return fullPath
  return fullPath.replace('//', '/').replace(/\/$/, '')
}

const getIconName = (meta, fallbackMeta) => {
  return (meta && meta.icon) || (fallbackMeta && fallbackMeta.icon) || null
}
</script>

<template>
  <div v-if="!item.hidden">
    <template v-if="shouldShowSingleItem">
      <el-menu-item :index="singleItemPath">
        <SidebarIcon
          :name="getIconName(onlyOneChild.meta, item.meta)"
          class="tech-sidebar-menu__icon"
        />
        <template #title>
          <span class="tech-sidebar-menu__label">
            {{ (onlyOneChild.meta && onlyOneChild.meta.title) || '' }}
          </span>
        </template>
      </el-menu-item>
    </template>

    <el-sub-menu v-else :index="resolvePath(item.path)" :teleported="false">
      <template v-if="item.meta" #title>
        <SidebarIcon :name="getIconName(item.meta)" class="tech-sidebar-menu__icon" />
        <span class="tech-sidebar-menu__label">
          {{ (item.meta && item.meta.title) || '' }}
        </span>
      </template>
      <sidebar-item
        v-for="(child, cIndex) in item.children"
        :key="`${resolvePath(item.path)}-${child.path}-${cIndex}`"
        :item="child"
        :base-path="resolvePath(child.path)"
        :collapsed="collapsed"
        is-next
      />
    </el-sub-menu>
  </div>
</template>

<style scoped>
.tech-sidebar-menu__label {
  margin-left: 2px;
}
</style>
