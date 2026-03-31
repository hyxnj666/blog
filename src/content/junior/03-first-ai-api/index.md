---
title: "用 JS 和 Python 分别调通你的第一个 AI API"
description: "注册 API Key、JS 和 Python 双语言调用 Chat Completions API、参数详解、实战命令行 AI 问答"
order: 3
cover: "./cover.png"
publishDate: "2025-06-25"
tags: ["AI API", "JavaScript", "Python", "实战"]
---

# 用 JS 和 Python 分别调通你的第一个 AI API

> 本文是【前端转 AI 全栈实战】系列第 03 篇。
> 上一篇：[AI 全栈技术全景图：前端需要补什么](/series/junior/02-ai-tech-landscape) | 下一篇：[多模型适配：一套代码接 6 家 AI 厂商](/series/junior/04-multi-model-client)

---

## 这篇文章你会得到什么

前两篇聊了方向和全景图，从这篇开始**写代码**。

今天的目标很简单：**用 JS 和 Python 分别调通一个 AI API，各写一个命令行版的 AI 问答机器人。**

做完这篇，你就完成了 AI 应用开发的第一步——从"没调过 AI API"变成"调过了"。听起来很小，但很多人就是卡在这一步。

---

## 第一步：注册 + 获取 API Key

推荐先用 **DeepSeek**，理由：

- **便宜**：约 ¥1/百万 input token，比 OpenAI 便宜 10 倍+
- **快**：国内服务器，延迟低
- **兼容**：完全兼容 OpenAI API 格式，之后切换其他厂商改个 URL 就行

注册流程：

1. 打开 [platform.deepseek.com](https://platform.deepseek.com)
2. 注册账号（手机号即可）
3. 进入控制台 → API Keys → 创建新 Key
4. 复制保存好（只显示一次）

新用户通常有免费额度，学习阶段完全够用。

> 如果你已有 OpenAI 的 Key，也可以直接用。代码一样，只是改一下 Base URL 和 Key。

---

## JS 版：用 Node.js 调 AI API

### 环境准备

确保你有 Node.js 18+（需要原生 fetch 支持）：

```bash
node -v  # 确认 >= 18
```

### 创建项目

```bash
mkdir ai-chat-js && cd ai-chat-js
```

新建一个 `.env` 文件存放 API Key：

```bash
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
```

### 核心代码

新建 `chat.mjs`：

```javascript
import { readFileSync } from 'fs'
import { createInterface } from 'readline'

// 加载 .env
const env = Object.fromEntries(
  readFileSync('.env', 'utf-8')
    .split('\n')
    .filter(line => line.includes('='))
    .map(line => line.split('=').map(s => s.trim()))
)

const API_KEY = env.DEEPSEEK_API_KEY
const BASE_URL = 'https://api.deepseek.com'

async function callAI(messages) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.7,
      max_tokens: 2000,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API 请求失败 (${res.status}): ${err}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

// 交互式聊天
const rl = createInterface({ input: process.stdin, output: process.stdout })
const messages = [{ role: 'system', content: '你是一个有帮助的 AI 助手。' }]

function ask() {
  rl.question('\n你: ', async (input) => {
    if (!input.trim() || input === 'exit') {
      console.log('再见！')
      rl.close()
      return
    }

    messages.push({ role: 'user', content: input })

    try {
      const reply = await callAI(messages)
      console.log(`\nAI: ${reply}`)
      messages.push({ role: 'assistant', content: reply })
    } catch (err) {
      console.error(`\n错误: ${err.message}`)
    }

    ask()
  })
}

console.log('AI 聊天机器人（输入 exit 退出）')
ask()
```

### 运行

```bash
node chat.mjs
```

效果：

```
AI 聊天机器人（输入 exit 退出）

你: 用一句话解释什么是 API

AI: API 是一组预定义的规则和协议，让不同的软件程序能够互相通信和交换数据。

你: 那 AI API 呢

AI: AI API 是专门提供人工智能能力的接口，你发送文本给它，它返回 AI 生成的回复，比如 ChatGPT 的对话接口。

你: exit
再见！
```

**约 50 行代码**，你就有了一个支持多轮对话的 AI 聊天机器人。

---

## Python 版：用原生 requests 调同一个 API

### 环境准备

确保你有 Python 3.11+：

```bash
python --version  # 确认 >= 3.11
```

推荐用 `uv` 管理 Python 环境（比 pip 快 10 倍）：

```bash
# 安装 uv（如果没有）
pip install uv
```

### 创建项目

```bash
mkdir ai-chat-py && cd ai-chat-py
```

同样新建 `.env` 文件：

```bash
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
```

安装依赖：

```bash
uv pip install requests python-dotenv
```

### 核心代码

新建 `chat.py`：

```python
import os
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("DEEPSEEK_API_KEY")
BASE_URL = "https://api.deepseek.com"


def call_ai(messages: list) -> str:
    res = requests.post(
        f"{BASE_URL}/chat/completions",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
        },
        json={
            "model": "deepseek-chat",
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 2000,
        },
    )
    res.raise_for_status()
    return res.json()["choices"][0]["message"]["content"]


def main():
    print("AI 聊天机器人（输入 exit 退出）")
    messages = [{"role": "system", "content": "你是一个有帮助的 AI 助手。"}]

    while True:
        user_input = input("\n你: ").strip()
        if not user_input or user_input == "exit":
            print("再见！")
            break

        messages.append({"role": "user", "content": user_input})

        try:
            reply = call_ai(messages)
            print(f"\nAI: {reply}")
            messages.append({"role": "assistant", "content": reply})
        except requests.RequestException as err:
            print(f"\n错误: {err}")


if __name__ == "__main__":
    main()
```

### 运行

```bash
python chat.py
```

效果和 JS 版一模一样——因为调的是**同一个 API**。

---

## 同一个 API，两种语言对比

把关键部分放在一起对比，你会发现它们几乎一样：

### 请求发送

**JS：**
```javascript
const res = await fetch(`${BASE_URL}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
  },
  body: JSON.stringify({ model, messages, temperature, max_tokens }),
})
const data = await res.json()
```

**Python：**
```python
res = requests.post(
    f"{BASE_URL}/chat/completions",
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",
    },
    json={"model": model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens},
)
data = res.json()
```

**几乎 1:1 对应。** URL 一样、Header 一样、Body 一样、返回结构一样。差别只在语法层面。

### 核心差异总结

| | JS (Node.js) | Python |
|---|---|---|
| HTTP 请求 | `fetch()` 原生 | `requests.post()` 第三方库 |
| JSON 序列化 | `JSON.stringify()` | `json=` 参数自动处理 |
| 异步 | `async/await` | 同步（也可用 `httpx` 异步） |
| 环境变量 | 手动读 .env | `python-dotenv` 库 |
| 交互输入 | `readline` 模块 | `input()` 内置函数 |
| 代码行数 | ~50 行 | ~35 行 |

Python 代码更短，主要因为 `input()` 是内置的，不需要像 JS 那样用 readline 创建接口。

---

## 请求参数详解

不管 JS 还是 Python，发给 AI API 的参数都是同一套：

```json
{
  "model": "deepseek-chat",
  "messages": [
    { "role": "system", "content": "你是一个有帮助的 AI 助手。" },
    { "role": "user", "content": "你好" }
  ],
  "temperature": 0.7,
  "max_tokens": 2000
}
```

### model

指定用哪个模型。不同厂商有不同的模型名：

| 厂商 | 模型名 |
|------|--------|
| DeepSeek | `deepseek-chat` / `deepseek-reasoner` |
| OpenAI | `gpt-4o` / `gpt-4o-mini` |
| Claude | `claude-sonnet-4-20250514` |
| 通义千问 | `qwen-plus` |

### messages

对话历史数组，每条消息有 `role` 和 `content`：

- **system**：系统指令，告诉 AI 它是谁、怎么回答。放在最前面，只需要一条。
- **user**：用户说的话。
- **assistant**：AI 之前的回复。多轮对话靠把历史消息都带上。

```javascript
const messages = [
  { role: 'system', content: '你是一个前端技术专家。' },
  { role: 'user', content: '什么是 SSE？' },
  { role: 'assistant', content: 'SSE 是 Server-Sent Events...' },
  { role: 'user', content: '它和 WebSocket 有什么区别？' },  // 当前问题
]
```

**每次请求都要把完整的对话历史发过去**——AI 没有记忆，它靠 messages 数组理解上下文。

### temperature

控制回复的"随机性"，范围 0-2：

- **0**：最确定，每次回答几乎一样（适合代码生成、JSON 输出）
- **0.7**：适中，有点创造性（日常对话推荐）
- **1.5+**：很随机，可能胡说八道

### max_tokens

限制回复的最大长度。1 token ≈ 0.75 个英文单词 ≈ 0.5 个中文字。

设成 2000 大约能输出 1000 字中文，日常够用。设太大会增加成本和延迟。

---

## 返回结构

AI API 返回的 JSON 长这样：

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "这是 AI 的回复..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 150,
    "total_tokens": 175
  }
}
```

你需要关心的字段：

- `choices[0].message.content` —— AI 的回复文本
- `usage.total_tokens` —— 本次消耗的 token 数（算钱用）
- `finish_reason` —— `stop` 表示正常结束，`length` 表示被 max_tokens 截断了

---

## 错误处理

调 AI API 常见的错误：

| 状态码 | 含义 | 处理方式 |
|--------|------|---------|
| **401** | API Key 无效或过期 | 检查 Key 是否正确 |
| **429** | 请求太频繁（限流） | 等几秒重试，或降低请求频率 |
| **400** | 参数错误（如 token 超限） | 检查 messages 长度，减少上下文 |
| **500** | 服务端错误 | 稍后重试 |
| **超时** | 模型生成太慢 | 设置合理的 timeout，或换模型 |

实际开发中，429（限流）是最常遇到的。后面的文章会专门讲重试机制和降级策略。

---

## 计算成本

调一次 AI API 要花多少钱？以 DeepSeek 为例：

| 模型 | Input 价格 | Output 价格 |
|------|-----------|------------|
| deepseek-chat | ¥1 / 百万 tokens | ¥2 / 百万 tokens |

一次普通对话大约消耗 500 tokens（input + output），成本约 **¥0.001**——千分之一毛钱。

日常开发学习，一天调几百次也就几毛钱。**不用担心成本，先跑起来再说。**

---

## 用 openai SDK 简化代码（可选）

上面的代码用的是原生 HTTP 请求，好处是理解底层原理。实际开发中可以用官方 SDK 简化：

### JS 版（openai 包）

```bash
npm install openai
```

```javascript
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
})

const response = await client.chat.completions.create({
  model: 'deepseek-chat',
  messages: [{ role: 'user', content: '你好' }],
})

console.log(response.choices[0].message.content)
```

### Python 版（openai 包）

```bash
uv pip install openai
```

```python
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com",
)

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "你好"}],
)

print(response.choices[0].message.content)
```

**两个版本几乎一模一样**——因为 Python 的 `openai` 包和 JS 的 `openai` 包 API 设计是对齐的。

> DeepSeek / 通义千问 / Gemini 都兼容 OpenAI 格式，所以用 `openai` 这个包就能调大部分厂商的 API，只需要换 `baseURL` 和 `apiKey`。

---

## 总结

1. AI API 本质就是一个 **HTTP POST 接口**——发 JSON、收 JSON，和你之前调后端接口没区别。
2. **JS 和 Python 调同一个 API**，请求参数和返回结构完全一样，只是语法不同。
3. 核心参数就四个：`model`、`messages`、`temperature`、`max_tokens`。
4. 多轮对话靠把**完整历史** messages 数组带上，AI 本身没有记忆。
5. DeepSeek 一次对话成本约 ¥0.001，学习阶段**放心调**。
6. `openai` SDK（JS/Python 都有）可以简化代码，且同时兼容多家厂商。

**下一篇**，我们来解决一个实际问题：不想绑死一家 AI 厂商，怎么用一套代码同时适配 OpenAI、DeepSeek、Claude、通义千问、Gemini、Ollama 六家？

---

> **下一篇预告**：[04 | 多模型适配：一套代码接 6 家 AI 厂商](/series/junior/04-multi-model-client)

---

**讨论话题**：你调通了第一个 AI API 了吗？用的哪家服务？遇到什么坑？欢迎评论区交流。
