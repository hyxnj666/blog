---
title: ".env 管理、代理配置、错误处理——AI 应用的工程化基础"
description: "API Key 安全管理、代理配置、错误处理、重试机制和成本控制"
order: 7
cover: "./cover.png"
publishDate: "2025-07-14"
tags: ["工程化", "API Key", "错误处理", "重试", "成本控制"]
---

# .env 管理、代理配置、错误处理——AI 应用的工程化基础

> 本文是【前端转 AI 全栈实战】系列第 07 篇。
> 上一篇：[Prompt 工程：前端最容易忽略的核心技能](/series/junior/06-prompt-engineering) | 下一篇：[从脚本到 CLI 工具：用 Node.js 打造你的第一个 AI 命令行工具](/series/junior/08-cli-tool)

---

## 这篇文章你会得到什么

前六篇我们学会了调 AI API、多模型适配、流式输出、Prompt 工程。技术上已经可以做东西了。

但如果你真的把代码推到 GitHub 或部署到线上，你会被这些问题打回来：

- API Key 写死在代码里被 GitHub 扫描到，Key 被禁用
- 国内网络调 OpenAI/Claude 超时，不知道怎么配代理
- AI 返回 429 限流错误，整个功能就挂了
- Token 用超了才发现，月底账单吓一跳

这些都是**工程化问题**——不涉及 AI 技术本身，但如果不处理好，你的代码永远只是个 Demo。

---

## API Key 安全：你必须遵守的第一条铁律

**铁律：API Key 永远不能出现在代码中。**

不是"尽量不要"，是"绝对不能"。GitHub 上有大量 Bot 在扫描新提交的代码，一旦发现 AI API Key 就会被人利用，几小时内可能刷掉你几百上千的余额。

### Node.js 方案

**1. 安装 dotenv**

```bash
npm install dotenv
```

**2. 创建 .env 文件**

```bash
# .env
DEEPSEEK_API_KEY=sk-xxx
OPENAI_API_KEY=sk-xxx
CLAUDE_API_KEY=sk-ant-xxx
```

**3. 在代码中加载**

```javascript
import 'dotenv/config';

// 现在可以用 process.env.DEEPSEEK_API_KEY
const client = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});
```

**4. 把 .env 加入 .gitignore**

```bash
# .gitignore
.env
.env.local
.env.*.local
```

**5. 提供 .env.example 给其他人参考**

```bash
# .env.example（这个文件可以提交到 Git）
DEEPSEEK_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

### Python 方案

**1. 安装 python-dotenv**

```bash
pip install python-dotenv
```

**2. 在代码中加载**

```python
from dotenv import load_dotenv
import os

load_dotenv()

client = OpenAI(
    base_url="https://api.deepseek.com",
    api_key=os.getenv("DEEPSEEK_API_KEY"),
)
```

### 校验 Key 是否存在

程序启动时就校验，不要等到第一次调用才发现 Key 没配：

```javascript
function validateEnv() {
  const required = ['DEEPSEEK_API_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error(`缺少环境变量: ${missing.join(', ')}`);
    console.error('请复制 .env.example 为 .env 并填写对应的值');
    process.exit(1);
  }
}

validateEnv();
```

```python
def validate_env():
    required = ["DEEPSEEK_API_KEY"]
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        print(f"缺少环境变量: {', '.join(missing)}")
        print("请复制 .env.example 为 .env 并填写对应的值")
        exit(1)

validate_env()
```

---

## 国内网络问题：代理配置

在国内直接调 OpenAI、Claude、Gemini 的 API 会超时。你需要配置 HTTPS 代理。

### Node.js 代理配置

```bash
npm install https-proxy-agent
```

```javascript
import { HttpsProxyAgent } from 'https-proxy-agent';
import OpenAI from 'openai';

const proxyUrl = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  httpAgent: new HttpsProxyAgent(proxyUrl),
});
```

### Python 代理配置

```python
import httpx
from openai import OpenAI

proxy_url = os.getenv("HTTPS_PROXY", "http://127.0.0.1:7890")

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    http_client=httpx.Client(proxy=proxy_url),
)
```

### 按需代理

不是所有厂商都需要代理——DeepSeek、通义千问是国内服务，直连更快：

```javascript
function createClient(provider) {
  const config = AI_PROVIDERS[provider];
  const needsProxy = ['openai', 'claude', 'gemini'].includes(provider);

  const options = {
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  };

  if (needsProxy && process.env.HTTPS_PROXY) {
    options.httpAgent = new HttpsProxyAgent(process.env.HTTPS_PROXY);
  }

  return new OpenAI(options);
}
```

### .env 中的代理配置

```bash
# .env
HTTPS_PROXY=http://127.0.0.1:7890

# 国内厂商不需要代理
DEEPSEEK_API_KEY=sk-xxx
QWEN_API_KEY=sk-xxx

# 海外厂商需要代理
OPENAI_API_KEY=sk-xxx
CLAUDE_API_KEY=sk-ant-xxx
```

---

## 错误处理：AI API 的常见错误

AI API 的错误比普通 API 多得多。以下是你会遇到的主要错误和处理方式：

### 错误类型速查表

| HTTP 状态码 | 含义 | 原因 | 处理方式 |
|------------|------|------|---------|
| **401** | 认证失败 | Key 错误或过期 | 检查 Key，不重试 |
| **429** | 限流 | 请求太频繁 or 额度用完 | 等待后重试 |
| **400** | 请求错误 | Token 超限、参数错误 | 裁剪消息后重试 |
| **500** | 服务端错误 | AI 厂商的问题 | 重试或切换厂商 |
| **503** | 服务不可用 | 厂商过载或维护 | 切换备用厂商 |
| **timeout** | 超时 | 网络问题或响应太慢 | 重试，加代理 |

### 统一错误处理

**JavaScript：**

```javascript
class AIError extends Error {
  constructor(message, code, retryable = false, retryAfter = 0) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
  }
}

function handleAIError(err) {
  if (err.status === 401) {
    return new AIError('API Key 无效或已过期，请检查配置', 401, false);
  }

  if (err.status === 429) {
    const retryAfter = parseInt(err.headers?.['retry-after'] || '60');
    return new AIError(`请求限流，${retryAfter} 秒后重试`, 429, true, retryAfter);
  }

  if (err.status === 400 && err.message?.includes('token')) {
    return new AIError('输入内容过长，超出模型上下文限制', 400, false);
  }

  if (err.status >= 500) {
    return new AIError('AI 服务暂时不可用', err.status, true, 5);
  }

  if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
    return new AIError('请求超时，请检查网络或代理配置', 0, true, 3);
  }

  return new AIError(`AI 调用失败: ${err.message}`, err.status || 0, true, 3);
}
```

**Python：**

```python
from openai import (
    APIConnectionError,
    RateLimitError,
    APIStatusError,
    AuthenticationError,
)

def handle_ai_error(err: Exception) -> dict:
    if isinstance(err, AuthenticationError):
        return {"message": "API Key 无效或已过期", "retryable": False}

    if isinstance(err, RateLimitError):
        return {"message": "请求限流，稍后重试", "retryable": True, "retry_after": 60}

    if isinstance(err, APIConnectionError):
        return {"message": "网络连接失败，请检查代理配置", "retryable": True, "retry_after": 5}

    if isinstance(err, APIStatusError):
        if err.status_code >= 500:
            return {"message": "AI 服务暂时不可用", "retryable": True, "retry_after": 5}
        if "token" in str(err).lower():
            return {"message": "输入内容过长", "retryable": False}

    return {"message": f"AI 调用失败: {err}", "retryable": True, "retry_after": 3}
```

---

## 重试机制

AI API 比普通 API 更需要重试——因为限流、网络波动太常见了。

### 指数退避重试

```javascript
async function callWithRetry(fn, maxRetries = 3) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = handleAIError(err);

      if (!lastError.retryable || attempt === maxRetries) {
        throw lastError;
      }

      // 指数退避：1s → 2s → 4s
      const delay = lastError.retryAfter
        ? lastError.retryAfter * 1000
        : Math.min(1000 * Math.pow(2, attempt), 10000);

      console.warn(`[Retry ${attempt + 1}/${maxRetries}] ${lastError.message}，${delay}ms 后重试`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// 使用
const reply = await callWithRetry(() =>
  client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: '你好' }],
  })
);
```

```python
import time

def call_with_retry(fn, max_retries=3):
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            return fn()
        except Exception as err:
            last_error = handle_ai_error(err)

            if not last_error["retryable"] or attempt == max_retries:
                raise Exception(last_error["message"])

            delay = last_error.get("retry_after", min(2 ** attempt, 10))
            print(f"[Retry {attempt + 1}/{max_retries}] {last_error['message']}，{delay}s 后重试")
            time.sleep(delay)

    raise Exception(last_error["message"])
```

---

## 成本控制：别让 AI 悄悄烧钱

### Token 估算

调 AI 前先估算一下会消耗多少 Token，避免意外高额消费：

```javascript
function estimateTokens(text) {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 2 + otherChars * 0.4);
}

function estimateCost(inputText, estimatedOutputTokens = 500) {
  const inputTokens = estimateTokens(inputText);

  // DeepSeek 价格：input ¥1/百万, output ¥2/百万
  const cost = (inputTokens * 1 + estimatedOutputTokens * 2) / 1_000_000;

  return {
    inputTokens,
    estimatedOutputTokens,
    estimatedCost: `¥${cost.toFixed(4)}`,
  };
}
```

### 实用的成本控制策略

| 策略 | 做法 | 节省比例 |
|------|------|---------|
| **选对模型** | 简单任务用 mini/turbo，复杂任务才用大模型 | 50-80% |
| **控制 max_tokens** | 不需要长回复时设 500-1000 | 20-40% |
| **裁剪上下文** | 不要把整个对话历史都带上 | 30-60% |
| **缓存结果** | 相同请求返回缓存 | 视命中率 |
| **本地 Ollama** | 开发调试阶段用本地模型，零成本 | 100% |

### 开发阶段省钱技巧

```javascript
// 开发环境用便宜模型，生产环境用好模型
const MODEL = process.env.NODE_ENV === 'production'
  ? 'deepseek-chat'
  : 'deepseek-chat'; // DeepSeek 本身就便宜

// 或者开发阶段直接用 Ollama
const DEV_CLIENT = new OpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',
});

const PROD_CLIENT = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const client = process.env.NODE_ENV === 'production' ? PROD_CLIENT : DEV_CLIENT;
```

---

## 项目模板：AI 项目的标准目录结构

最后给一个完整的项目模板，整合本篇所有内容：

```
my-ai-project/
├── .env                 # 环境变量（不提交 Git）
├── .env.example         # 环境变量示例
├── .gitignore           # 忽略 .env
├── package.json
├── src/
│   ├── config.js        # AI 厂商配置
│   ├── ai-client.js     # 统一 AI 调用（第 4 篇封装的）
│   ├── retry.js          # 重试机制
│   ├── errors.js         # 错误处理
│   └── index.js          # 业务代码
└── README.md
```

**.gitignore 必须包含：**

```
.env
.env.local
.env.*.local
node_modules/
__pycache__/
*.pyc
```

---

## 总结

1. **API Key 永远放 .env**，永远加 .gitignore，启动时校验是否存在。
2. **国内调海外 API 需要代理**，用 `https-proxy-agent`（JS）或 `httpx`（Python）配置。国内厂商不需要代理。
3. **AI 错误类型比普通 API 多**——401/429/400/500/timeout 各有不同处理方式。
4. **指数退避重试是标配**——限流和网络波动太常见，不重试等于放弃可用性。
5. **成本控制从开发阶段开始**——用对模型、控制 max_tokens、开发用 Ollama。

这些工程化基础不性感，但它们是"能跑的 Demo"和"能上线的产品"之间的分水岭。

**下一篇**，我们进入 AI 工具开发阶段——用 Node.js 打造你的第一个 AI 命令行工具。

---

> **下一篇预告**：[08 | 从脚本到 CLI 工具：用 Node.js 打造你的第一个 AI 命令行工具](/series/junior/08-cli-tool)

---

**讨论话题**：你有没有因为 API Key 泄露或忘记配代理踩过坑？你的 AI 项目做了哪些工程化处理？评论区聊聊。
