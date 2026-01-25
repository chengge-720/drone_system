/**
 * 整个前端的插件工厂，统一管理所有的vite插件
 */

//导入vue的vite插件
import vue from '@vitejs/plugin-vue'

export default function createVitePlugins(viteEnv,isBuild =  false){
    //创建插件数组
    const vitePlugins = [vue()]
    //添加自动导入插件
    vitePlugins.push();

    //返回插件数组
    return vitePlugins;
}