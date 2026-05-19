<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { ElMessage } from "element-plus"

const chartDom = ref<HTMLElement | null>(null)
const mapRef = ref<any>(null)
const pathPolyline = ref<any>(null)
const startMarker = ref<any>(null)
const endMarker = ref<any>(null)

const hasRoute = computed(() => {
  try {
    const raw = localStorage.getItem("uav_route_data")
    if (!raw) return false
    const data = JSON.parse(raw)
    return Array.isArray(data?.waypoints) && data.waypoints.length >= 2
  } catch {
    return false
  }
})

const clearOverlays = () => {
  try { pathPolyline.value?.setMap?.(null) } catch {}
  try { startMarker.value?.setMap?.(null) } catch {}
  try { endMarker.value?.setMap?.(null) } catch {}
  pathPolyline.value = null
  startMarker.value = null
  endMarker.value = null
}

const drawRouteFromStorage = () => {
  if (!mapRef.value) return
  clearOverlays()

  let data: any = null
  try {
    const raw = localStorage.getItem("uav_route_data")
    data = raw ? JSON.parse(raw) : null
  } catch {}

  const wps = Array.isArray(data?.waypoints) ? data.waypoints : []
  const coords = wps
    .map((p: any) => [Number(p?.lng), Number(p?.lat)] as [number, number])
    .filter((c: any) => Number.isFinite(c[0]) && Number.isFinite(c[1]))

  if (coords.length < 2) {
    ElMessage.info("暂无可展示的航线，请先到“路径规划”生成路线")
    return
  }

  pathPolyline.value = new (window as any).AMap.Polyline({
    path: coords,
    strokeColor: "#22C55E",
    strokeWeight: 6,
    strokeOpacity: 0.95,
    lineJoin: "round",
    lineCap: "round",
    zIndex: 20,
    map: mapRef.value
  })

  startMarker.value = new (window as any).AMap.Marker({
    position: coords[0],
    map: mapRef.value,
    anchor: "bottom-center"
  })
  endMarker.value = new (window as any).AMap.Marker({
    position: coords[coords.length - 1],
    map: mapRef.value,
    anchor: "bottom-center"
  })

  try {
    mapRef.value.setFitView?.([pathPolyline.value, startMarker.value, endMarker.value], true, [80, 60, 40, 40])
  } catch {
    try { mapRef.value.setFitView?.() } catch {}
  }
}

const initMap = () => {
  if (!chartDom.value) return
  if (typeof (window as any).AMap === "undefined") {
    ElMessage.error("AMap 未加载")
    return
  }

  const AMapAny: any = (window as any).AMap
  const satellite = new AMapAny.TileLayer.Satellite()
  const roadNet = new AMapAny.TileLayer.RoadNet()

  mapRef.value = new AMapAny.Map(chartDom.value, {
    viewMode: "2D",
    resizeEnable: true,
    zoom: 13,
    center: [115.892151, 28.676493], // 南昌
    layers: [satellite, roadNet]
  })

  drawRouteFromStorage()
}

onMounted(()=>{
  initMap()
})

onBeforeUnmount(() => {
  clearOverlays()
  try { mapRef.value?.destroy?.() } catch {}
  mapRef.value = null
})
</script>

<template>
  <div class="map-show-page">
    <div class="map-show-toolbar">
      <div class="map-show-title">实景卫星图</div>
      <div class="map-show-actions">
        <el-button size="small" @click="drawRouteFromStorage" :disabled="!hasRoute">从规划结果加载航线</el-button>
        <el-button size="small" @click="clearOverlays">清除航线</el-button>
      </div>
    </div>
    <div class="map-show-container" ref="chartDom"></div>
  </div>
</template>

<style scoped>
.map-show-page {
  width: 100%;
  height: calc(100vh - 120px);
  min-height: 560px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.map-show-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(15, 23, 42, 0.10);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.10);
}

.map-show-title {
  font-size: 14px;
  font-weight: 700;
  color: rgba(15, 23, 42, 0.9);
}

.map-show-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.map-show-container{
  width: 100%;
  flex: 1;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.10);
  box-shadow: 0 18px 60px rgba(15, 23, 42, 0.14);
}
</style>