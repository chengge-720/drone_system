/**
 * 整个前端的插件工厂，统一管理所有的vite插件
 */

//导入vue的vite插件
import vue from '@vitejs/plugin-vue'

import createSvgIcon from './svg-icon'

export default function createVitePlugins(viteEnv,isBuild =  false){
    //创建插件数组
    const vitePlugins = [vue()]
    //添加自动导入插件
    vitePlugins.push(createSvgIcon())

    //返回插件数组
    return vitePlugins;
}