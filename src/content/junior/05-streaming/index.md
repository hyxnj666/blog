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
> 上一篇：[多模型适配：一套代码接 6 家 AI 厂商](/series/junior/04-multi-model-client) | 下一篇：Prompt 工程：前端最容易忽略的核心技能（即将发布）

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

> **下一篇预告**：06 | Prompt 工程：前端最容易忽略的核心技能（即将发布）

---

**讨论话题**：你做过流式输出吗？是用 SSE 还是 WebSocket？在处理流式渲染的时候有踩过什么坑吗？评论区聊聊。
