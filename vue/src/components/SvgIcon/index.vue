<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps({
  iconClass: {
    type: String,
    required: true
  },
  color: {
    type: String,
    default: ''
  }
})
//生产插件要求的完整图标引用ID
const iconName = computed(() => `#icon-${props.iconClass}`)
</script>

<template>
<svg aria-hidden="true" class="svg-icon">
  <use :href="iconName" :fill="color" />
</svg>
</template>

<style scoped>
.svg-icon {
  font-size: 40px;
  width: 1em;
  height: 1em;
  position: relative;
  fill: currentColor;
  vertical-align: 2px;
}
</style>

