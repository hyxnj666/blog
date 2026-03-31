---
title: "多模型适配：一套代码接 6 家 AI 厂商"
description: "OpenAI 兼容格式、Claude 特殊处理、封装统一 AI Client、本地 Ollama 部署"
order: 4
cover: "./cover.png"
publishDate: "2025-07-01"
tags: ["多模型", "AI Client", "OpenAI", "Claude", "Ollama"]
---

# 多模型适配：一套代码接 6 家 AI 厂商

> 本文是【前端转 AI 全栈实战】系列第 04 篇。
> 上一篇：[用 JS 和 Python 分别调通你的第一个 AI API](/series/junior/03-first-ai-api) | 下一篇：[流式输出：让 AI 回复像 ChatGPT 一样打字机效果](/series/junior/05-streaming)

---

## 这篇文章你会得到什么

上一篇我们用 DeepSeek 调通了第一个 AI API。但现实中你不可能只用一家——DeepSeek 偶尔限流、某些场景 GPT-4o 效果更好、公司内网只能用 Ollama 本地模型……

如果每换一个厂商就重写一遍调用逻辑，维护成本会指数级上升。

今天的目标：**封装一个统一的 `callAI()` 函数，JS 和 Python 各一个，一套代码同时支持 6 家 AI 厂商**。做完这篇，你以后切换模型只需要改一行配置。

---

## 为什么不应该绑死一家 AI 厂商

先说个我自己踩过的坑：去年项目上线初期，所有 AI 调用全走 DeepSeek。有一天它大规模限流，整个系统的 AI 功能直接瘫了。

从那之后我学到一个原则——**AI 服务必须有 fallback**。

绑死一家厂商的风险：

| 风险 | 具体场景 |
|------|----------|
| **服务不可用** | 厂商限流、宕机、API 变更 |
| **效果不达标** | 某些任务 A 厂商好，某些 B 好 |
| **成本失控** | 厂商涨价，没有替代方案 |
| **合规限制** | 涉敏数据必须本地部署（Ollama） |
| **区域限制** | 国内用不了 OpenAI，海外用不了通义 |

实际项目中的常见策略：

- **日常用 DeepSeek**（便宜快速）
- **效果要求高时切 GPT-4o 或 Claude**
- **内网/敏感数据用 Ollama 本地模型**
- **任何一家挂了，自动 fallback 到备选**

要实现这些，前提是你的代码必须和具体厂商解耦。

---

## OpenAI 兼容格式：一种协议统一大多数厂商

好消息是，AI API 领域有一个事实标准—— **OpenAI 的 Chat Completions 格式**。

上一篇你已经见过了：

```json
{
  "model": "deepseek-chat",
  "messages": [
    { "role": "user", "content": "你好" }
  ]
}
```

这个请求格式（messages 数组 + model 字段），被大量厂商直接兼容。意思是：**只要换 URL 和 Key，同一段代码可以直接调通**。

兼容 OpenAI 格式的主流厂商：

| 厂商 | base_url | 模型名示例 |
|------|----------|-----------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` / `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` / `deepseek-reasoner` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` / `qwen-turbo` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` |
| Ollama | `http://localhost:11434/v1` | `qwen2.5` / `llama3` |
| 零一万物 | `https://api.lingyiwanwu.com/v1` | `yi-large` |

看到了吗？这些厂商的 API 端点不同、模型名不同，但**请求和响应的 JSON 结构完全一样**。

也就是说，你用 `openai` SDK 只需改两个参数：

**JavaScript：**

```javascript
import OpenAI from 'openai';

// DeepSeek
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// 通义千问
const qwen = new OpenAI({
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.QWEN_API_KEY,
});

// Ollama（本地，不需要 Key）
const ollama = new OpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',
});
```

**Python：**

```python
from openai import OpenAI

deepseek = OpenAI(
    base_url="https://api.deepseek.com",
    api_key=os.getenv("DEEPSEEK_API_KEY"),
)

qwen = OpenAI(
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    api_key=os.getenv("QWEN_API_KEY"),
)

ollama = OpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama",
)
```

调用方式完全一样，都是 `client.chat.completions.create(...)`。

---

## Claude 的特殊处理

6 家厂商里有一个"异类"——**Anthropic 的 Claude**。

Claude 没有兼容 OpenAI 格式，它用的是自己的 Messages API，请求结构有几个关键差异：

| 对比项 | OpenAI 格式 | Claude 格式 |
|--------|-------------|-------------|
| system message | 放在 messages 数组里 | 单独的 `system` 字段 |
| 模型参数 | `model` | `model` |
| 最大 token | `max_tokens`（可选） | `max_tokens`（**必填**） |
| 返回结构 | `choices[0].message.content` | `content[0].text` |

**JavaScript 调用 Claude：**

```javascript
import Anthropic from '@anthropic-ai/sdk';

const claude = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const response = await claude.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  system: '你是一个友好的助手。',
  messages: [
    { role: 'user', content: '你好' }
  ],
});

console.log(response.content[0].text);
```

**Python 调用 Claude：**

```python
import anthropic

client = anthropic.Anthropic(api_key=os.getenv("CLAUDE_API_KEY"))

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    system="你是一个友好的助手。",
    messages=[
        {"role": "user", "content": "你好"}
    ],
)

print(response.content[0].text)
```

差异不大，但足以让你的代码分出两条路径。这就是为什么需要封装——**把差异藏在统一接口后面**。

---

## 封装统一 AI Client

思路很简单：定义一个统一的调用接口，内部根据 provider 分发到不同的 SDK。

### 配置结构设计

先设计一个配置对象，把所有厂商的信息集中管理：

**JavaScript（config.js）：**

```javascript
const AI_PROVIDERS = {
  deepseek: {
    type: 'openai-compatible',
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
    defaultModel: 'deepseek-chat',
  },
  openai: {
    type: 'openai-compatible',
    baseURL: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: 'gpt-4o-mini',
  },
  qwen: {
    type: 'openai-compatible',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env.QWEN_API_KEY,
    defaultModel: 'qwen-plus',
  },
  gemini: {
    type: 'openai-compatible',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: process.env.GEMINI_API_KEY,
    defaultModel: 'gemini-2.0-flash',
  },
  ollama: {
    type: 'openai-compatible',
    baseURL: 'http://localhost:11434/v1',
    apiKey: 'ollama',
    defaultModel: 'qwen2.5',
  },
  claude: {
    type: 'anthropic',
    apiKey: process.env.CLAUDE_API_KEY,
    defaultModel: 'claude-sonnet-4-20250514',
  },
};
```

**Python（config.py）：**

```python
import os

AI_PROVIDERS = {
    "deepseek": {
        "type": "openai-compatible",
        "base_url": "https://api.deepseek.com",
        "api_key": os.getenv("DEEPSEEK_API_KEY"),
        "default_model": "deepseek-chat",
    },
    "openai": {
        "type": "openai-compatible",
        "base_url": "https://api.openai.com/v1",
        "api_key": os.getenv("OPENAI_API_KEY"),
        "default_model": "gpt-4o-mini",
    },
    "qwen": {
        "type": "openai-compatible",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "api_key": os.getenv("QWEN_API_KEY"),
        "default_model": "qwen-plus",
    },
    "gemini": {
        "type": "openai-compatible",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "api_key": os.getenv("GEMINI_API_KEY"),
        "default_model": "gemini-2.0-flash",
    },
    "ollama": {
        "type": "openai-compatible",
        "base_url": "http://localhost:11434/v1",
        "api_key": "ollama",
        "default_model": "qwen2.5",
    },
    "claude": {
        "type": "anthropic",
        "api_key": os.getenv("CLAUDE_API_KEY"),
        "default_model": "claude-sonnet-4-20250514",
    },
}
```

注意 `type` 字段——只有两种：`openai-compatible` 和 `anthropic`。5 家走同一条路，Claude 单独处理。

### 实现统一 callAI 函数

**JavaScript 完整实现（ai-client.js）：**

```javascript
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const AI_PROVIDERS = { /* 同上 */ };

// 缓存 client 实例，避免重复创建
const clientCache = new Map();

function getClient(provider) {
  if (clientCache.has(provider)) return clientCache.get(provider);

  const config = AI_PROVIDERS[provider];
  if (!config) throw new Error(`未知的 AI 厂商: ${provider}`);

  let client;
  if (config.type === 'anthropic') {
    client = new Anthropic({ apiKey: config.apiKey });
  } else {
    client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey });
  }

  clientCache.set(provider, client);
  return client;
}

/**
 * @param {Object} options
 * @param {string} options.provider - 厂商标识：deepseek / openai / qwen / gemini / ollama / claude
 * @param {string} [options.model] - 模型名，不传则用厂商默认模型
 * @param {Array} options.messages - 对话消息数组
 * @param {string} [options.system] - 系统提示词
 * @param {number} [options.temperature=0.7]
 * @param {number} [options.maxTokens=2048]
 * @returns {Promise<string>} AI 回复文本
 */
export async function callAI({
  provider = 'deepseek',
  model,
  messages,
  system,
  temperature = 0.7,
  maxTokens = 2048,
}) {
  const config = AI_PROVIDERS[provider];
  if (!config) throw new Error(`未知的 AI 厂商: ${provider}`);

  const client = getClient(provider);
  const modelName = model || config.defaultModel;

  if (config.type === 'anthropic') {
    // Claude 走 Anthropic SDK
    const response = await client.messages.create({
      model: modelName,
      max_tokens: maxTokens,
      temperature,
      system: system || undefined,
      messages,
    });
    return response.content[0].text;
  }

  // OpenAI 兼容厂商走统一路径
  const fullMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  const response = await client.chat.completions.create({
    model: modelName,
    messages: fullMessages,
    temperature,
    max_tokens: maxTokens,
  });

  return response.choices[0].message.content;
}
```

**Python 完整实现（ai_client.py）：**

```python
import os
from openai import OpenAI
import anthropic

AI_PROVIDERS = { ... }  # 同上

_client_cache = {}

def _get_client(provider: str):
    if provider in _client_cache:
        return _client_cache[provider]

    config = AI_PROVIDERS.get(provider)
    if not config:
        raise ValueError(f"未知的 AI 厂商: {provider}")

    if config["type"] == "anthropic":
        client = anthropic.Anthropic(api_key=config["api_key"])
    else:
        client = OpenAI(base_url=config["base_url"], api_key=config["api_key"])

    _client_cache[provider] = client
    return client


def call_ai(
    messages: list,
    provider: str = "deepseek",
    model: str = None,
    system: str = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> str:
    config = AI_PROVIDERS.get(provider)
    if not config:
        raise ValueError(f"未知的 AI 厂商: {provider}")

    client = _get_client(provider)
    model_name = model or config["default_model"]

    if config["type"] == "anthropic":
        response = client.messages.create(
            model=model_name,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system or anthropic.NOT_GIVEN,
            messages=messages,
        )
        return response.content[0].text

    full_messages = messages
    if system:
        full_messages = [{"role": "system", "content": system}] + messages

    response = client.chat.completions.create(
        model=model_name,
        messages=full_messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return response.choices[0].message.content
```

### 使用起来有多简单

封装完之后，切换厂商只需要改一个参数：

**JavaScript：**

```javascript
// 用 DeepSeek
const reply1 = await callAI({
  provider: 'deepseek',
  messages: [{ role: 'user', content: '解释一下什么是 REST API' }],
});

// 切换到 GPT-4o，只改一个字段
const reply2 = await callAI({
  provider: 'openai',
  model: 'gpt-4o',
  messages: [{ role: 'user', content: '解释一下什么是 REST API' }],
});

// 用本地 Ollama，零成本
const reply3 = await callAI({
  provider: 'ollama',
  messages: [{ role: 'user', content: '解释一下什么是 REST API' }],
});
```

**Python：**

```python
# 用 DeepSeek
reply1 = call_ai(
    provider="deepseek",
    messages=[{"role": "user", "content": "解释一下什么是 REST API"}],
)

# 切换到 Claude
reply2 = call_ai(
    provider="claude",
    system="用简单易懂的方式回答问题。",
    messages=[{"role": "user", "content": "解释一下什么是 REST API"}],
)

# 本地 Ollama
reply3 = call_ai(
    provider="ollama",
    messages=[{"role": "user", "content": "解释一下什么是 REST API"}],
)
```

**一行代码切换厂商**——这就是封装的价值。

---

## 进阶：自动 Fallback

真实项目中，我一般还会加一个自动降级逻辑：主厂商调用失败时，自动切换到备选厂商。

**JavaScript：**

```javascript
async function callAIWithFallback({
  providers = ['deepseek', 'qwen', 'ollama'],
  messages,
  system,
  temperature,
  maxTokens,
}) {
  for (const provider of providers) {
    try {
      return await callAI({ provider, messages, system, temperature, maxTokens });
    } catch (err) {
      console.warn(`[${provider}] 调用失败: ${err.message}，尝试下一个...`);
    }
  }
  throw new Error('所有 AI 厂商均不可用');
}
```

**Python：**

```python
def call_ai_with_fallback(
    messages: list,
    providers: list = ["deepseek", "qwen", "ollama"],
    **kwargs,
) -> str:
    last_error = None
    for provider in providers:
        try:
            return call_ai(messages=messages, provider=provider, **kwargs)
        except Exception as e:
            print(f"[{provider}] 调用失败: {e}，尝试下一个...")
            last_error = e
    raise RuntimeError(f"所有 AI 厂商均不可用，最后错误: {last_error}")
```

调用时：

```javascript
// 优先 DeepSeek → 失败走通义千问 → 再失败走本地 Ollama
const reply = await callAIWithFallback({
  providers: ['deepseek', 'qwen', 'ollama'],
  messages: [{ role: 'user', content: '你好' }],
});
```

这个策略在我实际项目里救过好几次场。

---

## Ollama 本地部署：零成本练手

如果你还没注册任何 AI 服务的 API Key，或者想在完全离线的环境下练习，Ollama 是最佳选择。

### 什么是 Ollama

Ollama 是一个本地大模型运行工具，可以在你自己的电脑上跑开源模型。优势：

- **完全免费**，不需要 API Key
- **数据不出本机**，零隐私风险
- **兼容 OpenAI API 格式**，和我们的 `callAI()` 无缝对接

### 安装和使用

**1. 安装 Ollama**

到 [ollama.com](https://ollama.com) 下载安装，支持 Windows / Mac / Linux。

**2. 拉取模型**

```bash
# 推荐先拉一个轻量模型（约 1.6GB）
ollama pull qwen2.5:3b

# 如果电脑配置好（16GB+ 内存），可以拉更大的
ollama pull qwen2.5:7b
```

**3. 验证能不能用**

```bash
# 启动一个交互对话
ollama run qwen2.5:3b
```

输入问题，能回答就说明装好了。按 `Ctrl+D` 退出。

**4. 用代码调用**

Ollama 启动后默认在 `http://localhost:11434` 提供 API 服务，兼容 OpenAI 格式。

用我们封装好的 `callAI()` 直接调：

```javascript
const reply = await callAI({
  provider: 'ollama',
  model: 'qwen2.5:3b',
  messages: [{ role: 'user', content: '用一句话解释什么是前端' }],
});
```

```python
reply = call_ai(
    provider="ollama",
    model="qwen2.5:3b",
    messages=[{"role": "user", "content": "用一句话解释什么是前端"}],
)
```

**零配置、零费用**——非常适合学习阶段反复调试。

### Ollama 常用模型推荐

| 模型 | 大小 | 适合场景 | 拉取命令 |
|------|------|---------|---------|
| `qwen2.5:3b` | ~1.6 GB | 轻量练手，中文好 | `ollama pull qwen2.5:3b` |
| `qwen2.5:7b` | ~4.4 GB | 日常开发够用 | `ollama pull qwen2.5:7b` |
| `llama3.2:3b` | ~2 GB | Meta 开源，英文强 | `ollama pull llama3.2:3b` |
| `deepseek-r1:7b` | ~4.7 GB | 推理能力强 | `ollama pull deepseek-r1:7b` |
| `codellama:7b` | ~3.8 GB | 专攻代码生成 | `ollama pull codellama:7b` |

> 提示：模型越大效果越好，但也越吃内存和显存。8GB 内存的电脑跑 3b 模型就很流畅了。

---

## 六家厂商对比速查表

最后放一个速查表，方便你按需选择：

| 厂商 | 价格 | 中文能力 | 代码能力 | 国内可用 | 格式 |
|------|------|---------|---------|---------|------|
| **DeepSeek** | 极低 | ★★★★★ | ★★★★ | ✅ | OpenAI 兼容 |
| **通义千问** | 低 | ★★★★★ | ★★★★ | ✅ | OpenAI 兼容 |
| **GPT-4o** | 高 | ★★★★ | ★★★★★ | ❌（需代理） | OpenAI 原生 |
| **Claude** | 高 | ★★★★ | ★★★★★ | ❌（需代理） | Anthropic 独立 |
| **Gemini** | 中 | ★★★★ | ★★★★ | ❌（需代理） | OpenAI 兼容 |
| **Ollama** | 免费 | 取决于模型 | 取决于模型 | ✅（本地） | OpenAI 兼容 |

**我的推荐组合**：日常开发用 DeepSeek + 本地 Ollama 练手，重要任务切 GPT-4o 或 Claude。

---

## 总结

1. **不要绑死一家 AI 厂商**——服务中断、效果差异、成本波动都是真实风险。
2. **OpenAI Chat Completions 格式是事实标准**，5/6 家厂商都兼容，`openai` SDK 换个 `baseURL` 就能用。
3. **Claude 是唯一的"异类"**，需要单独用 `anthropic` SDK，注意 `system` 字段和 `max_tokens` 必填。
4. **封装统一 `callAI()` 函数**后，切换厂商只需改一个 `provider` 参数。
5. **Fallback 机制**是生产环境必备——主厂商挂了自动切备选。
6. **Ollama** 是学习阶段的最佳伙伴——免费、离线、兼容 OpenAI 格式。

**下一篇**，我们来解决另一个实际痛点：AI 的回复要等好几秒才一次性出来，用户体验很差。怎么做到像 ChatGPT 那样一个字一个字"打"出来？答案是流式输出（Streaming）。

---

> **下一篇预告**：[05 | 流式输出：让 AI 回复像 ChatGPT 一样打字机效果](/series/junior/05-streaming)

---

**讨论话题**：你目前在用哪家 AI 服务？有没有遇到过服务挂了束手无策的情况？你觉得哪个厂商性价比最高？欢迎评论区聊聊。
