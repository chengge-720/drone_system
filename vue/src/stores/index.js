//导入Pinia的创建函数
import { createPinia } from 'pinia'

/**
 * 创建全局的pinia状态管理仓库
 * @type {Pinia}
 */
const store = createPinia()

//导出仓库实例
export default store