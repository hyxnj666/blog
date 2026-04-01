---
title: "AI 应用的成本优化：从月花 $100 到 $5"
description: "五大策略将 AI 应用成本降低 99%：模型降级、缓存、Prompt 压缩等"
order: 23
cover: "./cover.png"
publishDate: "2025-10-31"
tags: ["成本优化", "AI工程化", "缓存策略", "Prompt优化"]
---

# AI 应用的成本优化：从月花 $100 到 $5

> 本文是【前端转 AI 全栈实战】系列第 23 篇。
> 上一篇：[多模态 AI API：不只是文本，图片和语音也能玩](/series/junior/22-multimodal-ai) | 下一篇：[AI 应用的测试和质量保障](/series/junior/24-testing)

---

## 这篇文章你会得到什么

做 AI 应用最容易被忽视的问题——**花钱太快**。

一个小项目，每天几百次 API 调用，用 GPT-4o 一个月就是几百美元。如果上线后用户量增长，成本可以指数级爆炸。

但大多数场景下，**90% 的成本是可以省掉的**。这一篇教你怎么从月花 $100 降到 $5，而且效果几乎不变。

---

## Token 计费基础

### 什么是 Token

Token ≈ 词的碎片。英文大约 1 token = 0.75 个单词，中文大约 1 token = 0.5-1 个字。

```
"Hello, world!" → 4 tokens
"你好，世界！" → 4-5 tokens (取决于模型的分词器)
```

### Input vs Output 定价不同

| 模型 | Input 价格 | Output 价格 | 说明 |
|------|-----------|-------------|------|
| GPT-4o | $2.5/M | $10/M | 贵但综合能力强 |
| GPT-4o-mini | $0.15/M | $0.6/M | 便宜 16 倍 |
| DeepSeek Chat | ¥1/M | ¥2/M | 国产性价比王 |
| Claude 3.5 Sonnet | $3/M | $15/M | 推理强但 output 贵 |

**M = 百万 tokens**

### 一次调用成本计算

```javascript
function estimateCost(inputTokens, outputTokens, model = "gpt-4o-mini") {
  const pricing = {
    "gpt-4o":      { input: 2.5,  output: 10 },
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "deepseek":    { input: 0.14, output: 0.28 }, // ¥1/M ≈ $0.14/M
  };

  const p = pricing[model];
  const cost = (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  return cost; // 美元
}

// 一次对话：500 input + 200 output
estimateCost(500, 200, "gpt-4o");      // $0.00325
estimateCost(500, 200, "gpt-4o-mini"); // $0.000195  ← 便宜 16 倍
estimateCost(500, 200, "deepseek");    // $0.000126  ← 便宜 25 倍
```

---

## 策略一：模型降级——80% 的任务不需要顶级模型

这是**最有效**的一招。

| 任务类型 | 推荐模型 | 为什么 |
|---------|---------|--------|
| 简单分类/提取 | GPT-4o-mini / DeepSeek | 准确率差距 <5% |
| 翻译 | DeepSeek | 中英翻译质量很好 |
| 代码生成 | Claude 3.5 Sonnet | 代码质量明显更好 |
| 文本摘要 | GPT-4o-mini | 够用 |
| 复杂推理/分析 | GPT-4o / Claude | 只有这类才值得用贵模型 |
| JSON 结构化输出 | GPT-4o-mini | 格式稳定 |

```javascript
function selectModel(taskType) {
  const modelMap = {
    classify:    "deepseek-chat",
    translate:   "deepseek-chat",
    summarize:   "gpt-4o-mini",
    generate:    "gpt-4o-mini",
    code:        "claude-3-5-sonnet-20241022",
    reasoning:   "gpt-4o",
  };
  return modelMap[taskType] || "gpt-4o-mini";
}
```

**实际效果**：把默认模型从 GPT-4o 换成 GPT-4o-mini，月成本直降 90%+。

---

## 策略二：Prompt 压缩

Prompt 越长，input token 越多，成本越高。

### 精简 System Prompt

```
❌ 冗长版（~300 tokens）：
"你是一个专业的技术文档翻译专家，擅长将英文技术文档翻译成中文。你需要
保持原文的技术准确性，同时使用自然流畅的中文表达。对于专业术语，保留
英文原文并在括号中给出中文解释。请确保翻译后的文本格式与原文一致，
包括标题层级、代码块、列表等。不要添加原文没有的内容..."

✅ 精简版（~80 tokens）：
"技术文档翻译。规则：保留术语英文+括号中文、保持格式、不加内容。"
```

省了 ~220 tokens，每次调用节省 ~70%。一万次调用就是 220 万 tokens。

### 动态上下文——只传需要的

```javascript
// ❌ 每次都传完整的对话历史
messages: fullHistory // 可能 50 条消息，几千 tokens

// ✅ 只传最近 N 条
function trimHistory(history, maxMessages = 10) {
  if (history.length <= maxMessages) return history;
  const systemMsg = history.find(m => m.role === "system");
  const recent = history.slice(-maxMessages);
  return systemMsg ? [systemMsg, ...recent] : recent;
}
```

### 上下文摘要压缩

```javascript
async function compressHistory(history) {
  if (history.length < 20) return history;

  // 把前面的对话压缩成摘要
  const oldMessages = history.slice(0, -10);
  const recentMessages = history.slice(-10);

  const summary = await callAI(
    "用 100 字概括以下对话的关键信息",
    oldMessages.map(m => `${m.role}: ${m.content}`).join("\n"),
    { model: "gpt-4o-mini", max_tokens: 200 }
  );

  return [
    { role: "system", content: `之前的对话摘要：${summary}` },
    ...recentMessages,
  ];
}
```

---

## 策略三：缓存——相同问题不重复花钱

很多 AI 调用的输入是重复的。同一个页面翻译、同一段代码审查——结果都一样，为什么要花两次钱？

### 简单内存缓存

```javascript
const cache = new Map();

async function callAIWithCache(prompt, options = {}) {
  const cacheKey = JSON.stringify({ prompt, model: options.model });
  const ttl = options.cacheTTL || 3600000; // 默认 1 小时

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < ttl) {
    return cached.result;
  }

  const result = await callAI(prompt, options);

  cache.set(cacheKey, { result, time: Date.now() });

  // 防止内存泄漏
  if (cache.size > 1000) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }

  return result;
}
```

### Redis 缓存（生产环境）

```python
import hashlib
import json
import redis

r = redis.Redis(host="localhost", port=6379, db=0)

def call_ai_cached(prompt: str, model: str = "gpt-4o-mini", ttl: int = 3600):
    cache_key = f"ai:{hashlib.md5(f'{model}:{prompt}'.encode()).hexdigest()}"

    cached = r.get(cache_key)
    if cached:
        return json.loads(cached)

    result = call_ai(prompt, model=model)

    r.setex(cache_key, ttl, json.dumps(result, ensure_ascii=False))
    return result
```

### 语义缓存（高级）

"请假流程是什么"和"怎么请假"是同一个问题，但文本不同。

用 Embedding 做相似度匹配，语义相似的问题命中同一条缓存：

```python
def semantic_cache_get(query: str, threshold: float = 0.95):
    query_embedding = get_embedding(query)

    # 在已有缓存的 embedding 中找最相似的
    for key, item in cache_store.items():
        similarity = cosine_similarity(query_embedding, item["embedding"])
        if similarity > threshold:
            return item["result"]

    return None
```

---

## 策略四：本地模型兜底

用 Ollama 跑本地小模型，处理简单任务**完全免费**。

```bash
# 安装 Ollama（本地运行 AI 模型）
# https://ollama.ai
ollama pull qwen2:7b    # 通义千问 7B，中文好
ollama pull llama3:8b    # Llama 3 8B，英文好
```

```javascript
// Ollama API 兼容 OpenAI 格式
import OpenAI from "openai";

const localClient = new OpenAI({
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama", // Ollama 不需要 key，随便填
});

async function callLocal(prompt) {
  const response = await localClient.chat.completions.create({
    model: "qwen2:7b",
    messages: [{ role: "user", content: prompt }],
  });
  return response.choices[0].message.content;
}
```

### 分级策略

```javascript
async function smartCall(prompt, taskType) {
  // 简单任务 → 本地模型（免费）
  if (["classify", "extract_keywords", "format"].includes(taskType)) {
    return callLocal(prompt);
  }

  // 中等任务 → 便宜的云模型
  if (["translate", "summarize", "qa"].includes(taskType)) {
    return callCloud(prompt, { model: "deepseek-chat" });
  }

  // 复杂任务 → 最好的模型
  return callCloud(prompt, { model: "gpt-4o" });
}
```

---

## 策略五：减少不必要的调用

### 前端防抖

```javascript
// 用户打字时不要每个字都调 AI
function debounce(fn, delay = 1000) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const debouncedAI = debounce(async (input) => {
  const result = await callAI(input);
  renderResult(result);
}, 1000);

inputEl.addEventListener("input", (e) => debouncedAI(e.target.value));
```

### 客户端预判断

```javascript
async function handleUserInput(input) {
  // 太短的输入不调 AI
  if (input.trim().length < 5) {
    return "请输入更详细的问题";
  }

  // 纯打招呼不调 AI
  const greetings = ["你好", "hi", "hello", "在吗"];
  if (greetings.includes(input.trim().toLowerCase())) {
    return "你好！有什么可以帮你的？";
  }

  // 重复问题不调 AI
  if (input === lastInput) {
    return lastResult;
  }

  return callAI(input);
}
```

### 限制 max_tokens

```javascript
// ❌ 不设限，AI 可能输出 4000 tokens
await callAI(prompt);

// ✅ 按任务设限
await callAI(prompt, { max_tokens: 200 });  // 分类任务
await callAI(prompt, { max_tokens: 500 });  // 摘要任务
await callAI(prompt, { max_tokens: 2000 }); // 代码生成
```

---

## 成本监控

不监控就不知道钱花在哪。

```python
# 简单的成本追踪
import time

class CostTracker:
    def __init__(self):
        self.records = []

    def log(self, model, input_tokens, output_tokens, task_type):
        pricing = {
            "gpt-4o":      {"input": 2.5,  "output": 10},
            "gpt-4o-mini": {"input": 0.15, "output": 0.6},
            "deepseek":    {"input": 0.14, "output": 0.28},
        }
        p = pricing.get(model, pricing["gpt-4o-mini"])
        cost = (input_tokens * p["input"] + output_tokens * p["output"]) / 1_000_000

        self.records.append({
            "time": time.time(),
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost": cost,
            "task_type": task_type,
        })

    def daily_report(self):
        today = [r for r in self.records if r["time"] > time.time() - 86400]
        total_cost = sum(r["cost"] for r in today)
        by_model = {}
        for r in today:
            by_model.setdefault(r["model"], 0)
            by_model[r["model"]] += r["cost"]

        return {
            "total_cost": f"${total_cost:.4f}",
            "calls": len(today),
            "by_model": by_model,
        }
```

---

## 优化效果对比

假设一个 AI 应用每天 1000 次调用，每次平均 500 input + 300 output tokens：

| 策略 | 月成本 | 节省 |
|------|--------|------|
| 全用 GPT-4o | $127.5 | - |
| 换 GPT-4o-mini | $7.65 | 94% |
| + Prompt 压缩 30% | $5.36 | 96% |
| + 缓存命中 50% | $2.68 | 98% |
| + 简单任务用本地模型 | **$1.34** | **99%** |

**从 $127 降到 $1.34，效果几乎不变。**

---

## 总结

1. **模型降级是最大杠杆**——80% 的任务用 GPT-4o-mini 或 DeepSeek 就够了。
2. **Prompt 压缩**——精简 System Prompt、动态裁剪上下文、摘要压缩历史。
3. **缓存**——内存缓存 / Redis 缓存 / 语义缓存，相同问题不花两次钱。
4. **本地模型兜底**——Ollama + 小模型处理简单任务，完全免费。
5. **减少不必要调用**——前端防抖、预判断、限制 max_tokens。
6. **监控**——记录每次调用的 model、tokens、cost，才知道钱花在哪。

---

> **下一篇预告**：[24 | AI 应用的测试和质量保障](/series/junior/24-testing)

---

**讨论话题**：你的 AI 项目每月花多少钱？用了什么省钱策略？评论区聊聊。
