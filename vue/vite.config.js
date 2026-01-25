import {defineConfig,loadEnv} from "vite"
import path from 'path'
import createVitePlugins from "./vite/plugins"
export default defineConfig(({ mode , command })=>{
  const env = loadEnv(mode, process.cwd())
  return {
    base: '/',
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
      host: true,
      port: 90,
      open: true,
      proxy: {
        //将所有以 /base 开头的请求，都代理到 target 属性指定的后端服务器，只有这样定义前端才能访问后端服务器
        '/base': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/base/, '')
        }
      }
    },
  }
})
