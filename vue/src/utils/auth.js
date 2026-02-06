/**
 * 获取当前用户的认证令牌
 */
export function getToken(){
    return localStorage.getItem('tokenKey')
}

/**
 * 保存用户认证令牌
 */
export function setToken(token){
    return localStorage.setItem('tokenKey',token)
}

/**
 * 删除用户认证令牌
 */

export function removeToken(){
    return localStorage.removeItem('tokenKey')
}