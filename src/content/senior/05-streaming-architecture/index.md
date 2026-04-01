---
title: "AI Streaming 架构：从浏览器到服务端的全链路流式设计"
description: "SSE/WebSocket/gRPC-Web 对比、服务端流式转发、流式中间件、流式渲染性能优化、断点续传"
order: 5
cover: "./cover.png"
publishDate: "2025-08-24"
tags: ["Streaming", "SSE", "WebSocket", "架构设计"]
---

# AI Streaming 架构：从浏览器到服务端的全链路流式设计

> 本文是【高级前端的 AI 架构升级之路】系列第 05 篇。
> 上一篇：[AI 应用的状态管理：比 Redux 复杂 10 倍的挑战](/series/senior/04-ai-state-management) | 下一篇：[从单 Chat 到多 Agent 系统：AI 应用的架构演进路线](/series/senior/06-multi-agent)

---

## 不只是加个 stream: true

初级版系列里我们讲了流式输出的基础——加 `stream: true`，用 `ReadableStream` 解析 SSE。但在生产级系统中，流式架构远不止这些。

全链路视角下，一个 AI 流式请求要经过：

```
浏览器 → 你的 BFF/API → AI Gateway → AI Provider API
  ↑                                        │
  └──────── 流式数据反向传递 ──────────────┘
```

中间每一层都要处理流式数据的转发、处理和异常。这篇文章从架构师的视角，把全链路打通。

---

## 方案对比：SSE vs WebSocket vs HTTP Streaming

先做个技术选型。

| 特性 | SSE | WebSocket | HTTP Streaming (fetch) |
|------|-----|-----------|----------------------|
| 方向 | 单向（服务端→客户端）| 双向 | 单向（服务端→客户端）|
| 协议 | HTTP | ws:// | HTTP |
| 浏览器支持 | ✅ 原生 EventSource | ✅ 原生 WebSocket | ✅ fetch + ReadableStream |
| 自动重连 | ✅ EventSource 内置 | ❌ 需手动实现 | ❌ 需手动实现 |
| POST body | ❌ 只支持 GET | ✅ | ✅ |
| 请求头自定义 | ❌ EventSource 限制 | ✅ | ✅ |
| 代理/CDN 兼容 | ⚠️ 部分有问题 | ⚠️ 需要特殊配置 | ✅ 最好 |
| 多路复用 | ❌ 每个流一个连接 | ✅ 一个连接多路 | ❌ 每个流一个连接 |

### 选型建议

- **简单场景**（单聊天窗口）：`fetch` + `ReadableStream`，最简单也最通用
- **需要双向通信**（用户中途发消息、Agent 请求确认）：WebSocket
- **多路流式并发**（多个 Agent 同时回复）：WebSocket + 消息路由
- **企业内网/代理复杂**：`fetch` + `ReadableStream`，对网络基础设施要求最低

大部分场景 `fetch` + `ReadableStream` 就够了。需要多路并发或双向通信时再上 WebSocket。

---

## 服务端流式转发架构

你的服务端不只是"透传" AI API 的响应——中间要做很多事。

### 流式管道设计

```
AI Provider → [解析] → [过滤] → [埋点] → [格式化] → 客户端
```

每一步都是一个"流式中间件"——接收流数据、处理、传递给下一步。

### Python FastAPI 实现

```python
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from openai import OpenAI
import json
import time
import os

app = FastAPI()

client = OpenAI(
    base_url="https://api.deepseek.com",
    api_key=os.getenv("DEEPSEEK_API_KEY"),
)

# 流式中间件：内容过滤
def content_filter(content: str) -> str | None:
    sensitive_words = ["暴力", "色情"]  # 实际项目用更完善的方案
    for word in sensitive_words:
        if word in content:
            return None  # 过滤掉
    return content

# 流式中间件：埋点数据收集
class StreamMetrics:
    def __init__(self):
        self.first_token_time = None
        self.total_tokens = 0
        self.start_time = time.time()

    def on_token(self):
        if self.first_token_time is None:
            self.first_token_time = time.time() - self.start_time
        self.total_tokens += 1

    def summary(self) -> dict:
        return {
            "first_token_latency_ms": round((self.first_token_time or 0) * 1000),
            "total_tokens": self.total_tokens,
            "total_time_ms": round((time.time() - self.start_time) * 1000),
        }


@app.post("/api/chat/stream")
async def chat_stream(request: Request):
    body = await request.json()
    messages = body.get("messages", [])
    session_id = body.get("session_id", "unknown")

    metrics = StreamMetrics()

    def generate():
        stream = client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            stream=True,
        )

        try:
            for chunk in stream:
                content = chunk.choices[0].delta.content
                if not content:
                    continue

                metrics.on_token()

                # 中间件 1：内容过滤
                filtered = content_filter(content)
                if filtered is None:
                    filtered = "***"

                # 中间件 2：构造 SSE 数据
                data = json.dumps({
                    "choices": [{"delta": {"content": filtered}}],
                    "metrics": {
                        "tokens": metrics.total_tokens,
                    },
                })
                yield f"data: {data}\n\n"

        except GeneratorExit:
            stream.close()
        finally:
            # 流结束后上报埋点
            summary = metrics.summary()
            # async_report_metrics(session_id, summary)  # 异步上报

        yield f"data: {json.dumps({'done': True, 'metrics': metrics.summary()})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # 禁止 Nginx 缓冲
        },
    )
```

注意 `X-Accel-Buffering: no` 这个响应头——如果你的服务前面有 Nginx 反代，不加这个头 Nginx 会缓冲整个响应再一次性发给客户端，流式效果就没了。

### Node.js Express 实现

```typescript
import express from 'express';
import OpenAI from 'openai';

const app = express();
app.use(express.json());

const client = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

app.post('/api/chat/stream', async (req, res) => {
  const { messages, session_id } = req.body;

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const startTime = Date.now();
  let firstTokenTime: number | null = null;
  let tokenCount = 0;

  try {
    const stream = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      // 检测客户端是否断开
      if (req.destroyed) {
        stream.controller.abort();
        break;
      }

      const content = chunk.choices[0]?.delta?.content;
      if (!content) continue;

      if (firstTokenTime === null) firstTokenTime = Date.now() - startTime;
      tokenCount++;

      const data = JSON.stringify({
        choices: [{ delta: { content } }],
        metrics: { tokens: tokenCount },
      });
      res.write(`data: ${data}\n\n`);
    }

    // 发送完成事件
    res.write(`data: ${JSON.stringify({
      done: true,
      metrics: {
        firstTokenMs: firstTokenTime,
        totalTokens: tokenCount,
        totalMs: Date.now() - startTime,
      },
    })}\n\n`);
    res.write('data: [DONE]\n\n');
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});
```

---

## 流式渲染性能优化

当 AI 回复很长（几千字），逐字追加 + 实时渲染 Markdown 会变成性能瓶颈。

### 问题分析

一次典型的流式回复：
- 持续 10 秒
- 产出 2000 个 token
- 每秒约 200 次 `content += newToken`
- 如果每次都渲染 Markdown → 每秒 200 次 DOM 操作

### 解决方案一：节流渲染

不要每个 token 都渲染，攒一批再渲染：

```typescript
class ThrottledRenderer {
  private buffer = '';
  private rendered = '';
  private frameId: number | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  append(text: string) {
    this.buffer += text;
    this.scheduleRender();
  }

  private scheduleRender() {
    if (this.frameId !== null) return;
    this.frameId = requestAnimationFrame(() => {
      this.frameId = null;
      if (this.buffer === this.rendered) return;

      // 渲染完整内容的 Markdown
      this.container.innerHTML = renderMarkdown(this.buffer);
      this.rendered = this.buffer;
      this.scrollToBottom();
    });
  }

  finish() {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
    }
    this.container.innerHTML = renderMarkdown(this.buffer);
  }
}
```

用 `requestAnimationFrame` 自然节流到 60fps，每帧最多渲染一次。

### 解决方案二：Web Worker 解析 Markdown

Markdown 解析（尤其是带代码高亮的）是 CPU 密集型操作，可以放到 Worker 里：

```typescript
// markdown.worker.ts
import { marked } from 'marked';
import hljs from 'highlight.js';

marked.setOptions({
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return code;
  },
});

self.onmessage = (e) => {
  const { id, markdown } = e.data;
  const html = marked.parse(markdown);
  self.postMessage({ id, html });
};
```

```typescript
// 主线程
const worker = new Worker(new URL('./markdown.worker.ts', import.meta.url));

let pendingId = 0;
const callbacks = new Map<number, (html: string) => void>();

worker.onmessage = (e) => {
  const { id, html } = e.data;
  const callback = callbacks.get(id);
  if (callback) {
    callback(html);
    callbacks.delete(id);
  }
};

function renderInWorker(markdown: string): Promise<string> {
  return new Promise((resolve) => {
    const id = ++pendingId;
    callbacks.set(id, resolve);
    worker.postMessage({ id, markdown });
  });
}
```

### 解决方案三：虚拟滚动

当消息列表非常长时（几百条消息），全部渲染在 DOM 里会很卡。虚拟滚动只渲染可见区域的消息：

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualMessageList({ messages }: { messages: Message[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => estimateMessageHeight(messages[index]),
    overscan: 5,
  });

  return (
    <div ref={parentRef} style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: virtualRow.start,
              width: '100%',
            }}
          >
            <MessageBubble message={messages[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 断点续传：网络中断后恢复

移动端或弱网环境下，流式连接可能中途断开。如果 AI 已经生成了一半，从头开始既浪费 Token 又体验差。

### 方案：服务端缓存已生成内容

```typescript
// 服务端：缓存每个请求的流式输出
const streamCache = new Map<string, string>();

async function* streamWithResume(
  requestId: string,
  messages: Message[],
  resumeFrom: number = 0, // 从第几个字符开始
) {
  let fullContent = streamCache.get(requestId) || '';

  if (resumeFrom > 0 && fullContent.length >= resumeFrom) {
    // 先把缓存中已有但客户端丢失的部分发过去
    const missed = fullContent.slice(resumeFrom);
    yield { type: 'catch-up', content: missed };
  }

  if (fullContent.length > 0 && !streamCache.has(`${requestId}:done`)) {
    // 流还没完成，继续生成
    // ... 续传逻辑
  }

  // 正常流式输出
  const stream = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (!content) continue;

    fullContent += content;
    streamCache.set(requestId, fullContent);
    yield { type: 'delta', content };
  }

  streamCache.set(`${requestId}:done`, 'true');
  // 设置过期时间，避免内存泄漏
  setTimeout(() => {
    streamCache.delete(requestId);
    streamCache.delete(`${requestId}:done`);
  }, 300_000); // 5 分钟后清理
}
```

客户端断线重连：

```typescript
class ResumableStream {
  private requestId: string;
  private receivedLength = 0;
  private content = '';
  private retryCount = 0;
  private maxRetries = 3;

  async start(messages: Message[], onContent: (text: string) => void) {
    this.requestId = generateRequestId();
    await this.connect(messages, onContent);
  }

  private async connect(messages: Message[], onContent: (text: string) => void) {
    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          request_id: this.requestId,
          resume_from: this.receivedLength,
        }),
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        // 解析 SSE 并更新状态
        this.processChunk(text, onContent);
      }

      this.retryCount = 0; // 成功后重置
    } catch (err) {
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        const delay = Math.min(1000 * 2 ** this.retryCount, 10000);
        console.warn(`Stream disconnected, retry ${this.retryCount} in ${delay}ms`);
        await sleep(delay);
        await this.connect(messages, onContent);
      } else {
        throw new Error('Stream failed after max retries');
      }
    }
  }

  private processChunk(text: string, onContent: (text: string) => void) {
    // 解析 SSE 行，更新 receivedLength 和 content
    // ...
    const newContent = parseSSE(text);
    this.content += newContent;
    this.receivedLength = this.content.length;
    onContent(newContent);
  }
}
```

---

## 多路流式并发

当多个 Agent 同时回复时，需要在一个连接上传输多路流数据。

### WebSocket + 频道路由方案

```typescript
// 服务端
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  ws.on('message', async (data) => {
    const request = JSON.parse(data.toString());

    if (request.type === 'multi-agent') {
      // 同时启动多个 Agent
      const agents = request.agents.map((agentConfig, index) => ({
        channelId: `agent-${index}`,
        ...agentConfig,
      }));

      await Promise.all(
        agents.map(agent => streamAgent(ws, agent))
      );

      ws.send(JSON.stringify({ type: 'all-done' }));
    }
  });
});

async function streamAgent(ws, agent) {
  const stream = await client.chat.completions.create({
    model: agent.model,
    messages: agent.messages,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      ws.send(JSON.stringify({
        type: 'stream',
        channelId: agent.channelId,
        content,
      }));
    }
  }

  ws.send(JSON.stringify({
    type: 'channel-done',
    channelId: agent.channelId,
  }));
}
```

客户端按 channelId 分发：

```typescript
const channels = new Map<string, (content: string) => void>();

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'stream') {
    const handler = channels.get(data.channelId);
    if (handler) handler(data.content);
  }

  if (data.type === 'channel-done') {
    channels.delete(data.channelId);
  }
};

// 注册频道
channels.set('agent-0', (content) => updateSearchAgent(content));
channels.set('agent-1', (content) => updateAnalysisAgent(content));
channels.set('agent-2', (content) => updateSummaryAgent(content));
```

---

## Nginx 配置要点

AI 流式应用部署时，Nginx 配置有几个必须注意的点：

```nginx
location /api/chat/stream {
    proxy_pass http://backend;

    # 关闭代理缓冲——这是最关键的一行
    proxy_buffering off;

    # 关闭 gzip（流式数据压缩会增加延迟）
    gzip off;

    # 超时设置要足够长
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    # SSE 必须的头
    proxy_set_header Connection '';
    proxy_http_version 1.1;
    chunked_transfer_encoding off;
}
```

---

## 总结

1. **技术选型**：大部分场景 `fetch` + `ReadableStream` 够用，多路并发用 WebSocket。
2. **服务端是流式管道**——解析、过滤、埋点、格式化，每一步都是流式中间件。
3. **渲染性能**三板斧：`requestAnimationFrame` 节流、Web Worker 解析 Markdown、虚拟滚动。
4. **断点续传**：服务端缓存已生成内容，客户端断线后从断点恢复。
5. **多路流式**：WebSocket + channelId 路由，多个 Agent 同时输出互不干扰。
6. **Nginx 配置**：`proxy_buffering off` 和 `gzip off` 是流式应用的必选项。

下一篇进入 AI 架构的高阶话题——多 Agent 系统设计。

---

> **下一篇预告**：[06 | 从单 Chat 到多 Agent 系统：AI 应用的架构演进路线](/series/senior/06-multi-agent)

---

**讨论话题**：你的项目里流式输出做到了哪一步？纯前端打字机效果，还是全链路流式架构？有遇到过 Nginx 缓冲导致流式失效的坑吗？评论区聊聊。
