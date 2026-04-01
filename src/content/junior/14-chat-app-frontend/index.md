---
title: "AI 聊天应用全栈实战（下）：前端 UI + 流式渲染"
description: "构建生产级 AI 聊天 UI：流式渲染、Markdown 高亮、自动滚动"
order: 14
cover: "./cover.png"
publishDate: "2025-08-29"
tags: ["Vue", "前端", "AI", "流式渲染", "Docker"]
---

# AI 聊天应用全栈实战（下）：前端 UI + 流式渲染

> 本文是【前端转 AI 全栈实战】系列第 14 篇。
> 上一篇：[AI 聊天应用全栈实战（上）：FastAPI 后端 + 对话管理](/series/junior/13-chat-app-backend) | 下一篇：[RAG 入门：让 AI 基于你的文档回答问题](/series/junior/15-rag-intro)

---

## 这篇文章你会得到什么

后端搞定了，今天做前端。

目标是一个**生产级的 AI 聊天 UI**——不是那种只有一个输入框的 Demo，而是接近 ChatGPT 体验的完整界面：

- **会话管理**：左侧会话列表，新建/切换/删除
- **流式渲染**：打字机效果 + Typewriter Buffer 平滑输出
- **Markdown 渲染**：AI 回复支持代码高亮、表格、列表
- **交互细节**：自动滚动、中断生成、消息复制、快捷键
- **响应式布局**：桌面端侧边栏 + 移动端抽屉

技术栈用 Vue 3（你用 React 也一样，核心逻辑通用）。

---

## 项目结构

```
frontend/
├── src/
│   ├── App.vue
│   ├── components/
│   │   ├── ChatSidebar.vue    # 左侧会话列表
│   │   ├── ChatWindow.vue     # 聊天主区域
│   │   ├── MessageList.vue    # 消息列表
│   │   ├── MessageItem.vue    # 单条消息
│   │   ├── ChatInput.vue      # 输入框
│   │   └── MarkdownRenderer.vue  # Markdown 渲染
│   ├── composables/
│   │   ├── useChat.ts         # 聊天核心逻辑
│   │   └── useTypewriter.ts   # Typewriter Buffer
│   ├── api/
│   │   └── chat.ts            # API 调用
│   └── types/
│       └── chat.ts            # 类型定义
├── package.json
└── vite.config.ts
```

---

## 类型定义

```typescript
// types/chat.ts
export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  streaming?: boolean
}

export interface Session {
  session_id: string
  title: string
  message_count: number
  updated_at: number
}
```

---

## API 调用层

```typescript
// api/chat.ts
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function sendMessage(
  message: string,
  sessionId?: string,
  onChunk?: (content: string) => void,
  onDone?: (fullContent: string, sessionId: string) => void,
  onError?: (error: string) => void,
  signal?: AbortSignal,
) {
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      session_id: sessionId,
      stream: true,
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const jsonStr = line.slice(6).trim()
      if (!jsonStr) continue

      try {
        const data = JSON.parse(jsonStr)

        if (data.type === 'content') {
          onChunk?.(data.content)
        } else if (data.type === 'done') {
          onDone?.(data.content, data.session_id || sessionId || '')
        } else if (data.type === 'session') {
          // 新会话的 session_id
          sessionId = data.session_id
        } else if (data.type === 'error') {
          onError?.(data.message)
        }
      } catch {}
    }
  }
}

export async function fetchSessions(): Promise<Session[]> {
  const res = await fetch(`${BASE_URL}/api/sessions`)
  return res.json()
}

export async function fetchSessionMessages(sessionId: string) {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/messages`)
  return res.json()
}

export async function deleteSession(sessionId: string) {
  await fetch(`${BASE_URL}/api/sessions/${sessionId}`, { method: 'DELETE' })
}
```

### 关键设计

- **`onChunk` 回调**：每收到一个文本片段就触发，驱动流式渲染
- **`AbortSignal`**：支持用户中断生成
- **SSE 手动解析**：用 `fetch` + `ReadableStream` 而不是 `EventSource`，因为需要 POST 方法

---

## Typewriter Buffer：平滑流式输出

直接把每个 chunk 追加到界面上会导致视觉抖动。用[第 5 篇](/series/junior/05-streaming)讲的 Typewriter Buffer 模式：

```typescript
// composables/useTypewriter.ts
import { ref, onUnmounted } from 'vue'

export function useTypewriter(tickMs = 24, charsPerTick = 2) {
  const displayText = ref('')
  const isTyping = ref(false)

  let buffer = ''
  let streamEnded = false
  let timer: number | null = null

  function startTyping() {
    if (timer) return
    isTyping.value = true

    timer = window.setInterval(() => {
      if (buffer.length === 0) {
        if (streamEnded) {
          stopTyping()
        }
        return
      }

      const take = Math.min(charsPerTick, buffer.length)
      displayText.value += buffer.slice(0, take)
      buffer = buffer.slice(take)
    }, tickMs)
  }

  function appendToBuffer(text: string) {
    buffer += text
    if (!timer) startTyping()
  }

  function endStream() {
    streamEnded = true
  }

  function stopTyping() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    // 把缓冲区剩余内容全部输出
    if (buffer.length > 0) {
      displayText.value += buffer
      buffer = ''
    }
    isTyping.value = false
    streamEnded = false
  }

  function reset() {
    stopTyping()
    displayText.value = ''
    buffer = ''
    streamEnded = false
  }

  onUnmounted(stopTyping)

  return {
    displayText,
    isTyping,
    appendToBuffer,
    endStream,
    stopTyping,
    reset,
  }
}
```

使用方式：

```typescript
const { displayText, appendToBuffer, endStream, reset } = useTypewriter()

// 收到 chunk 时
onChunk(content) {
  appendToBuffer(content)
}

// 流结束时
onDone() {
  endStream()
}
```

每 24ms 从缓冲区取 2 个字符输出——约 42fps，视觉上流畅自然。

---

## 核心聊天逻辑

```typescript
// composables/useChat.ts
import { ref, computed } from 'vue'
import { sendMessage, fetchSessions, fetchSessionMessages, deleteSession } from '../api/chat'
import type { Message, Session } from '../types/chat'

export function useChat() {
  const messages = ref<Message[]>([])
  const sessions = ref<Session[]>([])
  const currentSessionId = ref<string | null>(null)
  const streaming = ref(false)
  let abortController: AbortController | null = null

  async function send(userInput: string) {
    if (!userInput.trim() || streaming.value) return

    // 添加用户消息
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userInput,
      timestamp: Date.now(),
    }
    messages.value.push(userMsg)

    // 添加空的 AI 消息（占位）
    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    }
    messages.value.push(aiMsg)

    streaming.value = true
    abortController = new AbortController()

    try {
      await sendMessage(
        userInput,
        currentSessionId.value || undefined,
        // onChunk
        (content) => {
          aiMsg.content += content
        },
        // onDone
        (fullContent, sessionId) => {
          aiMsg.content = fullContent
          aiMsg.streaming = false
          streaming.value = false
          currentSessionId.value = sessionId
          loadSessions()
        },
        // onError
        (error) => {
          aiMsg.content = `出错了：${error}`
          aiMsg.streaming = false
          streaming.value = false
        },
        abortController.signal,
      )
    } catch (err: any) {
      if (err.name === 'AbortError') {
        aiMsg.streaming = false
        streaming.value = false
      } else {
        aiMsg.content = `请求失败：${err.message}`
        aiMsg.streaming = false
        streaming.value = false
      }
    }
  }

  function stopGenerating() {
    abortController?.abort()
    abortController = null
  }

  async function loadSessions() {
    sessions.value = await fetchSessions()
  }

  async function switchSession(sessionId: string) {
    currentSessionId.value = sessionId
    const data = await fetchSessionMessages(sessionId)
    messages.value = data.messages.map((m: any, i: number) => ({
      id: `${sessionId}-${i}`,
      role: m.role,
      content: m.content,
      timestamp: Date.now(),
    }))
  }

  function newSession() {
    currentSessionId.value = null
    messages.value = []
  }

  async function removeSession(sessionId: string) {
    await deleteSession(sessionId)
    if (currentSessionId.value === sessionId) {
      newSession()
    }
    await loadSessions()
  }

  return {
    messages,
    sessions,
    currentSessionId,
    streaming,
    send,
    stopGenerating,
    loadSessions,
    switchSession,
    newSession,
    removeSession,
  }
}
```

---

## Markdown 渲染 + 代码高亮

AI 回复通常包含 Markdown——代码块、列表、表格。需要渲染成 HTML。

```bash
npm install marked highlight.js
```

```vue
<!-- components/MarkdownRenderer.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'

const props = defineProps<{ content: string }>()

marked.setOptions({
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  },
})

const html = computed(() => {
  try {
    return marked.parse(props.content)
  } catch {
    return props.content
  }
})
</script>

<template>
  <div class="markdown-body" v-html="html" />
</template>

<style>
@import 'highlight.js/styles/github-dark.css';

.markdown-body {
  line-height: 1.6;
  word-break: break-word;
}

.markdown-body pre {
  background: #1e1e2e;
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
  position: relative;
}

.markdown-body code {
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 14px;
}

.markdown-body :not(pre) > code {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}
</style>
```

### 代码块复制按钮

```javascript
// 给所有代码块添加复制按钮
function addCopyButtons() {
  document.querySelectorAll('.markdown-body pre').forEach(pre => {
    if (pre.querySelector('.copy-btn')) return
    const btn = document.createElement('button')
    btn.className = 'copy-btn'
    btn.textContent = '复制'
    btn.onclick = async () => {
      const code = pre.querySelector('code')?.textContent || ''
      await navigator.clipboard.writeText(code)
      btn.textContent = '已复制'
      setTimeout(() => { btn.textContent = '复制' }, 2000)
    }
    pre.appendChild(btn)
  })
}
```

---

## 聊天输入框

```vue
<!-- components/ChatInput.vue -->
<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ streaming: boolean }>()
const emit = defineEmits<{
  send: [message: string]
  stop: []
}>()

const input = ref('')

function handleSend() {
  if (!input.value.trim() || props.streaming) return
  emit('send', input.value)
  input.value = ''
}

function handleKeydown(e: KeyboardEvent) {
  // Enter 发送，Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="chat-input">
    <textarea
      v-model="input"
      @keydown="handleKeydown"
      placeholder="输入消息，Enter 发送，Shift+Enter 换行"
      :disabled="streaming"
      rows="1"
    />
    <button v-if="streaming" @click="emit('stop')" class="stop-btn">
      停止生成
    </button>
    <button v-else @click="handleSend" :disabled="!input.trim()" class="send-btn">
      发送
    </button>
  </div>
</template>

<style scoped>
.chat-input {
  display: flex;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid #2a2a3a;
  background: #1a1a2e;
}

textarea {
  flex: 1;
  resize: none;
  border: 1px solid #3a3a4a;
  border-radius: 8px;
  padding: 10px 14px;
  background: #0d0d1a;
  color: #e0e0e0;
  font-size: 14px;
  min-height: 42px;
  max-height: 200px;
}

.send-btn {
  padding: 10px 20px;
  border-radius: 8px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  cursor: pointer;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.stop-btn {
  padding: 10px 20px;
  border-radius: 8px;
  background: #e74c3c;
  color: white;
  border: none;
  cursor: pointer;
}
</style>
```

### 关键交互细节

1. **Enter 发送 / Shift+Enter 换行**——ChatGPT 同款体验
2. **流式输出时禁用输入框**——防止重复发送
3. **"停止生成"按钮**——调用 `AbortController.abort()` 中断请求
4. **textarea 自动高度**——内容多时自动撑高，最大 200px

---

## 自动滚动

聊天界面需要在新消息出现时自动滚动到底部，但用户手动上滚时不应该打断。

```typescript
// 智能滚动：只在用户没有手动上滚时自动滚动
function useAutoScroll(containerRef: Ref<HTMLElement | null>) {
  let userScrolled = false

  function onScroll() {
    const el = containerRef.value
    if (!el) return
    const threshold = 100
    userScrolled = el.scrollHeight - el.scrollTop - el.clientHeight > threshold
  }

  function scrollToBottom(smooth = true) {
    if (userScrolled) return
    const el = containerRef.value
    if (!el) return
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'instant',
    })
  }

  return { onScroll, scrollToBottom }
}
```

在流式输出时，每收到一个 chunk 就调用 `scrollToBottom()`——如果用户没有上滚就自动跟随，如果用户在翻看历史就不打断。

---

## Docker Compose 一把部署

```yaml
# docker-compose.yml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file:
      - ./backend/.env
    volumes:
      - ./backend/data:/app/data

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend
```

**后端 Dockerfile：**

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**前端 Dockerfile：**

```dockerfile
# frontend/Dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

```bash
docker compose up -d
# 前端: http://localhost:3000
# 后端: http://localhost:8000
```

---

## 总结

1. **流式渲染用 Typewriter Buffer**——每 24ms 从缓冲区取字符，视觉上平滑自然。
2. **`fetch` + `ReadableStream` 消费 SSE**——比 EventSource 更灵活，支持 POST + AbortSignal。
3. **Markdown 渲染 + 代码高亮**——`marked` + `highlight.js`，加复制按钮提升体验。
4. **智能自动滚动**——用户没上滚就跟随，手动上滚不打断。
5. **Enter 发送 / Shift+Enter 换行**——符合 ChatGPT 用户习惯。
6. **Docker Compose 打包部署**——前后端一行命令启动。

这两篇（13-14）完成了一个完整的 AI 聊天应用全栈开发。接下来进入更高级的领域——**RAG**，让 AI 基于你的文档回答问题。

---

> **下一篇预告**：[15 | RAG 入门：让 AI 基于你的文档回答问题](/series/junior/15-rag-intro)

---

**讨论话题**：你做过 AI 聊天前端吗？流式渲染有没有遇到性能问题？Markdown 渲染用的什么方案？评论区聊聊。
