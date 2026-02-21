<script setup lang="ts">

import {ref} from "vue";

//导入所有SVG图标
const modules = import.meta.glob('@/assets/icons/svg/*.svg')

//读取所有图标名称
const icons = Object.keys(modules).map(path =>
  path.split('assets/icons/svg/')[1].split('.svg')[0]
)

//图标列表
const iconList = ref(icons);

//父组件监听
const emit = defineEmits(['selected'])

const selectedIcon = (name) => {
  emit('selected', name);
  document.body.click();
}
</script>

<template>
<div style="height: 200px">
  <div style="display: flex;flex-wrap: wrap; ">
    <div v-for="(item, index) in iconList"
         class="icon-item-wrapper"
         :key="index"
         @click="selectedIcon(item)"
    >
      <div class="icon-item">
        <svg-icon :icon-class="item" style="height: 25px;width: 16px;"/>
        <span>{{item}}</span>
      </div>
    </div>
  </div>
</div>
</template>

<style scoped>
.icon-item-wrapper{
  width: calc(100% / 3);
  height: 30px;
  line-height: 30px;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.icon-item{
  display:  flex;
  max-width: 100%;
  height: 100%;
  padding: 0 5px;
}

.icon-item:hover{
  background-color: #f5f5f5;
}
</style>