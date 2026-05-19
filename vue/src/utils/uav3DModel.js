/**
 * AMap + Three.js 叠层：透明 WebGL 覆盖在地图容器上，与 lngLatToContainer 像素坐标对齐
 * 依赖 index.html 引入的全局 THREE
 */

export const UAV_MODEL_CONFIG = {
  color: 0x4d4fc3,
  wingSpan: 2,
  bodyLength: 1,
  propellerSize: 0.3
}

/** 屏幕像素 → Three 世界坐标 的比例；高度单独缩放 */
export const OVERLAY_SCALE = {
  xyDiv: 120,
  altDiv: 36
}

/** 叠层性能：抽稀航线顶点、限制分辨率，减轻每帧 / 每次拖拽后的计算量 */
export const OVERLAY_PERF = {
  maxLineVertices: 96,
  /** 1 = 最快略糊；1.25 折中；2 高清但更卡 */
  pixelRatioCap: 1.25,
  antialias: false
}

/**
 * 抽稀路径点用于 Three 折线（保留起终点与均匀采样）
 * @param {Array} pathPoints
 * @param {number} maxCount
 */
export function decimatePathForLine(pathPoints, maxCount = OVERLAY_PERF.maxLineVertices) {
  if (!pathPoints?.length) return []
  if (pathPoints.length <= maxCount) return pathPoints
  const lastI = pathPoints.length - 1
  const out = []
  let prevIdx = -1
  const denom = Math.max(1, maxCount - 1)
  for (let k = 0; k < maxCount; k++) {
    const idx = Math.min(lastI, Math.round((k / denom) * lastI))
    if (idx !== prevIdx) {
      out.push(pathPoints[idx])
      prevIdx = idx
    }
  }
  const tail = pathPoints[lastI]
  const lo = out[out.length - 1]
  if (!lo || lo.lng !== tail.lng || lo.lat !== tail.lat) out.push(tail)
  return out
}

function getTHREE() {
  return typeof window !== 'undefined' ? window.THREE : null
}

/**
 * @param {HTMLElement} container
 * @param {Object} map AMap.Map（需支持 lngLatToContainer）
 * @param {number} lng
 * @param {number} lat
 * @param {number} altM
 * @returns {THREE.Vector3}
 */
export function lngLatAltToOverlayWorld(container, map, lng, lat, altM = 0) {
  const THREE = getTHREE()
  if (!THREE || !container || !map || typeof map.lngLatToContainer !== 'function') {
    return { x: 0, y: 0, z: 0 }
  }
  
  // AMap：lngLat -> 容器像素（以容器左上角为原点）
  const px = map.lngLatToContainer([lng, lat])
  if (!px) return new THREE.Vector3(0, 0, 0)
  const pxX = typeof px.getX === 'function' ? px.getX() : px.x
  const pxY = typeof px.getY === 'function' ? px.getY() : px.y
  if (!Number.isFinite(pxX) || !Number.isFinite(pxY)) return new THREE.Vector3(0, 0, 0)

  const w = container.clientWidth || 1
  const h = container.clientHeight || 1
  const x = (pxX - w / 2) / OVERLAY_SCALE.xyDiv
  const y = -(pxY - h / 2) / OVERLAY_SCALE.xyDiv
  const z = (altM || 0) / OVERLAY_SCALE.altDiv
  return new THREE.Vector3(x, y, z)
}

/**
 * @param {HTMLElement} container
 * @returns {Object|null}
 */
export const initThreeJSScene = (container) => {
  const THREE = getTHREE()
  if (!container || !THREE) {
    console.error('❌ 无法初始化 Three.js：容器不存在或 THREE 未加载')
    return null
  }

  try {
    const scene = new THREE.Scene()

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.05,
      5000
    )

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: OVERLAY_PERF.antialias,
      premultipliedAlpha: false,
      powerPreference: 'high-performance'
    })
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, OVERLAY_PERF.pixelRatioCap)
    )
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setClearColor(0x000000, 0)

    const canvas = renderer.domElement
    canvas.style.position = 'absolute'
    canvas.style.left = '0'
    canvas.style.top = '0'
    canvas.style.zIndex = '12'
    canvas.style.pointerEvents = 'none'
    container.style.position = container.style.position || 'relative'
    container.appendChild(canvas)

    addLighting(scene)

    console.log('✅ Three.js 叠层初始化成功')
    return { scene, camera, renderer }
  } catch (error) {
    console.error('❌ 初始化 Three.js 失败:', error)
    return null
  }
}

export const addLighting = (scene) => {
  scene.add(new THREE.AmbientLight(0xffffff, 0.55))
  const dir = new THREE.DirectionalLight(0xffffff, 0.85)
  dir.position.set(4, 10, 6)
  scene.add(dir)
}

export const createUAVModel = (scene) => {
  const THREE = getTHREE()
  if (!scene || !THREE) return null

  const uavGroup = new THREE.Group()

  const bodyMat = new THREE.MeshLambertMaterial({ color: UAV_MODEL_CONFIG.color })
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(UAV_MODEL_CONFIG.bodyLength, 0.2, 0.5),
    bodyMat
  )
  uavGroup.add(body)

  const wingGeo = new THREE.BoxGeometry(0.2, 0.1, UAV_MODEL_CONFIG.wingSpan)
  const wingMat = new THREE.MeshLambertMaterial({ color: UAV_MODEL_CONFIG.color })
  const leftWing = new THREE.Mesh(wingGeo, wingMat)
  leftWing.position.set(-0.6, 0, 0)
  uavGroup.add(leftWing)
  const rightWing = new THREE.Mesh(wingGeo, wingMat)
  rightWing.position.set(0.6, 0, 0)
  uavGroup.add(rightWing)

  const propGeo = new THREE.CylinderGeometry(UAV_MODEL_CONFIG.propellerSize, UAV_MODEL_CONFIG.propellerSize, 0.05, 8)
  const propMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee })
  const frontProp = new THREE.Mesh(propGeo, propMat)
  frontProp.position.set(0, 0.12, 0.85)
  frontProp.rotation.x = Math.PI / 2
  uavGroup.add(frontProp)
  const backProp = new THREE.Mesh(propGeo, propMat)
  backProp.position.set(0, 0.12, -0.85)
  backProp.rotation.x = Math.PI / 2
  uavGroup.add(backProp)

  scene.add(uavGroup)
  return uavGroup
}

/**
 * @param {THREE.Line} line
 * @param {Array<{ lng: number, lat: number, alt: number }>} pathPoints
 * @param {Object} map
 * @param {HTMLElement} container
 * @param {{ maxVertices?: number }} [opts]
 */
export function updatePathLineGeometry(line, pathPoints, map, container, opts = {}) {
  const THREE = getTHREE()
  if (!THREE || !line || !line.geometry || !pathPoints?.length) return
  const maxV = opts.maxVertices ?? OVERLAY_PERF.maxLineVertices
  const samples = decimatePathForLine(pathPoints, maxV)
  const n = samples.length
  if (n < 2) return

  let posAttr = line.geometry.getAttribute('position')
  if (posAttr && posAttr.array && posAttr.array.length === n * 3) {
    const arr = posAttr.array
    for (let i = 0; i < n; i++) {
      const p = samples[i]
      const v = lngLatAltToOverlayWorld(container, map, p.lng, p.lat, p.alt ?? 0)
      arr[i * 3] = v.x
      arr[i * 3 + 1] = v.y
      arr[i * 3 + 2] = v.z
    }
    posAttr.needsUpdate = true
  } else {
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const p = samples[i]
      const v = lngLatAltToOverlayWorld(container, map, p.lng, p.lat, p.alt ?? 0)
      arr[i * 3] = v.x
      arr[i * 3 + 1] = v.y
      arr[i * 3 + 2] = v.z
    }
    posAttr = new THREE.BufferAttribute(arr, 3)
    if (THREE.DynamicDrawUsage) posAttr.setUsage(THREE.DynamicDrawUsage)
    line.geometry.setAttribute('position', posAttr)
  }
  line.geometry.setDrawRange(0, n)
  line.geometry.computeBoundingSphere()
}

/**
 * @returns {THREE.Line}
 */
export function createPathLine3D(scene, pathPoints, map, container) {
  const THREE = getTHREE()
  if (!THREE || !scene) return null
  const geom = new THREE.BufferGeometry()
  const mat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.95,
    depthTest: true
  })
  const line = new THREE.Line(geom, mat)
  line.frustumCulled = false
  updatePathLineGeometry(line, pathPoints, map, container)
  scene.add(line)
  return line
}

/**
 * 相机跟随无人机（侧后方俯视）
 */
export function updateCameraFollowUAV(camera, uavWorldPos, headingRad) {
  const THREE = getTHREE()
  if (!THREE || !camera || !uavWorldPos) return
  const dist = 14
  const height = 9
  const side = 7
  const fx = Math.sin(headingRad)
  const fz = Math.cos(headingRad)
  camera.position.set(
    uavWorldPos.x - fx * dist + side * fz * 0.35,
    uavWorldPos.y + height,
    uavWorldPos.z - fz * dist - side * fx * 0.35
  )
  const look = new THREE.Vector3(uavWorldPos.x, uavWorldPos.y + 0.5, uavWorldPos.z)
  camera.lookAt(look)
}

export const updateUAVPosition = (uavModel, currentPixel, nextPixel, containerSize) => {
  if (!uavModel) return
  const dx = nextPixel.x - currentPixel.x
  const dy = nextPixel.y - currentPixel.y
  const angle = Math.atan2(dy, dx) + Math.PI / 2
  uavModel.position.set(
    (currentPixel.x - containerSize.width / 2) / OVERLAY_SCALE.xyDiv,
    -(currentPixel.y - containerSize.height / 2) / OVERLAY_SCALE.xyDiv,
    0
  )
  uavModel.rotation.z = angle
}

/** @deprecated 使用 updateCameraFollowUAV */
export const updateCameraView = (camera, targetPoint, pixel, containerSize) => {
  if (!camera) return
  camera.position.set(
    (pixel.x - containerSize.width / 2) / OVERLAY_SCALE.xyDiv,
    -(pixel.y - containerSize.height / 2) / OVERLAY_SCALE.xyDiv - 5,
    12
  )
  camera.lookAt(
    (pixel.x - containerSize.width / 2) / OVERLAY_SCALE.xyDiv,
    -(pixel.y - containerSize.height / 2) / OVERLAY_SCALE.xyDiv,
    0
  )
}

export const renderThreeScene = (renderer, scene, camera) => {
  if (renderer && scene && camera) renderer.render(scene, camera)
}

export const clearUAVModel = (model, scene) => {
  if (!model || !scene) return
  scene.remove(model)
  model.traverse((child) => {
    if (child.geometry) child.geometry.dispose()
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose())
      else child.material.dispose()
    }
  })
}

export function disposePathLine(line, scene) {
  if (!line) return
  if (scene) scene.remove(line)
  line.geometry?.dispose()
  line.material?.dispose()
}

/**
 * 调整叠层尺寸（地图容器变化时）
 */
export function resizeThreeOverlay(renderer, camera, container) {
  if (!renderer || !camera || !container) return
  const w = container.clientWidth
  const h = container.clientHeight
  if (w < 1 || h < 1) return
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, OVERLAY_PERF.pixelRatioCap)
  )
  renderer.setSize(w, h)
}

export const cleanupThreeJS = (threeData, container) => {
  if (!threeData) return
  const { scene, camera, renderer } = threeData

  if (scene) {
    for (let i = scene.children.length - 1; i >= 0; i--) {
      const object = scene.children[i]
      object.traverse((child) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose())
          else child.material.dispose()
        }
      })
      scene.remove(object)
    }
  }

  if (renderer?.domElement && container?.contains(renderer.domElement)) {
    container.removeChild(renderer.domElement)
  }
  renderer?.dispose()

  if (camera) camera.clear?.()

  console.log('✅ Three.js 资源已清理')
}

export default {
  UAV_MODEL_CONFIG,
  OVERLAY_SCALE,
  OVERLAY_PERF,
  decimatePathForLine,
  lngLatAltToOverlayWorld,
  initThreeJSScene,
  addLighting,
  createUAVModel,
  createPathLine3D,
  updatePathLineGeometry,
  updateCameraFollowUAV,
  updateUAVPosition,
  updateCameraView,
  renderThreeScene,
  clearUAVModel,
  disposePathLine,
  resizeThreeOverlay,
  cleanupThreeJS
}
