<template>
  <div class="ai-assistant-page">
    <div class="ai-assistant-page__bg" aria-hidden="true" />
    <div class="ai-assistant-page__decor" aria-hidden="true">
      <svg class="ai-assistant-page__lines" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="ai-grad-blue" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#6366f1" stop-opacity="0" />
            <stop offset="45%" stop-color="#3b82f6" />
            <stop offset="100%" stop-color="#22d3ee" stop-opacity="0.35" />
          </linearGradient>
          <linearGradient id="ai-grad-violet" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.2" />
            <stop offset="50%" stop-color="#8b5cf6" />
            <stop offset="100%" stop-color="#6366f1" stop-opacity="0.15" />
          </linearGradient>
          <linearGradient id="ai-grad-cyan" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.25" />
            <stop offset="55%" stop-color="#06b6d4" />
            <stop offset="100%" stop-color="#34d399" stop-opacity="0.4" />
          </linearGradient>
          <linearGradient id="ai-grad-amber" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.25" />
            <stop offset="60%" stop-color="#f59e0b" />
            <stop offset="100%" stop-color="#fb923c" stop-opacity="0.2" />
          </linearGradient>
          <linearGradient id="ai-grad-teal" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#34d399" stop-opacity="0.2" />
            <stop offset="100%" stop-color="#14b8a6" />
          </linearGradient>
        </defs>
        <path class="ai-assistant-line ai-assistant-line--1" d="M-30 160 Q 320 60, 580 220 T 1100 80" />
        <path class="ai-assistant-line ai-assistant-line--2" d="M140 880 Q 380 640, 620 760 T 1180 520" />
        <path class="ai-assistant-line ai-assistant-line--3" d="M1050 -10 L 1280 260 L 1460 140" />
        <path class="ai-assistant-line ai-assistant-line--4" d="M-80 480 C 160 380, 340 660, 580 540 S 940 420, 1220 580" />
        <path class="ai-assistant-line ai-assistant-line--5" d="M760 920 L 920 700 L 1080 840 L 1320 620" />
        <path class="ai-assistant-line ai-assistant-line--6" d="M420 40 L 520 180 L 680 120 L 820 240" />
        <circle class="ai-assistant-dot ai-assistant-dot--1" cx="220" cy="120" r="4" />
        <circle class="ai-assistant-dot ai-assistant-dot--2" cx="880" cy="300" r="3" />
        <circle class="ai-assistant-dot ai-assistant-dot--3" cx="1180" cy="640" r="5" />
        <circle class="ai-assistant-dot ai-assistant-dot--4" cx="540" cy="780" r="3.5" />
      </svg>
    </div>

    <header class="ai-assistant-nav">
      <div class="ai-assistant-nav__brand">
        <div class="ai-assistant-nav__icon">
          <el-icon><ChatDotRound /></el-icon>
        </div>
        <div class="ai-assistant-nav__text">
          <h2>路径规划智能助手</h2>
          <p>介绍菜单功能、解答使用问题，也可用自然语言创建任务草稿</p>
        </div>
      </div>
      <div class="ai-assistant-nav__chips">
        <span class="ai-assistant-chip">菜单说明</span>
        <span class="ai-assistant-chip">任务草稿</span>
        <span class="ai-assistant-chip">路径规划</span>
      </div>
    </header>

    <div class="ai-assistant-shell">
      <div class="ai-assistant-chat" ref="chatMessagesRef">
        <div
          v-for="(message, index) in messages"
          :key="index"
          :class="['ai-assistant-message', message.role]"
        >
          <div class="ai-assistant-message__avatar">
            <el-icon v-if="message.role === 'user'"><User /></el-icon>
            <el-icon v-else><ChatDotRound /></el-icon>
          </div>
          <div class="ai-assistant-message__body">
            <div class="ai-assistant-message__text">{{ message.content }}</div>
            <div v-if="message.role === 'ai' && message.confirmAction" class="ai-assistant-confirm">
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
            <div class="ai-assistant-message__time">{{ message.time }}</div>
          </div>
        </div>

        <div v-if="loading" class="ai-assistant-message ai">
          <div class="ai-assistant-message__avatar">
            <el-icon><ChatDotRound /></el-icon>
          </div>
          <div class="ai-assistant-message__body">
            <div class="ai-assistant-typing">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </div>

      <div class="ai-assistant-input">
        <el-input
          v-model="inputMessage"
          type="textarea"
          :rows="3"
          placeholder="请输入您的问题，例如：从秋水广场到地铁大厦的货物运送任务…"
          @keydown.enter.exact.prevent="sendMessage"
          resize="none"
        />
        <el-button
          type="primary"
          class="ai-assistant-send"
          :loading="loading"
          @click="sendMessage"
        >
          发送
          <el-icon style="margin-left: 5px"><Promotion /></el-icon>
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'
import { User, ChatDotRound, Promotion } from '@element-plus/icons-vue'
import { sendMessageToAI } from '@/api/system/ai.js'

type ChatMessage = {
  role: 'user' | 'ai'
  content: string
  time: string
  confirmAction?: boolean
  confirmToken?: string | null
}

const CHAT_STORAGE_KEY = 'ai_chat_messages_v1'
const MAX_STORED_MESSAGES = 200

const inputMessage = ref('')
const loading = ref(false)
const chatMessagesRef = ref<HTMLElement | null>(null)

const getCurrentTime = () => {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

const messages = ref<ChatMessage[]>([
  {
    role: 'ai',
    content:
      '您好！我是本系统的智能助手，可介绍各菜单功能与使用流程。您也可以用自然语言描述任务，例如「起点：xx 终点：xx」「从xx到xx的货物运送任务」，系统会先做地点校验并生成草稿，确认后再写入「任务信息」列表（创建后需指派无人机）。',
    time: getCurrentTime()
  }
])

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

const scrollToBottom = async () => {
  await nextTick()
  if (chatMessagesRef.value) {
    chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight
  }
}

const sendMessage = async () => {
  const message = inputMessage.value.trim()
  if (!message || loading.value) return

  messages.value.push({
    role: 'user',
    content: message,
    time: getCurrentTime()
  })
  persistMessages()

  inputMessage.value = ''
  loading.value = true
  await scrollToBottom()

  try {
    const response = await sendMessageToAI(message)
    const payload = response.data
    let content =
      typeof payload === 'string'
        ? payload
        : payload && typeof payload.reply === 'string'
          ? payload.reply
          : null
    if (!content) {
      content = response.msg || '抱歉，回复失败。'
    }
    if (payload && Array.isArray(payload.missingFields) && payload.missingFields.length > 0) {
      content += `\n\n还需要你补充这些信息：${payload.missingFields.join('、')}。`
    }
    if (payload && Array.isArray(payload.nextActions) && payload.nextActions.length > 0) {
      content += `\n\n接下来你可以这样做：${payload.nextActions.join('；')}。`
    }
    if (payload && payload.taskCreated) {
      const tid = payload.taskId != null ? `任务编号 ${payload.taskId}` : '新任务'
      content += `\n\n（系统已在任务列表自动创建路径规划任务：${tid}，起点「${payload.startLocation || ''}」→ 终点「${payload.endLocation || ''}」，请到「任务信息」指派无人机。）`
    }
    const confirmRequired = Boolean(payload && payload.confirmRequired)
    messages.value.push({
      role: 'ai',
      content,
      time: getCurrentTime(),
      confirmAction: confirmRequired,
      confirmToken: confirmRequired ? payload.confirmToken : null
    })
    persistMessages()
  } catch (error) {
    console.error('AI 请求失败:', error)
    messages.value.push({
      role: 'ai',
      content: '抱歉，网络开小差了，请稍后再试。',
      time: getCurrentTime()
    })
    persistMessages()
  } finally {
    loading.value = false
    await scrollToBottom()
  }
}

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
  try {
    localStorage.removeItem(CHAT_STORAGE_KEY)
  } catch {}
  restoreMessages()
  void scrollToBottom()
})
</script>

<style src="@/assets/styles/ai-assistant.css"></style>
