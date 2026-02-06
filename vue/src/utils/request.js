import axios from "axios";
import {ElMessage , ElMessageBox} from "element-plus";
import {getToken} from "@/utils/auth.js";
import useUserStore from "@/stores/modules/userStore.js";

/**
 * 全局设置
 */
//是否显示重新登陆的弹窗
export let isReLogin = {show:false}

//默认请求格式为JSON
axios.defaults.headers['Content-Type'] = 'application/json;charset=utf-8'

//创建axios实例
const service = axios.create({
    baseURL: import.meta.env.VITE_APP_BASE_API,//服务器地址
    timeout: 20000,//超时时间就认为请求失败
})

//重新登录的函数
const handleReLogin = () => {
    console.log('调用handleReLogin()函数')
    if (isReLogin.show) return
    isReLogin.show = true;

    ElMessageBox.confirm(
        '登录状态已过期，请重新登录1',
        '提示',
        {
        confirmButtonText: '重新登录',
        cancelButtonText: '取消',
        type: 'warning'}
     ).then(() => {//重新登录路径
        isReLogin.show = false
        //清空用户登录信息
        useUserStore().logOut().then(() => {
            //退出后跳转登录页面
            location.href = '/login';
        })
    }).catch(() => {
        //取消路径
        isReLogin.show = false
    })
}

/**
 * 请求拦截器
 */
service.interceptors.request.use(
    config => {
        //检查某些请求是否需要token
        const isToken = config.headers?.isToken !== false
        const isRepeatSubmit = config.headers?.repeatSubmit !== false
        //如果有token且token有值
        if(isToken && getToken()){
            config.headers['Authorization'] = 'Bearer ' + getToken()
        }
        //防止重复提交
        if(!isRepeatSubmit && ['post', 'put'].includes(config.method)){
            const requestObj = {
                url: config.url,
                data: typeof config.data === 'object' ? JSON.stringify(config.data) : config.data,
                time: new Date().getTime(),
            }
            //从浏览器取出上一次的请求记录
            const sessionValue = sessionStorage.getItem('sessionObj')
            const sessionObj = sessionValue ? JSON.parse(sessionValue) : null

            //如果上次有记录
            if (sessionObj){
                const { url: s_url , data: s_data , time: s_time } = sessionObj
                const interval = 1000
                //判断时间间隔
                if (s_data === requestObj.data && s_url === requestObj.url && requestObj.time - s_time < interval){
                    //如果重复提交
                    const message = '请勿重复提交'
                    ElMessage.error(message)
                }
            }
            //保存本次请求记录
            sessionStorage.setItem('sessionObj',JSON.stringify(requestObj))
        }
        //放行请求
        return config;
    },
    error => {
        //请求错误处理
        ElMessage.error(error)
    }
)

/**
 * 响应拦截器,调用接口之后的事情
 */
service.interceptors.response.use(
    res => {
        if(['blob'].includes(res.request.responseType)){
            //直接返回数据
            return res.data
        }
        //响应数据处理
        console.log('完整响应:', res)
        console.log('响应数据:', res.data)
        console.log('响应状态码:', res.status)
        console.log('响应头:', res.headers)
        
        // 确保code是数字类型
        let code = 200
        let msg = '操作失败'
        
        // 检查响应数据结构
        if (res.data && typeof res.data === 'object') {
            code = typeof res.data.code === 'number' ? res.data.code : 200
            msg = res.data.msg || '操作失败'
        }
        
        console.log('解析的状态码:', code)
        console.log('解析的错误信息:', msg)

        //根据不同状态码处理
        if(code === 401){
            ElMessage.error(msg)
            handleReLogin()
            return Promise.reject('登录已过期，请重新登录!2')
        }
        // 只在明确的错误状态码时显示错误提示
        if(code !== 200){
            ElMessage.error(msg)
            return Promise.reject(new Error(msg))
        }
        return res.data
    },
    error => {
        //这里处理网络错误
        let {message , response } = error
        console.log('响应错误:', error)
        console.log('响应状态:', response?.status)
        console.log('错误信息:', message)
        if(response?.status === 401){
            ElMessage.error(message)
            handleReLogin()
            return Promise.reject('登录已过期，请重新登录!3')
        }
        //错误信息翻译
        const errMap = {
            'Network Error': '网络错误',
            'timeout': '请求超时',
            'Request failed with status code 404': '系统接口不存在，404',
            'Request failed with status code 500': '服务器内部错误，500',
        }

        //遍历错误映射表，匹配错误信息
        Object.keys(errMap).forEach(key => {
            if(message.includes(key)){
                message = errMap[key]
            }
        })

        //显示错误提示
        ElMessage.error(message)

        //抛出错误
        return Promise.reject(error)
    }
)

//导出axios实例
export default service