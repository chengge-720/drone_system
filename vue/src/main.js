import { createApp } from 'vue'
import { createPinia } from 'pinia'
import store from './stores'

import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

import App from './App.vue'
import router from './router'
//路由控制
import './permission.js'
//引入图标组件
import SvgIcon from '@/components/SvgIcon/index.vue'
import 'virtual:svg-icons-register'
import '@/assets/styles/all.css'
// 引入表格组件
import VxeUIBase from 'vxe-pc-ui'
import 'vxe-pc-ui/es/style.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.use(store)
app.use(VxeUIBase)

for(const [key, component] of Object.entries(ElementPlusIconsVue)){
    app.component(key, component)
}
app.component('svg-icon', SvgIcon)

app.use(ElementPlus, {
    locale: zhCn,
})

app.mount('#app')
