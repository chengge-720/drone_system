<script setup lang="ts">
import { ref,onMounted } from "vue"

const chartDom = ref(); // dom
/**获取地图信息 */
const getMap = async () => {
  var map = new BMap.Map(chartDom.value)
  var point = new BMap.Point(116.404, 39.915)
  map.centerAndZoom(point, 15)
  map.enableScrollWheelZoom(true)
}

onMounted(()=>{
  getMap();
})
</script>

<template>
  <div>
    <div class="inner-chunk">
      <div class="map-info" ref="chartDom"></div>
    </div>
  </div>
</template>

<style scoped>
.map-info{
  width: 100%; /* 自定义大小 */
  height: 100%; /* 自定义大小 */
}
</style>