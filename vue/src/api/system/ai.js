import request from '@/utils/request.js'

/**
 * 发送消息到大模型（后端 OpenAI 兼容接口）
 * @param {string} message - 用户输入的消息
 * @param {Object} options - 可选项：{ action, confirmToken }
 * @returns {Promise} - resolve 为 AjaxResult：data.reply 为正文，data.taskCreated 等见后端约定
 */
export function sendMessageToAI(message, options = {}) {
  const payload = {
    message: message
  }
  if (options.action) payload.action = options.action
  if (options.confirmToken) payload.confirmToken = options.confirmToken
  return request({
    url: '/api/ai/chat',
    method: 'post',
    data: payload
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
