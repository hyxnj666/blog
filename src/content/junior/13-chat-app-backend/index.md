---
title: "AI 聊天应用全栈实战（上）：FastAPI 后端 + 对话管理"
description: "用 FastAPI 搭建生产级 AI 聊天后端：对话管理、流式输出、Token 计量"
order: 13
cover: "./cover.png"
publishDate: "2025-08-22"
tags: ["FastAPI", "Python", "AI", "SSE", "后端"]
---

# AI 聊天应用全栈实战（上）：FastAPI 后端 + 对话管理

> 本文是【前端转 AI 全栈实战】系列第 13 篇。
> 上一篇：[前端为什么要学 Python：AI 全栈的第二条腿](/series/junior/12-why-python) | 下一篇：[AI 聊天应用全栈实战（下）：前端 UI + 流式渲染](/series/junior/14-chat-app-frontend)

---

## 这篇文章你会得到什么

上一篇你入门了 Python + FastAPI。今天我们正式动手——**搭建一个完整的 AI 聊天后端**。

不是简单的转发 API，而是一个生产级的聊天服务：

- **多轮对话管理**：维护对话历史，支持上下文
- **SSE 流式输出**：打字机效果的实时响应
- **Token 计量**：监控消耗，防止超支
- **上下文窗口管理**：自动截断过长的对话历史
- **会话持久化**：SQLite 存储对话记录

这是 AI 全栈应用的后端部分。下一篇做前端 UI。

---

## 项目初始化

```bash
mkdir ai-chat-fullstack && cd ai-chat-fullstack
mkdir backend && cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

pip install fastapi uvicorn openai python-dotenv aiosqlite
```

```
backend/
├── .env
├── main.py              # FastAPI 入口
├── routers/
│   └── chat.py          # 聊天路由
├── services/
│   ├── ai_service.py    # AI 调用层
│   └── chat_service.py  # 对话管理
├── models/
│   └── schemas.py       # Pydantic 数据模型
├── database/
│   └── db.py            # SQLite 数据库
└── requirements.txt
```

---

## 数据模型定义

先用 Pydantic 定义请求和响应的数据结构——这是 FastAPI 的核心。

```python
# models/schemas.py
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class Message(BaseModel):
    role: str = Field(..., pattern="^(system|user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=10000)
    session_id: Optional[str] = None
    model: str = "deepseek-chat"
    temperature: float = Field(default=0.7, ge=0, le=2)
    stream: bool = True


class ChatResponse(BaseModel):
    reply: str
    session_id: str
    model: str
    usage: Optional[dict] = None


class SessionInfo(BaseModel):
    session_id: str
    title: str
    message_count: int
    created_at: datetime
    updated_at: datetime
```

前端发来 `ChatRequest`，后端返回 `ChatResponse`。Pydantic 自动校验——`message` 为空字符串？自动拒绝。`temperature` 给了 5？自动拒绝。前端能拿到精确的 422 错误。

---

## AI 调用层

```python
# services/ai_service.py
from openai import AsyncOpenAI
from dotenv import load_dotenv
import os

load_dotenv()

client = AsyncOpenAI(
    base_url=os.getenv("AI_BASE_URL", "https://api.deepseek.com"),
    api_key=os.getenv("AI_API_KEY", os.getenv("DEEPSEEK_API_KEY")),
)

SYSTEM_PROMPT = """你是一个友好、专业的 AI 助手。
- 回答简洁准确，避免不必要的废话
- 代码用 markdown 代码块包裹，标注语言
- 如果不确定，诚实说不知道
- 使用中文回答"""


async def chat_completion(messages: list[dict], model: str = "deepseek-chat",
                          temperature: float = 0.7, stream: bool = False):
    full_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

    if stream:
        return await client.chat.completions.create(
            model=model,
            messages=full_messages,
            temperature=temperature,
            stream=True,
        )

    response = await client.chat.completions.create(
        model=model,
        messages=full_messages,
        temperature=temperature,
    )
    return response


async def chat_completion_stream(messages: list[dict], model: str = "deepseek-chat",
                                  temperature: float = 0.7):
    full_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

    stream = await client.chat.completions.create(
        model=model,
        messages=full_messages,
        temperature=temperature,
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content
```

关键设计：

- **`AsyncOpenAI`**：异步客户端，不阻塞 FastAPI 的事件循环
- **System Prompt 统一注入**：前端不需要管 system prompt，后端统一控制
- **`chat_completion_stream`**：生成器函数，逐块 yield 内容

---

## 对话管理

AI 的 API 是无状态的——每次请求都是独立的。要实现多轮对话，后端必须自己管理对话历史。

```python
# services/chat_service.py
import uuid
import json
import time
from typing import Optional


class ChatSessionManager:
    def __init__(self):
        self.sessions: dict[str, dict] = {}

    def create_session(self) -> str:
        session_id = str(uuid.uuid4())[:8]
        self.sessions[session_id] = {
            "id": session_id,
            "messages": [],
            "created_at": time.time(),
            "updated_at": time.time(),
            "title": "新对话",
        }
        return session_id

    def get_or_create_session(self, session_id: Optional[str] = None) -> str:
        if session_id and session_id in self.sessions:
            return session_id
        return self.create_session()

    def add_message(self, session_id: str, role: str, content: str):
        if session_id not in self.sessions:
            return
        session = self.sessions[session_id]
        session["messages"].append({"role": role, "content": content})
        session["updated_at"] = time.time()

        # 自动生成标题（用第一条用户消息）
        if role == "user" and session["title"] == "新对话":
            session["title"] = content[:30] + ("..." if len(content) > 30 else "")

    def get_messages(self, session_id: str, max_tokens: int = 8000) -> list[dict]:
        if session_id not in self.sessions:
            return []

        messages = self.sessions[session_id]["messages"]
        return self._truncate_messages(messages, max_tokens)

    def _truncate_messages(self, messages: list[dict], max_tokens: int) -> list[dict]:
        """滚动窗口策略：从最新消息往前保留，确保不超过 token 限制"""
        total = 0
        result = []

        for msg in reversed(messages):
            tokens = self._estimate_tokens(msg["content"])
            if total + tokens > max_tokens:
                break
            result.insert(0, msg)
            total += tokens

        return result

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
        other_chars = len(text) - chinese_chars
        return int(chinese_chars * 2 + other_chars * 0.4)

    def get_session_list(self) -> list[dict]:
        return sorted(
            [
                {
                    "session_id": s["id"],
                    "title": s["title"],
                    "message_count": len(s["messages"]),
                    "updated_at": s["updated_at"],
                }
                for s in self.sessions.values()
            ],
            key=lambda x: x["updated_at"],
            reverse=True,
        )

    def delete_session(self, session_id: str):
        self.sessions.pop(session_id, None)


session_manager = ChatSessionManager()
```

### 核心：滚动窗口截断

AI 有上下文限制（DeepSeek 是 64K tokens）。如果对话历史太长，需要截断。

策略：**从最新消息往前保留**——最近的对话比早期的对话更重要。

```python
def _truncate_messages(self, messages, max_tokens=8000):
    total = 0
    result = []
    # 从后往前遍历
    for msg in reversed(messages):
        tokens = self._estimate_tokens(msg["content"])
        if total + tokens > max_tokens:
            break
        result.insert(0, msg)
        total += tokens
    return result
```

默认保留最近 8000 tokens 的对话——大约 3000-4000 字的中文。加上 system prompt 和 AI 回复的预留空间，总共不会超过模型限制。

---

## SSE 流式输出

FastAPI 的 `StreamingResponse` + `async generator` 实现 SSE：

```python
# routers/chat.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from models.schemas import ChatRequest, ChatResponse
from services.ai_service import chat_completion, chat_completion_stream
from services.chat_service import session_manager
import json

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat")
async def chat(req: ChatRequest):
    session_id = session_manager.get_or_create_session(req.session_id)

    # 添加用户消息到历史
    session_manager.add_message(session_id, "user", req.message)

    # 获取截断后的对话历史
    messages = session_manager.get_messages(session_id)

    if req.stream:
        return StreamingResponse(
            stream_chat(session_id, messages, req.model, req.temperature),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Session-Id": session_id,
            },
        )

    # 非流式
    response = await chat_completion(messages, req.model, req.temperature)
    reply = response.choices[0].message.content

    session_manager.add_message(session_id, "assistant", reply)

    return ChatResponse(
        reply=reply,
        session_id=session_id,
        model=response.model,
        usage=response.usage.model_dump() if response.usage else None,
    )


async def stream_chat(session_id: str, messages: list, model: str, temperature: float):
    """SSE 流式输出生成器"""
    full_reply = ""

    # 发送 session_id
    yield f"data: {json.dumps({'type': 'session', 'session_id': session_id})}\n\n"

    try:
        async for chunk in chat_completion_stream(messages, model, temperature):
            full_reply += chunk
            yield f"data: {json.dumps({'type': 'content', 'content': chunk})}\n\n"

        # 流结束，保存完整回复到历史
        session_manager.add_message(session_id, "assistant", full_reply)

        yield f"data: {json.dumps({'type': 'done', 'content': full_reply})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"


@router.get("/sessions")
async def list_sessions():
    return session_manager.get_session_list()


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(session_id: str):
    messages = session_manager.sessions.get(session_id, {}).get("messages", [])
    return {"session_id": session_id, "messages": messages}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    session_manager.delete_session(session_id)
    return {"ok": True}
```

### SSE 数据格式

```
data: {"type": "session", "session_id": "a1b2c3d4"}

data: {"type": "content", "content": "你"}

data: {"type": "content", "content": "好"}

data: {"type": "content", "content": "！"}

data: {"type": "done", "content": "你好！"}
```

三种消息类型：

- `session`：告诉前端 session_id（新会话时用）
- `content`：AI 输出的文本片段
- `done`：流结束，附带完整回复
- `error`：出错了

前端按 type 分类处理就行。

---

## 主入口

```python
# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.chat import router as chat_router

app = FastAPI(title="AI Chat Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Session-Id"],
)

app.include_router(chat_router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
```

CORS 配置放行前端的开发端口（Vue 默认 5173，React 默认 3000）。

### 启动

```bash
# .env
DEEPSEEK_API_KEY=sk-xxx
```

```bash
uvicorn main:app --reload --port 8000
```

访问 `http://localhost:8000/docs` 查看自动生成的 API 文档。

---

## API 接口总结

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | 发送消息（支持流式/非流式） |
| GET | `/api/sessions` | 获取会话列表 |
| GET | `/api/sessions/{id}/messages` | 获取某会话的消息历史 |
| DELETE | `/api/sessions/{id}` | 删除会话 |
| GET | `/health` | 健康检查 |

### 用 curl 测试

```bash
# 非流式
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "用 Python 写一个快速排序", "stream": false}'

# 流式
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "解释一下 async/await"}' \
  --no-buffer
```

---

## 生产环境改进方向

当前版本用内存存储会话（重启就没了）。生产环境需要：

### 1. 数据库持久化

用 SQLite（轻量）或 PostgreSQL（生产）：

```python
# 简化示例：SQLite 持久化
import aiosqlite

async def save_message(session_id: str, role: str, content: str):
    async with aiosqlite.connect("chat.db") as db:
        await db.execute(
            "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
            (session_id, role, content),
        )
        await db.commit()
```

### 2. Token 用量记录

```python
# 每次请求记录 token 消耗
async def log_usage(session_id: str, model: str, usage: dict):
    prompt_tokens = usage.get("prompt_tokens", 0)
    completion_tokens = usage.get("completion_tokens", 0)
    # 写入数据库或日志系统
```

### 3. 速率限制

```python
from fastapi import Request
from collections import defaultdict
import time

rate_limits = defaultdict(list)

async def rate_limit_middleware(request: Request, call_next):
    ip = request.client.host
    now = time.time()
    # 清理过期记录
    rate_limits[ip] = [t for t in rate_limits[ip] if now - t < 60]
    if len(rate_limits[ip]) >= 20:  # 每分钟最多 20 次
        return JSONResponse(status_code=429, content={"error": "请求太频繁"})
    rate_limits[ip].append(now)
    return await call_next(request)
```

---

## 总结

1. **Pydantic 定义数据模型**——类型校验 + 自动文档，比 Express 的 `req.body` 安全得多。
2. **对话管理是 AI 后端的核心**——滚动窗口截断保证不超 Token 限制。
3. **SSE 流式输出**：`StreamingResponse` + `async generator`，三种消息类型（session/content/done）。
4. **AsyncOpenAI**：异步调用不阻塞事件循环，FastAPI 天然配合。
5. **API Key 在后端**：前端永远不直接调 AI API，Key 不暴露。

**下一篇**，我们做前端部分——聊天 UI、流式渲染、Markdown 代码高亮、自动滚动，并用 Docker Compose 把前后端打包部署。

---

> **下一篇预告**：[14 | AI 聊天应用全栈实战（下）：前端 UI + 流式渲染](/series/junior/14-chat-app-frontend)

---

**讨论话题**：你做过 AI 聊天后端吗？对话管理用的什么策略？是滚动窗口还是摘要压缩？评论区聊聊。
