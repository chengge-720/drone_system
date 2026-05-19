<template>
  <div class="ai-chat-container">
    <!-- 聊天头部 -->
    <div class="chat-header">
      <h2>智能助手</h2>
      <p>有任何问题都可以问我哦~</p>
    </div>

    <!-- 聊天记录区域 -->
    <div class="chat-messages" ref="chatMessagesRef">
      <div 
        v-for="(message, index) in messages" 
        :key="index" 
        :class="['message', message.role]"
      >
        <div class="message-avatar">
          <el-icon v-if="message.role === 'user'"><User /></el-icon>
          <el-icon v-else><ChatDotRound /></el-icon>
        </div>
        <div class="message-content">
          <div class="message-text">{{ message.content }}</div>
          <div v-if="message.role === 'ai' && message.confirmAction" class="confirm-actions">
            <el-button
              size="small"
              type="primary"
              :disabled="loading"
              @click="submitDraftConfirm(message.confirmToken, 'confirm')"
            >
              确认创建任务
            </el-button>
            <el-button
              size="small"
              :disabled="loading"
              @click="submitDraftConfirm(message.confirmToken, 'cancel')"
            >
              取消
            </el-button>
          </div>
          <div class="message-time">{{ message.time }}</div>
        </div>
      </div>
      
      <!-- 加载状态 -->
      <div v-if="loading" class="message ai">
        <div class="message-avatar">
          <el-icon><ChatDotRound /></el-icon>
        </div>
        <div class="message-content">
          <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="chat-input-area">
      <el-input
        v-model="inputMessage"
        type="textarea"
        :rows="3"
        placeholder="请输入您的问题..."
        @keydown.enter.exact.prevent="sendMessage"
        resize="none"
      />
      <el-button 
        type="primary" 
        class="send-btn"
        :loading="loading"
        @click="sendMessage"
      >
        发送
        <el-icon style="margin-left: 5px"><Promotion /></el-icon>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, nextTick, onMounted} from 'vue';
import { User, ChatDotRound, Promotion } from '@element-plus/icons-vue';
import { sendMessageToAI } from '@/api/system/ai.js';
type ChatMessage = {
  role: 'user' | 'ai'
  content: string
  time: string
  confirmAction?: boolean
  confirmToken?: string | null
}

const CHAT_STORAGE_KEY = 'ai_chat_messages_v1'
const MAX_STORED_MESSAGES = 200


// 输入框内容
const inputMessage = ref('');

// 加载状态
const loading = ref(false);

// 聊天记录容器引用
const chatMessagesRef = ref(null);

// 获取当前时间
const getCurrentTime = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

// 聊天记录
const messages = ref<ChatMessage[]>([
  {
    role: 'ai',
    content:
      '您好！我是本系统的智能助手，可介绍各菜单功能与使用流程。您也可以用自然语言描述任务，例如「起点：xx 终点：xx」「从xx到xx」或「由xx至xx的货物运送任务」，系统会先做地点校验并生成草稿，确认后再写入「任务信息」列表（创建后需指派无人机）。',
    time: getCurrentTime()
  }
]);

const persistMessages = () => {
  try {
    const safe = (messages.value || []).slice(-MAX_STORED_MESSAGES).map((m) => ({
      role: m.role === 'user' ? 'user' : 'ai',
      content: String(m.content || ''),
      time: String(m.time || ''),
      confirmAction: Boolean(m.confirmAction),
      confirmToken: m.confirmToken ? String(m.confirmToken) : null
    }))
    sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(safe))
  } catch (e) {
    console.warn('保存聊天记录失败:', e)
  }
}

const restoreMessages = () => {
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return
    const restored: ChatMessage[] = parsed
      .filter((x: any) => x && (x.role === 'user' || x.role === 'ai'))
      .map((x: any) => ({
        role: x.role,
        content: String(x.content || ''),
        time: String(x.time || ''),
        confirmAction: Boolean(x.confirmAction),
        confirmToken: x.confirmToken ? String(x.confirmToken) : null
      }))
      .slice(-MAX_STORED_MESSAGES)
    if (restored.length > 0) {
      messages.value = restored
    }
  } catch (e) {
    console.warn('恢复聊天记录失败:', e)
  }
}

// 滚动到底部
const scrollToBottom = async () => {
  await nextTick();
  if (chatMessagesRef.value) {
    chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight;
  }
};

// 发送消息
const sendMessage = async () => {
  const message = inputMessage.value.trim();
  if (!message || loading.value) return;

  // 添加用户消息
  messages.value.push({
    role: 'user',
    content: message,
    time: getCurrentTime()
  });
  persistMessages()

  inputMessage.value = '';
  loading.value = true;
  await scrollToBottom();

  try {
    const response = await sendMessageToAI(message);
    const payload = response.data;
    let content =
      typeof payload === 'string'
        ? payload
        : (payload && typeof payload.reply === 'string' ? payload.reply : null);
    if (!content) {
      content = response.msg || '抱歉，回复失败。';
    }
    if (payload && Array.isArray(payload.missingFields) && payload.missingFields.length > 0) {
      content += `\n\n还需要你补充这些信息：${payload.missingFields.join('、')}。`
    }
    if (payload && Array.isArray(payload.nextActions) && payload.nextActions.length > 0) {
      content += `\n\n接下来你可以这样做：${payload.nextActions.join('；')}。`
    }
    if (payload && payload.taskCreated) {
      const tid = payload.taskId != null ? `任务编号 ${payload.taskId}` : '新任务';
      content += `\n\n（系统已在任务列表自动创建路径规划任务：${tid}，起点「${payload.startLocation || ''}」→ 终点「${payload.endLocation || ''}」，请到「任务信息」指派无人机。）`;
    }
    const confirmRequired = Boolean(payload && payload.confirmRequired);
    messages.value.push({
      role: 'ai',
      content,
      time: getCurrentTime(),
      confirmAction: confirmRequired,
      confirmToken: confirmRequired ? payload.confirmToken : null
    });
    persistMessages()
  } catch (error) {
    console.error('AI 请求失败:', error);
    messages.value.push({
      role: 'ai',
      content: '抱歉，网络开小差了，请稍后再试。',
      time: getCurrentTime()
    });
    persistMessages()
  } finally {
    loading.value = false;
    await scrollToBottom();
  }
};

const submitDraftConfirm = async (confirmToken: string, action: 'confirm' | 'cancel') => {
  if (!confirmToken || loading.value) return
  messages.value = messages.value.map((m) =>
    m.confirmToken === confirmToken ? { ...m, confirmAction: false } : m
  )
  persistMessages()
  loading.value = true
  try {
    const response = await sendMessageToAI('', { action, confirmToken })
    const payload = response.data
    const content =
      (payload && typeof payload.reply === 'string' && payload.reply) ||
      response.msg ||
      (action === 'confirm' ? '任务已确认处理。' : '已取消。')
    messages.value.push({
      role: 'ai',
      content,
      time: getCurrentTime(),
      confirmAction: false,
      confirmToken: null
    })
    persistMessages()
  } catch (error) {
    console.error('确认任务失败:', error)
    messages.value.push({
      role: 'ai',
      content: '确认操作失败，请重试。',
      time: getCurrentTime(),
      confirmAction: false,
      confirmToken: null
    })
    persistMessages()
  } finally {
    loading.value = false
    await scrollToBottom()
  }
}

onMounted(() => {
  // 迁移清理：旧版本使用 localStorage，这里主动删除，避免跨登录残留历史会话。
  try { localStorage.removeItem(CHAT_STORAGE_KEY) } catch {}
  restoreMessages()
  void scrollToBottom()
});
</script>

<style scoped>
.ai-chat-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  background: #f5f7fa;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.chat-header {
  text-align: center;
  padding: 15px 0;
  border-bottom: 1px solid #e4e7ed;
  background: white;
  border-radius: 8px 8px 0 0;
  margin-bottom: 15px;
}

.chat-header h2 {
  margin: 0 0 8px 0;
  color: #303133;
  font-size: 20px;
  font-weight: 600;
}

.chat-header p {
  margin: 0;
  color: #909399;
  font-size: 14px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: white;
  border-radius: 8px;
  margin-bottom: 15px;
}

.message {
  display: flex;
  align-items: flex-start;
  margin-bottom: 20px;
  gap: 12px;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.message.ai .message-avatar {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.message.user .message-avatar {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
}

.message-content {
  max-width: 70%;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.message.user .message-content {
  align-items: flex-end;
}

.message-text {
  padding: 12px 16px;
  border-radius: 12px;
  line-height: 1.6;
  word-wrap: break-word;
  font-size: 14px;
}

.message.ai .message-text {
  background: #f0f2f5;
  color: #303133;
  border-bottom-left-radius: 4px;
}

.message.user .message-text {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-bottom-right-radius: 4px;
}

.message-time {
  font-size: 12px;
  color: #909399;
  padding: 0 4px;
}

.confirm-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  background: #f0f2f5;
  border-radius: 12px;
  border-bottom-left-radius: 4px;
  width: fit-content;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: #909399;
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out;
}

.typing-indicator span:nth-child(1) {
  animation-delay: 0s;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-10px);
  }
}

.chat-input-area {
  position: relative;
  background: white;
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
}

.chat-input-area :deep(.el-textarea__inner) {
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 12px;
  font-size: 14px;
  resize: none;
}

.chat-input-area :deep(.el-textarea__inner):focus {
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

.send-btn {
  position: absolute;
  right: 15px;
  bottom: 15px;
  height: 36px;
  padding: 0 20px;
  border-radius: 6px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  font-weight: 500;
  transition: all 0.3s ease;
}

.send-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.send-btn:active {
  transform: translateY(0);
}
</style>
