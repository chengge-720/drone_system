<script setup lang="ts">
import { computed } from 'vue'
import { resolveMenuIcon } from '@/utils/menuIconMap'

const props = defineProps<{
  name?: string | null
  size?: number
}>()

const IconComponent = computed(() => resolveMenuIcon(props.name))
</script>

<template>
  <component
    :is="IconComponent"
    class="tech-sidebar-icon"
    :size="size ?? 18"
    :stroke-width="1.75"
  />
</template>

<style scoped>
.tech-sidebar-icon {
  flex-shrink: 0;
  color: #c5ddf2;
  transition: color 0.2s ease;
}
</style>
