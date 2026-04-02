/**
 * 3D 无人机模型模块
 * 使用 Three.js 创建和管理无人机 3D 模型
 */

/**
 * 无人机模型配置
 */
export const UAV_MODEL_CONFIG = {
  color: 0x4D4FC3,      // 主体颜色
  wingSpan: 2,           // 翼展
  bodyLength: 1,         // 机身长度
  propellerSize: 0.3     // 螺旋桨尺寸
}

/**
 * 初始化 Three.js 场景
 * @param {HTMLElement} container - 渲染容器
 * @returns {Object|null} 包含 scene, camera, renderer 的对象
 */
export const initThreeJSScene = (container) => {
  if (!container || typeof THREE === 'undefined') {
    console.error('❌ 无法初始化 Three.js：容器不存在或 THREE 未加载')
    return null
  }
  
  try {
    // 创建场景
    const scene = new THREE.Scene()
    
    // 创建相机
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      10000
    )
    
    // 创建渲染器
    const renderer = new THREE.WebGLRenderer({ 
      alpha: true, 
      antialias: true 
    })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setClearColor(0x000000, 0)
    
    // 添加到 DOM
    container.appendChild(renderer.domElement)
    
    // 添加光源
    addLighting(scene)
    
    console.log('✅ Three.js 场景初始化成功')
    return { scene, camera, renderer }
  } catch (error) {
    console.error('❌ 初始化 Three.js 失败:', error)
    return null
  }
}

/**
 * 添加光源到场景
 * @param {THREE.Scene} scene - Three.js 场景
 */
export const addLighting = (scene) => {
  // 环境光
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambientLight)
  
  // 平行光
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(1, 1, 1)
  scene.add(directionalLight)
}

/**
 * 创建 3D 无人机模型
 * @param {THREE.Scene} scene - Three.js 场景
 * @returns {THREE.Group|null} 无人机模型组
 */
export const createUAVModel = (scene) => {
  if (!scene) {
    console.error('❌ 场景不存在，无法创建无人机模型')
    return null
  }
  
  try {
    // 创建模型组
    const uavGroup = new THREE.Group()
    
    // 机身
    const bodyGeometry = new THREE.BoxGeometry(
      UAV_MODEL_CONFIG.bodyLength,
      0.2,
      0.5
    )
    const bodyMaterial = new THREE.MeshPhongMaterial({ 
      color: UAV_MODEL_CONFIG.color 
    })
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    uavGroup.add(body)
    
    // 机翼
    const wingGeometry = new THREE.BoxGeometry(0.2, 0.1, UAV_MODEL_CONFIG.wingSpan)
    const wingMaterial = new THREE.MeshPhongMaterial({ 
      color: UAV_MODEL_CONFIG.color 
    })
    
    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial)
    leftWing.position.set(-0.6, 0, 0)
    uavGroup.add(leftWing)
    
    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial)
    rightWing.position.set(0.6, 0, 0)
    uavGroup.add(rightWing)
    
    // 螺旋桨
    const propellerGeometry = new THREE.CylinderGeometry(
      UAV_MODEL_CONFIG.propellerSize,
      UAV_MODEL_CONFIG.propellerSize,
      0.05,
      32
    )
    const propellerMaterial = new THREE.MeshPhongMaterial({ 
      color: 0xffffff 
    })
    
    const frontPropeller = new THREE.Mesh(propellerGeometry, propellerMaterial)
    frontPropeller.position.set(0, 0.1, 1)
    frontPropeller.rotation.x = Math.PI / 2
    uavGroup.add(frontPropeller)
    
    const backPropeller = new THREE.Mesh(propellerGeometry, propellerMaterial)
    backPropeller.position.set(0, 0.1, -1)
    backPropeller.rotation.x = Math.PI / 2
    uavGroup.add(backPropeller)
    
    // 添加到场景
    scene.add(uavGroup)
    
    console.log('✅ 3D 无人机模型创建成功')
    return uavGroup
  } catch (error) {
    console.error('❌ 创建 3D 无人机模型失败:', error)
    return null
  }
}

/**
 * 更新无人机模型位置和旋转
 * @param {THREE.Group} uavModel - 无人机模型组
 * @param {Object} currentPixel - 当前屏幕坐标
 * @param {Object} nextPixel - 下一个屏幕坐标
 * @param {Object} containerSize - 容器尺寸 {width, height}
 */
export const updateUAVPosition = (uavModel, currentPixel, nextPixel, containerSize) => {
  if (!uavModel) return
  
  // 计算方向角
  const dx = nextPixel.x - currentPixel.x
  const dy = nextPixel.y - currentPixel.y
  const angle = Math.atan2(dy, dx) + Math.PI / 2
  
  // 更新位置
  uavModel.position.set(
    (currentPixel.x - containerSize.width / 2) / 100,
    -(currentPixel.y - containerSize.height / 2) / 100,
    0
  )
  
  // 更新旋转
  uavModel.rotation.z = angle
}

/**
 * 更新相机视角
 * @param {THREE.Camera} camera - Three.js 相机
 * @param {Object} targetPoint - 目标点
 * @param {Object} pixel - 屏幕坐标
 * @param {Object} containerSize - 容器尺寸
 */
export const updateCameraView = (camera, targetPoint, pixel, containerSize) => {
  if (!camera) return
  
  // 设置相机位置
  camera.position.set(
    (pixel.x - containerSize.width / 2) / 100,
    -(pixel.y - containerSize.height / 2) / 100 - 5,
    10
  )
  
  // 看向目标点
  camera.lookAt(
    (pixel.x - containerSize.width / 2) / 100,
    -(pixel.y - containerSize.height / 2) / 100,
    0
  )
}

/**
 * 渲染 Three.js 场景
 * @param {THREE.WebGLRenderer} renderer - 渲染器
 * @param {THREE.Scene} scene - 场景
 * @param {THREE.Camera} camera - 相机
 */
export const renderThreeScene = (renderer, scene, camera) => {
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

/**
 * 清除 3D 模型
 * @param {THREE.Group} model - 要清除的模型
 * @param {THREE.Scene} scene - 场景
 */
export const clearUAVModel = (model, scene) => {
  if (!model || !scene) return
  
  scene.remove(model)
  
  // 释放几何体和材质内存
  model.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose()
    }
    if (child.material) {
      child.material.dispose()
    }
  })
}

/**
 * 清理 Three.js 资源
 * @param {Object} threeData - Three.js 相关数据 {scene, camera, renderer}
 * @param {HTMLElement} container - 容器元素
 */
export const cleanupThreeJS = (threeData, container) => {
  if (!threeData) return
  
  const { scene, camera, renderer } = threeData
  
  // 清除场景中的所有对象
  if (scene) {
    while(scene.children.length > 0) {
      const object = scene.children[0]
      
      // 释放几何体和材质
      if (object.geometry) {
        object.geometry.dispose()
      }
      if (object.material) {
        object.material.dispose()
      }
      
      scene.remove(object)
    }
  }
  
  // 清理渲染器
  if (renderer && renderer.domElement && container) {
    container.removeChild(renderer.domElement)
    renderer.dispose()
  }
  
  // 清空引用
  if (camera) {
    camera.clear()
  }
  
  console.log('✅ Three.js 资源已清理')
}

/**
 * 默认导出所有方法
 */
export default {
  initThreeJSScene,
  addLighting,
  createUAVModel,
  updateUAVPosition,
  updateCameraView,
  renderThreeScene,
  clearUAVModel,
  cleanupThreeJS,
  UAV_MODEL_CONFIG
}
