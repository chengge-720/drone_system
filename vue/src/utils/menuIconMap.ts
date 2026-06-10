import type { Component } from 'vue'
import {
  Bot,
  ClipboardList,
  Compass,
  Cpu,
  Database,
  GitCompare,
  Home,
  Layers,
  LayoutDashboard,
  Map,
  MapPinned,
  Menu,
  MessageSquare,
  Plane,
  Radar,
  Route,
  Settings,
  Shield,
  Users
} from 'lucide-vue-next'

const iconMap: Record<string, Component> = {
  首页: LayoutDashboard,
  系统管理: Settings,
  用户管理: Users,
  角色管理: Shield,
  菜单管理: Menu,
  无人机管理: Plane,
  基础信息管理: Database,
  飞行信息管理: Radar,
  任务信息管理: ClipboardList,
  导航管理: Compass,
  地图展示: Map,
  路径信息: Route,
  路径规划: MapPinned,
  任务规划: MapPinned,
  AI助手: Bot,
  'chat-dot-round': MessageSquare,
  'chat-line-square': MessageSquare,
  algorithmCompare: GitCompare,
  算法对比: GitCompare,
  index: Home,
  system: Settings,
  uav: Plane,
  cpu: Cpu
}

export function resolveMenuIcon(name?: string | null): Component {
  if (!name) return Layers
  const trimmed = String(name).trim()
  if (iconMap[trimmed]) return iconMap[trimmed]
  const lower = trimmed.toLowerCase()
  const lowerHit = Object.entries(iconMap).find(([key]) => key.toLowerCase() === lower)
  if (lowerHit) return lowerHit[1]
  const partialHit = Object.entries(iconMap).find(([key]) =>
    trimmed.includes(key) || key.includes(trimmed)
  )
  return partialHit ? partialHit[1] : Layers
}
