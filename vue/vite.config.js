import {defineConfig,loadEnv} from "vite"
import path from 'path'
import createVitePlugins from "./vite/plugins"
export default defineConfig(({ mode , command })=>{
  const env = loadEnv(mode, process.cwd())
  return {
    base: '/',
      //加载环境变量，loadEnv()会根据当前的mode加载对应的.env文件
    plugins: createVitePlugins(env,command === 'build'),
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './'),
        '@': path.resolve(__dirname, './src')
      }
    },
    extensions: [
        '.mjs',
        '.js',
        '.ts',
        '.jsx',
        '.tsx',
        '.json',
        '.vue'
    ],
    /** 预构建核心依赖，减少动态路由首次打开大页面时嵌套请求失败（Failed to fetch dynamically imported module） */
    optimizeDeps: {
      include: [
        'vue',
        'vue-router',
        'pinia',
        'element-plus',
        '@element-plus/icons-vue',
        'axios',
        'echarts',
        'vxe-pc-ui',
        'xe-utils',
        'cesium'
      ]
    },
    server: {
      port: 90,
      host: true,
      /** 端口被占用时直接失败，避免静默换端口后仍访问 :90 导致动态导入 /src/*.vue 拉取失败 */
      strictPort: true,
      open: true,
      /** 预热首页等大页面，减轻登录后首次打开时的动态 import 失败 */
      warmup: {
        clientFiles: [
          './src/views/system/index.vue',
          './src/views/layout/index.vue',
          './src/views/uavNavigation/pathPlanning/index.vue',
        ],
      },
      proxy: {
        //代理所有请求到后端
        '/base': {///base表示拦截以/base开头的请求
          target: 'http://localhost:8081',
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/base/, '')
        },
      }
    },
  }
})