import request from '@/utils/request.js'

/**
 * 发送消息到豆包 AI
 * @param {string} message - 用户输入的消息
 * @returns {Promise} - 返回 Promise 对象
 */
export function sendMessageToAI(message) {
  return request({
    url: '/api/ai/chat',
    method: 'post',
    data: {
      message: message
    }
  })
}

/**
 * 获取历史聊天记录
 * @returns {Promise} - 返回 Promise 对象
 */
export function getChatHistory() {
  return request({
    url: '/api/ai/history',
    method: 'get'
  })
}

/**
 * 清空聊天记录
 * @returns {Promise} - 返回 Promise 对象
 */
export function clearChatHistory() {
  return request({
    url: '/api/ai/clear',
    method: 'delete'
  })
}
