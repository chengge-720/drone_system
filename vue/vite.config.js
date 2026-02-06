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
    server: {
      port: 90,
      host: true,
      open: true,
      proxy: {
        //代理所有请求到后端
        '/base': {///base表示拦截以/base开头的请求
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/base/, '')
        },
      }
    },
  }
})