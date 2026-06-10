<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import useRouteStore from '@/stores/modules/routeStore.js'

const route = useRoute()
const router = useRouter()
const routeStore = useRouteStore()

const lastSegment = computed(() => {
  const parts = route.path.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : ''
})

const findNodeByPath = (nodes: any[], targetPath: string): any => {
  if (!Array.isArray(nodes) || !targetPath) return null
  for (const n of nodes) {
    if (n?.path === targetPath) return n
    const c = n?.children
    if (c?.length) {
      const hit = findNodeByPath(c, targetPath)
      if (hit) return hit
    }
  }
  return null
}

const getFirstLeafPath = (node: any): string | null => {
  if (!node) return null
  const children = node.children
  if (!Array.isArray(children) || children.length === 0) return node.path || null
  // 取第一个子节点，递归直到叶子
  return getFirstLeafPath(children[0])
}

onMounted(() => {
  // ParentView 只在“目录路由”被渲染时触发；如果该目录存在子路由，则默认进入第一个子页面
  // 仅对“任务信息”目录做默认跳转，避免影响其他目录的点击/展开行为
  if (lastSegment.value !== 'taskInfo') return
  const nodes = routeStore.sidebarRouters || []
  const current = findNodeByPath(nodes, lastSegment.value)
  if (!current?.children?.length) return

  const leafPath = getFirstLeafPath(current)
  if (!leafPath) return

  const expected = `${route.path.replace(/\/$/, '')}/${leafPath}`.replace(/\/+/g, '/')
  if (expected !== route.fullPath) {
    router.replace(expected)
  }
})
</script>

<template>
  <router-view />
</template>

