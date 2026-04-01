---
title: "AI Agent 模式：让 AI 不只是回答问题，还能执行任务"
description: "从 Function Calling 到全栈 Agent：工具调用、安全边界与框架对比"
order: 16
cover: "./cover.png"
publishDate: "2025-09-12"
tags: ["AI Agent", "Function Calling", "Python", "FastAPI", "LangChain"]
---

# AI Agent 模式：让 AI 不只是回答问题，还能执行任务

> 本文是【前端转 AI 全栈实战】系列第 16 篇。
> 上一篇：[RAG 入门：让 AI 基于你的文档回答问题](/series/junior/15-rag-intro) | 下一篇：[AI + 低代码：用自然语言生成页面 / 表单 / 图表](/series/junior/17-ai-lowcode)

---

## 这篇文章你会得到什么

到目前为止，我们做的 AI 应用有一个共同点——**AI 只能说，不能做**。

你问它"今天天气怎么样"，它只能说"我无法获取实时天气数据"。
你让它"帮我查一下美元汇率"，它只能说"我的数据截止到 2024 年"。
你说"帮我把这个文件重命名"，它只能说"我无法执行文件操作"。

**Agent 改变了这一切——AI 可以调用工具了。**

Agent = AI + 工具调用能力。AI 负责"想"（理解需求、决策流程），工具负责"做"（查天气、搜网页、操作数据库）。

---

## 从 Chat 到 Agent：范式转换

### Chat 模式

```
用户: "今天北京天气怎么样？"
AI: "抱歉，我无法获取实时天气信息。"
```

### Agent 模式

```
用户: "今天北京天气怎么样？"
AI: [思考] 用户想知道天气，我需要调用天气查询工具
AI: [调用工具] get_weather(city="北京")
工具返回: {"temperature": 22, "weather": "晴", "humidity": 45}
AI: "今天北京天气晴朗，气温 22°C，湿度 45%，适合出门。"
```

AI 不再只是文本生成器——它变成了一个**能感知环境、调用工具、完成任务的智能体**。

---

## Function Calling：Agent 的基础能力

Function Calling（工具调用）是大模型提供的标准能力。你告诉 AI "有哪些工具可用"，AI 自己决定"什么时候调哪个工具"。

### 原理

```
① 你定义可用工具列表（函数名 + 参数 Schema）
       ↓
② 用户发消息
       ↓
③ AI 分析需求，决定是否需要调用工具
       ↓
④ 如果需要 → AI 返回工具调用请求（函数名 + 参数）
       ↓
⑤ 你执行工具，把结果返回给 AI
       ↓
⑥ AI 基于工具结果生成最终回答
```

### Python 实现

```python
from openai import OpenAI
import json

client = OpenAI(
    base_url="https://api.deepseek.com",
    api_key="sk-xxx",
)

# 1. 定义工具
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "获取指定城市的当前天气信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "城市名，如 '北京'、'上海'",
                    },
                },
                "required": ["city"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_exchange_rate",
            "description": "获取货币汇率",
            "parameters": {
                "type": "object",
                "properties": {
                    "from_currency": {"type": "string", "description": "源货币，如 USD"},
                    "to_currency": {"type": "string", "description": "目标货币，如 CNY"},
                },
                "required": ["from_currency", "to_currency"],
            },
        },
    },
]

# 2. 工具实现
def get_weather(city: str) -> dict:
    # 实际项目中调用天气 API
    return {"city": city, "temperature": 22, "weather": "晴", "humidity": 45}

def get_exchange_rate(from_currency: str, to_currency: str) -> dict:
    # 实际项目中调用汇率 API
    return {"from": from_currency, "to": to_currency, "rate": 7.24}

TOOL_MAP = {
    "get_weather": get_weather,
    "get_exchange_rate": get_exchange_rate,
}

# 3. Agent 主循环
def agent_chat(user_message: str) -> str:
    messages = [
        {"role": "system", "content": "你是一个有用的助手，可以查询天气和汇率。"},
        {"role": "user", "content": user_message},
    ]

    while True:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            tools=tools,
        )

        choice = response.choices[0]

        # AI 决定不调用工具，直接回复
        if choice.finish_reason == "stop":
            return choice.message.content

        # AI 决定调用工具
        if choice.finish_reason == "tool_calls":
            messages.append(choice.message)

            for tool_call in choice.message.tool_calls:
                func_name = tool_call.function.name
                func_args = json.loads(tool_call.function.arguments)

                # 执行工具
                result = TOOL_MAP[func_name](**func_args)

                # 把工具结果返回给 AI
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result, ensure_ascii=False),
                })

            # 继续循环，让 AI 基于工具结果生成回答
```

### 使用

```python
print(agent_chat("今天北京天气怎么样？"))
# → 今天北京天气晴朗，气温 22°C，湿度 45%，适合出门活动。

print(agent_chat("1000 美元等于多少人民币？"))
# → 当前汇率 1 USD = 7.24 CNY，1000 美元约等于 7240 元人民币。

print(agent_chat("你好"))
# → 你好！有什么可以帮你的？（不调用任何工具）
```

AI 自己判断什么时候需要工具，什么时候直接回答——这就是 Agent 的智能之处。

---

## 全栈 Agent：FastAPI + Vue

把 Agent 能力封装成 API 服务。

### 后端

```python
# routers/agent.py
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json

router = APIRouter(prefix="/api/agent", tags=["agent"])


class AgentRequest(BaseModel):
    message: str
    session_id: str | None = None


@router.post("/chat")
async def agent_chat_endpoint(req: AgentRequest):
    return StreamingResponse(
        agent_stream(req.message),
        media_type="text/event-stream",
    )


async def agent_stream(user_message: str):
    """Agent 流式输出：包含工具调用过程"""
    messages = [
        {"role": "system", "content": "你是一个有用的助手，可以查询天气和汇率。"},
        {"role": "user", "content": user_message},
    ]

    max_iterations = 5

    for _ in range(max_iterations):
        response = await async_client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            tools=tools,
        )

        choice = response.choices[0]

        if choice.finish_reason == "stop":
            # 最终回答——流式输出
            yield f"data: {json.dumps({'type': 'answer', 'content': choice.message.content})}\n\n"
            break

        if choice.finish_reason == "tool_calls":
            messages.append(choice.message)

            for tool_call in choice.message.tool_calls:
                func_name = tool_call.function.name
                func_args = json.loads(tool_call.function.arguments)

                # 告诉前端：正在调用工具
                yield f"data: {json.dumps({'type': 'tool_call', 'name': func_name, 'args': func_args})}\n\n"

                # 执行工具
                result = TOOL_MAP[func_name](**func_args)

                # 告诉前端：工具返回结果
                yield f"data: {json.dumps({'type': 'tool_result', 'name': func_name, 'result': result})}\n\n"

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result, ensure_ascii=False),
                })

    yield f"data: {json.dumps({'type': 'done'})}\n\n"
```

### 前端展示工具调用过程

```typescript
// Agent 的 SSE 会收到多种类型的事件
interface AgentEvent {
  type: 'tool_call' | 'tool_result' | 'answer' | 'done'
  name?: string
  args?: Record<string, any>
  result?: any
  content?: string
}

// 前端可以展示完整的思考过程：
// [🔧 正在查询天气: city=北京]
// [✅ 天气结果: 22°C, 晴]
// [💬 AI 回答: 今天北京天气晴朗...]
```

这让用户能看到 AI 的"思考过程"——调了什么工具、拿到什么结果、最终怎么回答。比黑盒回答更有信任感。

---

## Agent 框架对比

### 方案一：原生实现（上面的代码）

- **优点**：完全可控，无依赖，代码量少
- **缺点**：复杂场景需要自己写循环、错误处理、多 Agent 协作
- **适合**：工具少于 10 个的简单场景

### 方案二：LangChain

```python
from langchain.agents import create_openai_tools_agent, AgentExecutor
from langchain_openai import ChatOpenAI
from langchain.tools import tool

@tool
def get_weather(city: str) -> str:
    """获取城市天气"""
    return f"{city}今天 22°C，晴"

llm = ChatOpenAI(model="deepseek-chat", base_url="https://api.deepseek.com")
agent = create_openai_tools_agent(llm, [get_weather], prompt)
executor = AgentExecutor(agent=agent, tools=[get_weather])

result = executor.invoke({"input": "北京天气"})
```

- **优点**：生态丰富，300+ 内置工具，文档链/记忆链
- **缺点**：抽象层多，调试困难，升级频繁
- **适合**：快速原型、需要大量第三方集成

### 方案三：Google ADK

```python
from google.adk.agents import Agent
from google.adk.tools import FunctionTool

def get_weather(city: str) -> dict:
    return {"temperature": 22, "weather": "晴"}

agent = Agent(
    model="gemini-2.0-flash",
    tools=[FunctionTool(get_weather)],
    instruction="你是一个天气助手",
)
```

- **优点**：Google 官方，和 Gemini 深度集成，多 Agent 协作
- **缺点**：只支持 Gemini 模型，生态较新
- **适合**：Google 技术栈，需要多 Agent 编排

### 我的建议

| 场景 | 推荐方案 |
|------|---------|
| 简单 Agent（<10 个工具） | 原生 Function Calling |
| 需要 RAG + Agent 组合 | LangChain |
| 多 Agent 协排 | Google ADK |
| 学习入门 | 原生实现（理解原理）→ 再上框架 |

---

## 安全边界：AI 能做什么，不能做什么

Agent 能调用工具就意味着**有副作用**——查询天气是只读的，但"删除文件"、"发邮件"、"转账"是有风险的。

### 原则：读操作自动执行，写操作需要确认

```python
# 工具分类
SAFE_TOOLS = {"get_weather", "get_exchange_rate", "search_web"}
DANGEROUS_TOOLS = {"send_email", "delete_file", "execute_sql"}

async def agent_stream(user_message):
    # ...
    for tool_call in choice.message.tool_calls:
        func_name = tool_call.function.name

        if func_name in DANGEROUS_TOOLS:
            # 发给前端确认
            yield f"data: {json.dumps({'type': 'confirm', 'name': func_name, 'args': func_args})}\n\n"
            # 等待前端确认后再执行
            return

        # 安全工具直接执行
        result = TOOL_MAP[func_name](**func_args)
```

前端收到 `confirm` 类型事件时，弹窗让用户确认："AI 想要执行 send_email(to=xxx)，是否允许？"

### 其他安全措施

1. **工具白名单**：只暴露你明确允许的工具
2. **参数校验**：SQL 查询只允许 SELECT，不允许 DELETE/DROP
3. **速率限制**：同一个工具不能每秒调 100 次
4. **日志记录**：所有工具调用都记日志，方便审计

---

## 实战：多工具 Agent

做一个能查天气、查汇率、搜网页的 Agent。

```python
import httpx

async def search_web(query: str) -> str:
    """搜索网页（简化示例，实际用 Bing/Google API）"""
    # 这里用 DuckDuckGo 的非官方 API 做演示
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.duckduckgo.com/",
            params={"q": query, "format": "json"},
        )
        data = resp.json()
        return data.get("AbstractText", "未找到相关结果")

tools = [
    # ... get_weather, get_exchange_rate 定义 ...
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "搜索互联网获取信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                },
                "required": ["query"],
            },
        },
    },
]
```

现在 AI 可以自己决定什么时候查天气、什么时候查汇率、什么时候搜网页——甚至可以组合调用多个工具来回答一个复杂问题。

```
用户: "我下周去东京出差，帮我看看那边天气，再算一下 5000 人民币换多少日元"

AI: [调用 get_weather(city="东京")]
    [调用 get_exchange_rate(from="CNY", to="JPY")]
    → "东京下周预计 18°C 多云。按当前汇率 1 CNY ≈ 20.5 JPY，
       5000 人民币约等于 102,500 日元。建议带一件薄外套。"
```

---

## 总结

1. **Agent = AI + 工具调用**——AI 负责理解需求和决策，工具负责执行操作。
2. **Function Calling 是标准能力**——定义工具 Schema，AI 自己决定什么时候调哪个工具。
3. **Agent 主循环**：发消息 → AI 决定是否调工具 → 执行工具 → 结果返回 AI → 生成回答。
4. **前端展示工具调用过程**——让用户看到 AI 的"思考"过程，增加信任。
5. **安全边界很重要**——读操作自动执行，写操作需要用户确认。
6. **入门用原生实现**——理解原理后再上 LangChain / ADK 框架。

**下一篇**，我们做一个有趣的应用——AI + 低代码：用自然语言生成页面、表单和图表。

---

> **下一篇预告**：[17 | AI + 低代码：用自然语言生成页面 / 表单 / 图表](/series/junior/17-ai-lowcode)

---

**讨论话题**：你用过 AI Agent 吗？觉得 Function Calling 最适合哪些场景？安全边界怎么划？评论区聊聊。
