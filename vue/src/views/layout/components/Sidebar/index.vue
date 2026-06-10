<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronsLeft, ChevronsRight } from 'lucide-vue-next'
import SidebarItem from '@/views/layout/components/Sidebar/SidebarItem.vue'
import useRouteStore from '@/stores/modules/routeStore.js'
import useAppStore from '@/stores/modules/appStore.js'

const route = useRoute()
const routeStore = useRouteStore()
const appStore = useAppStore()

const sidebarRouters = computed(() => routeStore.sidebarRouters)
const collapsed = computed(() => appStore.sidebarCollapsed)

const activeMenu = computed(() => {
  const { meta, path } = route
  return meta.activeMenu || path
})

const toggleSidebar = () => {
  appStore.toggleSidebar()
}
</script>

<template>
  <div class="tech-sidebar">
    <el-scrollbar class="tech-sidebar__scroll">
      <el-menu
        :default-active="activeMenu"
        :collapse="collapsed"
        :collapse-transition="false"
        class="tech-sidebar-menu"
        text-color="#d8e8f8"
        active-text-color="#ffffff"
        router
        popper-class="tech-sidebar-popper"
      >
        <sidebar-item
          v-for="(routeItem, index) in sidebarRouters"
          :key="routeItem.path + index"
          :item="routeItem"
          :base-path="routeItem.path"
          :collapsed="collapsed"
        />
      </el-menu>
    </el-scrollbar>

    <div class="tech-sidebar__footer">
      <button
        type="button"
        class="tech-sidebar__collapse-btn"
        :title="collapsed ? '展开菜单' : '收起菜单'"
        @click="toggleSidebar"
      >
        <ChevronsLeft v-if="!collapsed" :size="18" :stroke-width="1.75" />
        <ChevronsRight v-else :size="18" :stroke-width="1.75" />
        <span v-if="!collapsed" class="tech-sidebar__collapse-text">收起菜单</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tech-sidebar {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.tech-sidebar__scroll {
  flex: 1;
  min-height: 0;
}

.tech-sidebar__footer {
  position: relative;
  z-index: 1;
  padding: 8px 10px 12px;
  border-top: 1px solid rgba(64, 158, 255, 0.1);
  background: rgba(19, 30, 46, 0.35);
}

.tech-sidebar__collapse-btn {
  width: 100%;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(64, 158, 255, 0.16);
  border-radius: 10px;
  background: rgba(64, 158, 255, 0.08);
  color: #d8e8f8;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.tech-sidebar__collapse-btn:hover {
  background: rgba(64, 158, 255, 0.14);
  border-color: rgba(64, 158, 255, 0.28);
  box-shadow: none;
}

.tech-sidebar__collapse-btn:active {
  transform: scale(0.98);
}

.tech-sidebar__collapse-text {
  font-size: 13px;
  letter-spacing: 0.5px;
}
</style>
