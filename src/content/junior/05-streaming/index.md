---
title: "流式输出：让 AI 回复像 ChatGPT 一样打字机效果"
description: "SSE 原理、流式请求、前端逐字渲染、React/Vue 流式状态管理、实战打字机聊天组件"
order: 5
cover: "./cover.png"
publishDate: "2025-07-06"
tags: ["SSE", "流式输出", "React", "Vue", "实战"]
---

# 流式输出：让 AI 回复像 ChatGPT 一样打字机效果

> 本文是【前端转 AI 全栈实战】系列第 05 篇。
> 上一篇：[多模型适配：一套代码接 6 家 AI 厂商](/series/junior/04-multi-model-client) | 下一篇：[Prompt 工程：前端最容易忽略的核心技能](/series/junior/06-prompt-engineering)

---

## 这篇文章你会得到什么

你有没有注意到 ChatGPT 的回复是一个字一个字"打"出来的，而不是等几秒钟后"啪"一下全部出现？

这不是为了炫酷——这是**用户体验的硬需求**。

AI 模型生成一段 500 字的回复可能需要 3-8 秒。如果让用户干等 8 秒看一个加载动画，大部分人直接关掉了。但如果第一个字在 200ms 内就出现，用户会觉得"很快"，即使全部输出完需要同样的时间。

今天的目标：**搞懂流式输出的原理，用 JS 和 Python 分别实现后端流式调用，再用前端代码做出打字机效果**。

---

## 非流式 vs 流式：到底差在哪

先对比一下两种模式的区别：

**非流式（普通模式）**：

```
用户发送请求 → 等待 5 秒 → 一次性收到完整回复
```

**流式（Streaming）**：

```
用户发送请求 → 200ms 收到第一个字 → 陆续收到后续文字 → 5 秒后全部输出完
```

总耗时差不多，但体验天差地别。流式模式下用户从发出请求的第一时间就能看到 AI 在"思考和回答"，心理等待感大幅降低。

技术上的区别就一个参数：`stream: true`。

---

## SSE 是什么：一分钟搞懂

流式输出背后的协议是 **SSE（Server-Sent Events）**——服务端推送事件。

如果你做过前端，你肯定知道 WebSocket。SSE 比 WebSocket 简单得多：

| 对比 | WebSocket | SSE |
|------|-----------|-----|
| 方向 | 双向通信 | 服务端 → 客户端（单向） |
| 协议 | ws:// | 普通 HTTP |
| 复杂度 | 需要握手、心跳 | 直接用，几乎零配置 |
| 断线重连 | 手动实现 | 浏览器自动重连 |
| 适用场景 | 聊天室、实时协作 | AI 回复、通知推送 |

AI 流式输出用 SSE 完全够了——因为只需要"服务器往客户端推文字"这一个方向。

SSE 的数据格式长这样：

```
data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"你"}}]}

data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"好"}}]}

data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"！"}}]}

data: [DONE]
```

每一行 `data:` 就是一个事件，包含一小块回复内容。最后一个 `data: [DONE]` 表示结束。

注意和非流式的区别：非流式返回的是 `message.content`（完整文本），流式返回的是 `delta.content`（增量文本片段）。

---

## 后端流式调用：加一个 stream: true

### Node.js 实现

用 `openai` SDK，流式调用只需加 `stream: true`：

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

async function streamChat(userMessage) {
  const stream = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: userMessage }],
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      process.stdout.write(content); // 逐字输出，不换行
    }
  }
  console.log(); // 输出完毕后换行
}

streamChat('用 100 字介绍一下 JavaScript');
```

运行效果：你会看到终端里的文字一个一个蹦出来，而不是等半天后一下子全出来。

### Python 实现

```python
from openai import OpenAI
import os

client = OpenAI(
    base_url="https://api.deepseek.com",
    api_key=os.getenv("DEEPSEEK_API_KEY"),
)

def stream_chat(user_message: str):
    stream = client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": user_message}],
        stream=True,
    )

    for chunk in stream:
        content = chunk.choices[0].delta.content
        if content:
            print(content, end="", flush=True)
    print()

stream_chat("用 100 字介绍一下 JavaScript")
```

JS 和 Python 的 `openai` SDK 都把 SSE 解析封装好了，你不需要手动去拼 `data:` 行——直接 `for await ... of` 或 `for ... in` 遍历就行。

### 原始 fetch 实现（不依赖 SDK）

如果你想理解底层到底发生了什么，也可以用原始 `fetch` 来调：

```javascript
async function streamWithFetch(userMessage) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: userMessage }],
      stream: true,
    }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    // text 可能包含多行 data: ...
    const lines = text.split('\n').filter(line => line.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6); // 去掉 "data: " 前缀
      if (data === '[DONE]') return;

      const parsed = JSON.parse(data);
      const content = parsed.choices[0]?.delta?.content;
      if (content) process.stdout.write(content);
    }
  }
}
```

这就是 SSE 的真面目：**一个持续的 HTTP 响应，body 里一行行推送 `data: {...}` 格式的 JSON**。SDK 帮你做的事就是把这个解析过程封装了。

---

## 前端逐字渲染：做出打字机效果

后端搞定了流式调用，前端怎么接？这是前端开发者的主场了。

### 方案一：浏览器原生 EventSource

如果你的后端直接暴露 SSE 接口，前端可以用浏览器原生的 `EventSource`：

```javascript
const source = new EventSource('/api/chat?message=你好');

source.onmessage = (event) => {
  if (event.data === '[DONE]') {
    source.close();
    return;
  }
  const data = JSON.parse(event.data);
  const content = data.choices[0]?.delta?.content;
  if (content) {
    appendToChat(content); // 追加到聊天界面
  }
};
```

但 `EventSource` 有个硬伤——**只支持 GET 请求**，不能发 POST body。对于需要发送复杂消息体的 AI 聊天场景，不太够用。

### 方案二：fetch + ReadableStream（推荐）

实际项目中更常用的是 `fetch` + `ReadableStream`：

```javascript
async function fetchStream(messages) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;

      try {
        const data = JSON.parse(line.slice(6));
        const content = data.choices[0]?.delta?.content;
        if (content) {
          result += content;
          updateUI(result); // 每收到一个片段就更新界面
        }
      } catch (e) {
        // SSE 行可能被截断，跳过解析失败的行
      }
    }
  }

  return result;
}
```

核心就三步：
1. **`response.body.getReader()`** — 拿到可读流的 reader
2. **`reader.read()` 循环** — 不断读取新到达的数据块
3. **解析 SSE 行** — 提取 `delta.content` 并追加到界面

---

## React 中的流式状态管理

前端框架里怎么优雅地管理流式状态？以 React 为例：

```jsx
import { useState, useCallback } from 'react';

function useStreamChat() {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(async (userInput) => {
    const userMsg = { role: 'user', content: userInput };
    const assistantMsg = { role: 'assistant', content: '' };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg],
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices[0]?.delta?.content;
            if (content) {
              // 更新最后一条消息（assistant）的内容
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + content,
                };
                return updated;
              });
            }
          } catch (e) {}
        }
      }
    } finally {
      setIsStreaming(false);
    }
  }, [messages]);

  return { messages, isStreaming, sendMessage };
}
```

使用这个 Hook：

```jsx
function ChatApp() {
  const { messages, isStreaming, sendMessage } = useStreamChat();
  const [input, setInput] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage(input);
    setInput('');
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.content}
            {msg.role === 'assistant' && isStreaming && i === messages.length - 1 && (
              <span className="cursor">▊</span>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入消息..."
          disabled={isStreaming}
        />
        <button type="submit" disabled={isStreaming}>
          {isStreaming ? '回复中...' : '发送'}
        </button>
      </form>
    </div>
  );
}
```

关键设计点：

- **先插入空的 assistant 消息**，然后逐步更新它的 content——这样 React 每次更新的只是最后一条消息的文本，而不是整个列表。
- **`isStreaming` 状态**控制输入框和按钮的禁用，防止用户在回复中途重复发送。
- **光标动画** `▊` 在流式输出时显示，结束后自动消失。

---

## Vue 中的流式状态管理

Vue 用户也别着急，写法一样清晰：

```vue
<script setup>
import { ref } from 'vue';

const messages = ref([]);
const isStreaming = ref(false);
const input = ref('');

async function sendMessage() {
  if (!input.value.trim() || isStreaming.value) return;

  const userMsg = { role: 'user', content: input.value };
  const assistantMsg = { role: 'assistant', content: '' };
  messages.value.push(userMsg, assistantMsg);

  const currentInput = input.value;
  input.value = '';
  isStreaming.value = true;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.value.slice(0, -1),
      }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const lastMsg = messages.value[messages.value.length - 1];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const data = JSON.parse(line.slice(6));
          const content = data.choices[0]?.delta?.content;
          if (content) {
            lastMsg.content += content; // Vue 响应式自动更新
          }
        } catch (e) {}
      }
    }
  } finally {
    isStreaming.value = false;
  }
}
</script>

<template>
  <div class="chat-container">
    <div class="messages">
      <div
        v-for="(msg, i) in messages"
        :key="i"
        :class="['message', msg.role]"
      >
        {{ msg.content }}
        <span
          v-if="msg.role === 'assistant' && isStreaming && i === messages.length - 1"
          class="cursor"
        >▊</span>
      </div>
    </div>
    <form @submit.prevent="sendMessage">
      <input
        v-model="input"
        placeholder="输入消息..."
        :disabled="isStreaming"
      />
      <button type="submit" :disabled="isStreaming">
        {{ isStreaming ? '回复中...' : '发送' }}
      </button>
    </form>
  </div>
</template>
```

Vue 这边有个天然优势——**响应式系统会自动追踪 `lastMsg.content` 的变化**，直接 `+=` 就能触发视图更新，不需要像 React 那样用函数式 setState。

---

## 后端转发：Python FastAPI 实现 SSE 接口

实际项目中，前端不会直接调 AI API（API Key 会暴露）。通常是：**前端 → 你的后端 → AI API**，你的后端负责转发流式响应。

用 FastAPI 实现一个 SSE 流式接口：

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from openai import OpenAI
import os
import json

app = FastAPI()

client = OpenAI(
    base_url="https://api.deepseek.com",
    api_key=os.getenv("DEEPSEEK_API_KEY"),
)

@app.post("/api/chat")
async def chat(request: dict):
    messages = request.get("messages", [])

    def generate():
        stream = client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            stream=True,
        )
        for chunk in stream:
            content = chunk.choices[0].delta.content
            if content:
                # 按 SSE 格式输出
                data = json.dumps({"choices": [{"delta": {"content": content}}]})
                yield f"data: {data}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
```

这样前端 `fetch` 你的 `/api/chat`，就能拿到标准 SSE 格式的流式响应，和直接调 OpenAI API 的体验完全一致。

---

## 打字机光标 CSS

最后补一个细节——那个一闪一闪的光标，纯 CSS 实现：

```css
.cursor {
  display: inline-block;
  animation: blink 0.8s step-end infinite;
  color: #10b981;
  margin-left: 2px;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.message.assistant {
  white-space: pre-wrap;
  line-height: 1.6;
}
```

加上这段 CSS，你的 AI 聊天界面就有了和 ChatGPT 一样的打字机效果。

---

## 进阶：让流式输出更丝滑——Typewriter Buffer 模式

前面的实现有一个体验问题：**AI 返回 token 的速度是不均匀的**。

有时候网络一下子推过来一大坨 token，屏幕上"哗"地蹦出一大段文字；有时候又卡顿半秒才来下一个 token。这种忽快忽慢的节奏感很差，用户感觉不到"AI 在稳定地打字"。

ChatGPT 的打字效果之所以流畅，不是因为 token 到得均匀，而是因为**前端做了一层缓冲**——把到达的 token 先存起来，然后用固定节奏一个个"喂"给界面。

### 核心思路：生产者-消费者模式

```
网络层（生产者）→ [Buffer 缓冲区] → 定时器（消费者）→ UI 渲染
```

- **生产者**：流式 chunk 到达后，往 buffer 里追加文本
- **消费者**：一个定时器（`setInterval` 或 `requestAnimationFrame`）以固定频率从 buffer 中取出少量字符，更新到界面

这样不管网络推送多快多慢，用户看到的始终是**匀速、流畅的打字效果**。

### React 实现

```jsx
import { useState, useRef, useCallback } from 'react';

function useTypewriterStream() {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);

  const streamBufferRef = useRef('');
  const streamEndedRef = useRef(false);
  const timerRef = useRef(null);

  const TICK_MS = 24;        // 每 24ms 消费一次（约 42fps）
  const CHARS_PER_TICK = 2;  // 每次取 2 个字符

  const startTypewriter = useCallback(() => {
    timerRef.current = setInterval(() => {
      const buf = streamBufferRef.current;

      if (buf.length === 0) {
        // buffer 空了，检查流是否已结束
        if (streamEndedRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          setStreaming(false);
        }
        return;
      }

      // 从 buffer 中取出固定数量的字符
      const take = Math.min(CHARS_PER_TICK, buf.length);
      const chars = buf.slice(0, take);
      streamBufferRef.current = buf.slice(take);

      // 更新最后一条 assistant 消息
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: last.content + chars };
        }
        return next;
      });
    }, TICK_MS);
  }, []);

  const sendMessage = useCallback(async (userInput) => {
    const userMsg = { role: 'user', content: userInput };
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }]);
    setStreaming(true);

    // 重置 buffer 状态
    streamBufferRef.current = '';
    streamEndedRef.current = false;
    startTypewriter();

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [...messages, userMsg] }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line.trim());
          if (data.content) {
            // 生产者：往 buffer 追加，不直接更新 UI
            streamBufferRef.current += data.content;
          }
        } catch {}
      }
    }

    // 标记流结束，typewriter 会在 buffer 消费完后自动停止
    streamEndedRef.current = true;
  }, [messages, startTypewriter]);

  return { messages, streaming, sendMessage };
}
```

### 关键参数调优

| 参数 | 推荐值 | 效果 |
|------|-------|------|
| `TICK_MS` | 16-30ms | 越小越快，16ms ≈ 60fps，24ms 更均匀 |
| `CHARS_PER_TICK` | 1-3 | 1 个字最像手打，2-3 个更快但仍流畅 |

你可以根据场景调整：

- **正式聊天界面**：`TICK_MS=24, CHARS_PER_TICK=2`（稳定流畅）
- **代码生成场景**：`TICK_MS=16, CHARS_PER_TICK=5`（代码输出量大，需要更快）
- **打字机感最强**：`TICK_MS=40, CHARS_PER_TICK=1`（慢速逐字，像真人在打字）

### 用 requestAnimationFrame 替代 setInterval

如果你追求更流畅的渲染，可以用 `requestAnimationFrame`（RAF）替代 `setInterval`：

```javascript
const startTypewriterRAF = () => {
  let lastTime = 0;

  const tick = (currentTime) => {
    if (currentTime - lastTime < TICK_MS) {
      rafIdRef.current = requestAnimationFrame(tick);
      return;
    }
    lastTime = currentTime;

    const buf = streamBufferRef.current;
    if (buf.length === 0) {
      if (streamEndedRef.current) {
        setStreaming(false);
        return; // 不再调度下一帧
      }
      rafIdRef.current = requestAnimationFrame(tick);
      return;
    }

    const take = Math.min(CHARS_PER_TICK, buf.length);
    const chars = buf.slice(0, take);
    streamBufferRef.current = buf.slice(take);

    setMessages(prev => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === 'assistant') {
        next[next.length - 1] = { ...last, content: last.content + chars };
      }
      return next;
    });

    rafIdRef.current = requestAnimationFrame(tick);
  };

  rafIdRef.current = requestAnimationFrame(tick);
};
```

RAF 的优势：
- **和浏览器刷新频率同步**，不会出现 setInterval 的掉帧问题
- **页面不可见时自动暂停**，节省性能
- **与渲染管线对齐**，避免不必要的中间帧

### 为什么不直接每个 token 更新 UI？

对比一下两种方案的效果：

| 方案 | 直接更新 | Typewriter Buffer |
|------|---------|-------------------|
| 流畅度 | 忽快忽慢，像"结巴" | 匀速流畅，像打字机 |
| 渲染频率 | 取决于网络，可能每秒 200+ 次 | 固定 ~42 次/秒 |
| 性能 | 高频 setState 可能卡顿 | 可控，不会压垮 React |
| 网络突发 | 一下蹦出一大段 | 均匀释放，无跳跃 |
| 网络卡顿 | UI 也跟着卡 | buffer 有余量，UI 继续流畅 |

在我自己的项目中实测，Typewriter Buffer 模式的用户满意度明显更高——大家会觉得"AI 回复很稳"。

---

## 常见坑和解决方案

### 1. SSE 行被截断

网络传输中，一个 `data: {...}` 行可能被拆成两个 `chunk` 到达。直接 `JSON.parse` 会报错。

解决方案——用 buffer 拼接：

```javascript
let buffer = '';

function processChunk(text) {
  buffer += text;
  const lines = buffer.split('\n');
  buffer = lines.pop(); // 最后一行可能不完整，留到下次

  for (const line of lines) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    try {
      const data = JSON.parse(line.slice(6));
      const content = data.choices[0]?.delta?.content;
      if (content) onContent(content);
    } catch (e) {
      // 真的解析失败了，记录日志
      console.warn('SSE parse error:', line);
    }
  }
}
```

### 2. 用户中途取消

用户可能在 AI 回复到一半的时候想取消。用 `AbortController`：

```javascript
const controller = new AbortController();

// 发起请求
fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({ messages }),
  signal: controller.signal, // 传入 signal
});

// 用户点击"停止生成"按钮
function handleStop() {
  controller.abort();
  setIsStreaming(false);
}
```

后端 Python 侧也要处理客户端断开：

```python
def generate():
    stream = client.chat.completions.create(
        model="deepseek-chat", messages=messages, stream=True,
    )
    try:
        for chunk in stream:
            content = chunk.choices[0].delta.content
            if content:
                data = json.dumps({"choices": [{"delta": {"content": content}}]})
                yield f"data: {data}\n\n"
    except GeneratorExit:
        stream.close()  # 客户端断开时关闭上游流
    yield "data: [DONE]\n\n"
```

### 3. Markdown 渲染时机

AI 的回复通常包含 Markdown（代码块、列表等）。流式输出时如果实时渲染 Markdown，可能出现半个代码块的情况。

两种策略：

- **简单方案**：流式输出时用纯文本显示，全部输出完后再渲染 Markdown。
- **进阶方案**：用增量 Markdown 渲染库（如 `marked` 配合 debounce），每隔 100ms 重新渲染一次。

```javascript
import { marked } from 'marked';

let rawText = '';
let renderTimer = null;

function onContent(content) {
  rawText += content;
  if (!renderTimer) {
    renderTimer = setTimeout(() => {
      chatEl.innerHTML = marked.parse(rawText);
      renderTimer = null;
    }, 100);
  }
}
```

---

## 总结

1. **流式输出的核心价值是用户体验**——首字响应 200ms vs 干等 5 秒，体感差距巨大。
2. **SSE 协议很简单**：`data: {...}\n\n` 格式，`[DONE]` 结束，不需要 WebSocket。
3. **后端只需加 `stream: true`**，`openai` SDK（JS/Python）都封装好了流式迭代。
4. **前端用 `fetch` + `ReadableStream`** 读取流数据，逐字追加到界面。
5. **React** 用函数式 `setState` 更新最后一条消息，**Vue** 直接 `+=` 响应式搞定。
6. **生产环境注意**三个坑：SSE 行截断、用户中途取消、Markdown 渲染时机。
7. **后端用 FastAPI `StreamingResponse`** 做 SSE 转发，API Key 不暴露给前端。

**下一篇**，我们进入 AI 开发中最被低估的技能——Prompt 工程。很多人觉得 Prompt 就是"随便写一句话"，但实际上一个结构化的 Prompt 能把 AI 输出的稳定性和质量提升一个量级。

---

> **下一篇**：[06 | Prompt 工程：前端最容易忽略的核心技能](/series/junior/06-prompt-engineering)

---

**讨论话题**：你做过流式输出吗？是用 SSE 还是 WebSocket？在处理流式渲染的时候有踩过什么坑吗？评论区聊聊。
