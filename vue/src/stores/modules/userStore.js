import { defineStore } from 'pinia'
import {getToken, removeToken, setToken} from "@/utils/auth.js";
import {getInfo, login, logout} from "@/api/login";
import defaultAvatar from "@/assets/images/profile.jpg"

const useUserStore = defineStore(
    'user',//这里的user必须全局唯一
    {
        //状态定义
        state: () => ({
            token: getToken(),//用户登录后的令牌
            id: '',
            name: '',
            avatar: '',//用户头像地址
        }),
        //方法定义
        actions: {
            login(userInfo){
                //异步操作
                return new Promise((resolve,reject) => {
                    //调用登录方法
                    login(userInfo).then(res => {
                        //登录成功
                        //保存令牌，这样刷新页面后，用户信息还在
                        setToken(res.token)
                        //更新Store状态
                        this.token = res.token
                        resolve()

                    }).catch(error => {
                        //登录失败
                        reject(error)
                    })
                })
            },
            //获取用户详细信息
            getInfo() {
                //异步操作
                return new Promise((resolve, reject) => {
                    getInfo().then(res => {
                        //从响应数据中获取用户的信息
                        const user = res.data
                        //处理头像地址
                        let avatar = user.avatar || ""
                        //如果头像地址不是完整路径，添加默认前缀
                        if(avatar.indexOf("http://") === -1 && avatar.indexOf("https://") === -1){
                            //添加默认前缀
                            if(avatar){
                                avatar = import.meta.env.VITE_APP_BASE_API + avatar
                            }else {
                                //如果头像地址为空，使用默认头像
                                avatar = defaultAvatar
                            }
                        }
                        //更新Store状态
                        this.id = user.userId || user.id
                        this.name = user.username || user.userName
                        this.avatar = avatar
                        //返回结果
                        resolve(res)//同时返回完整的响应数据
                    }).catch(error => {
                        //获取用户信息失败
                        reject(error)
                    })
                })
            },
            /**
             * 登出方法
             * @returns {Promise<unknown>}
             */
            logOut() {
                //异步操作
                return new Promise((resolve, reject) => {
                    //调用登出方法
                    logout(this.token).then(res => {
                        //登出成功
                        //清空Store状态
                        this.token = ''
                        this.id = ''
                        this.name = ''
                        this.avatar = ''
                        //删除令牌
                        removeToken()
                        //返回结果
                        resolve(res)
                    }).catch(error => {
                        //登出失败
                        reject(error)
                    })
                })
            }

        }
    }
)

export default useUserStore