/**
 * 整个前端的插件工厂，统一管理所有的vite插件
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
//导入vue的vite插件
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

import createSvgIcon from './svg-icon'

/** 供 vite-plugin-cesium 在 dev 中静态托管 Workers/Assets（避免相对路径在部分环境下找不到） */
const pluginDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(pluginDir, '..', '..')
const cesiumBuildRootPath = path.join(projectRoot, 'node_modules', 'cesium', 'Build')

export default function createVitePlugins(viteEnv,isBuild =  false){
    //创建插件数组
    const vitePlugins = [
      vue(),
      cesium({
        cesiumBuildRootPath
      })
    ]
    //添加自动导入插件
    vitePlugins.push(createSvgIcon())

    //返回插件数组
    return vitePlugins;
}