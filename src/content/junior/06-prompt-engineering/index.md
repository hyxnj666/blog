---
title: "Prompt 工程：前端最容易忽略的核心技能"
description: "RCFE 结构化框架、JSON 输出保障、Few-shot 技巧、实战 AI Code Review 工具"
order: 6
cover: "./cover.png"
publishDate: "2025-07-10"
tags: ["Prompt", "JSON", "Few-shot", "Code Review", "实战"]
---

# Prompt 工程：前端最容易忽略的核心技能

> 本文是【前端转 AI 全栈实战】系列第 06 篇。
> 上一篇：[流式输出：让 AI 回复像 ChatGPT 一样打字机效果](/series/junior/05-streaming) | 下一篇：[.env 管理、代理配置、错误处理——AI 应用的工程化基础](/series/junior/07-engineering-basics)

---

## 这篇文章你会得到什么

前面五篇我们搞定了 AI API 调用、多模型适配、流式输出。技术上你已经能让 AI "说话"了。

但你有没有遇到过这种情况：

- 让 AI 翻译，它翻到一半开始解释语法
- 让 AI 输出 JSON，它给你包了一层 Markdown 代码块
- 让 AI 做 Code Review，它输出的格式每次都不一样，前端根本没法解析
- 让 AI 简短回答，它洋洋洒洒写了 2000 字

这些问题的根因只有一个——**Prompt 写得不好**。

Prompt 工程不是"随便写一句话让 AI 理解"。它是一套结构化的设计方法，决定了 AI 输出的质量、稳定性和可用性。对于做 AI 应用的开发者来说，**Prompt 工程是比调 API 重要 10 倍的技能**。

---

## Prompt 的本质：给 AI 写需求文档

想象你是一个产品经理，AI 是一个执行力超强但上下文理解力有限的实习生。

你对实习生说"帮我翻译一下这段话"——他可能翻译得还行，但也可能：

- 翻译完后加一段"希望对你有帮助！"
- 把原文和译文都输出了
- 用了你不想要的文风

但如果你给他一份详细的需求文档：

> **角色**：你是一个专业的中英翻译官。
> **任务**：将用户提供的中文翻译为英文。
> **约束**：只输出译文，不要输出原文。不要添加任何解释、问候或额外内容。
> **风格**：正式商务风格。

——结果会稳定得多。

**Prompt 工程就是给 AI 写需求文档的技术。**

---

## 结构化 Prompt 的四个要素

一个好的 Prompt 包含四个层次——我称之为 **RCFE 框架**：

| 要素 | 英文 | 作用 | 示例 |
|------|------|------|------|
| **R**ole | 角色设定 | 给 AI 一个身份，影响输出的专业度和风格 | "你是一个资深前端代码审查员" |
| **C**ontext | 上下文注入 | 提供必要的背景信息 | "以下是一个 Vue 3 组件的代码" |
| **F**ormat | 输出格式约束 | 精确定义输出结构 | "输出 JSON 格式，包含 score、issues、suggestions 三个字段" |
| **E**xamples | 示例 | 用示例展示期望的输出 | 提供 1-3 个输入输出对 |

### 实际对比

**差的 Prompt：**

```
帮我 Review 一下这段代码
```

AI 回复：一段很长的自由文本，格式不固定，有时候给评分有时候不给，有时候列问题有时候只是泛泛而谈。

**好的 Prompt（RCFE 完整版）：**

```
## Role
你是一个资深前端代码审查员，有 8 年 Vue/React 开发经验。

## Context
用户会提交一段前端代码，请你进行代码审查。

## Format
请严格按以下 JSON 格式输出，不要输出任何 JSON 以外的内容：
{
  "score": <0-100 的整数>,
  "summary": "<一句话总评>",
  "issues": [
    {
      "severity": "error" | "warning" | "info",
      "line": <行号或 null>,
      "description": "<问题描述>",
      "suggestion": "<修复建议>"
    }
  ]
}

## Examples

输入代码：
const data = ref(null)
const fetchData = async () => {
  const res = await fetch('/api/data')
  data.value = res.json()
}

输出：
{
  "score": 55,
  "summary": "存在异步处理错误和缺少错误处理",
  "issues": [
    {
      "severity": "error",
      "line": 4,
      "description": "res.json() 返回 Promise，需要 await",
      "suggestion": "改为 data.value = await res.json()"
    },
    {
      "severity": "warning",
      "line": 3,
      "description": "没有 try-catch 错误处理",
      "suggestion": "用 try-catch 包裹，catch 中处理错误状态"
    }
  ]
}
```

后者的输出稳定、结构化、可被代码直接解析——这就是 Prompt 工程的价值。

---

## 让 AI 输出结构化 JSON

在 AI 应用开发中，你最常做的事就是**让 AI 输出结构化数据**——不是给人看的文本，而是给代码解析的 JSON。

### 核心技巧

**1. 在 System Prompt 中明确要求 JSON**

```javascript
const systemPrompt = `你是一个 API，只输出 JSON。
不要输出任何解释、markdown 代码块或其他格式。
直接输出纯 JSON 对象。`;
```

**2. 给出完整的 JSON Schema**

别只说"输出 JSON"——给出精确的字段定义：

```javascript
const systemPrompt = `输出 JSON，严格遵循以下结构：
{
  "intent": "question" | "command" | "chat",
  "confidence": 0.0-1.0,
  "entities": [
    { "type": string, "value": string }
  ],
  "response": string
}
不要输出 JSON 之外的任何内容。`;
```

**3. 用 response_format 参数（部分厂商支持）**

OpenAI 和 DeepSeek 支持 `response_format` 参数强制 JSON 输出：

```javascript
const response = await client.chat.completions.create({
  model: 'deepseek-chat',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userInput },
  ],
  response_format: { type: 'json_object' },
});
```

加上这个参数后，AI 会被强制只输出合法的 JSON，大幅减少格式错误。

**4. 解析时做容错**

即使用了以上技巧，AI 偶尔还是会输出不合法的 JSON（比如多了一个逗号、包了一层代码块）。永远做容错：

```javascript
function parseAIJson(text) {
  // 尝试直接解析
  try {
    return JSON.parse(text);
  } catch {}

  // 去掉 Markdown 代码块包裹
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '');
  try {
    return JSON.parse(cleaned);
  } catch {}

  // 提取第一个 { 到最后一个 } 之间的内容
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }

  throw new Error(`AI 输出无法解析为 JSON: ${text.slice(0, 200)}`);
}
```

```python
import json
import re

def parse_ai_json(text: str) -> dict:
    # 直接解析
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 去掉 Markdown 代码块
    cleaned = re.sub(r'^```(?:json)?\n?', '', text, flags=re.MULTILINE)
    cleaned = re.sub(r'\n?```$', '', cleaned, flags=re.MULTILINE)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # 提取 JSON 对象
    match = re.search(r'\{[\s\S]*\}', text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"AI 输出无法解析为 JSON: {text[:200]}")
```

这个 `parseAIJson` 函数在我自己的项目里用了几个月，覆盖了 99% 的异常情况。

---

## Few-shot 示例的威力

Few-shot（少样本示例）是 Prompt 工程中最简单也最有效的技巧——**给 AI 看几个例子，它就知道你要什么了**。

### Zero-shot vs Few-shot

**Zero-shot（零示例）：**

```
将以下评论分类为"正面"、"负面"或"中性"：
"这个手机电池太不耐用了"
```

AI 输出：`这条评论是负面的，因为用户对手机电池的续航能力表达了不满...`（一大段解释）

**Few-shot（给 2-3 个示例）：**

```
将以下评论分类为"正面"、"负面"或"中性"。只输出分类结果。

评论："物流超快，第二天就到了" → 正面
评论："一般般吧，没什么特别的" → 中性
评论："用了三天就坏了" → 负面

评论："这个手机电池太不耐用了" →
```

AI 输出：`负面`

差距一目了然。Few-shot 通过示例教会了 AI 两件事：**输出什么内容**和**输出什么格式**。

### Few-shot 的数量

- **1 个示例**：基本能定义格式
- **2-3 个示例**：覆盖不同情况，效果最佳
- **5+ 个示例**：收益递减，还浪费 Token

我一般用 2-3 个，覆盖正常情况、边界情况和特殊情况各一个。

---

## 实战：用 Prompt 工程做 Code Review

把上面学到的技巧综合起来，做一个实用的 AI Code Review 工具。

### 完整实现

**JavaScript：**

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const REVIEW_SYSTEM_PROMPT = `## Role
你是一个资深全栈代码审查员，精通 JavaScript/TypeScript、Vue、React、Python。

## Task
对用户提交的代码进行审查，找出 Bug、安全隐患、性能问题和代码规范问题。

## Output Format
严格输出以下 JSON 格式，不要输出 JSON 之外的任何内容：
{
  "score": <0-100 整数，60 以下不合格>,
  "summary": "<一句话总评，不超过 50 字>",
  "issues": [
    {
      "severity": "error | warning | info",
      "line": <行号或 null>,
      "category": "bug | security | performance | style | maintainability",
      "description": "<问题描述>",
      "suggestion": "<修复建议，包含代码片段>"
    }
  ],
  "highlights": ["<做得好的地方，1-2 条>"]
}

## Rules
- severity 为 error 的问题必须修复
- 每个问题的 suggestion 要具体到代码级别
- highlights 用于鼓励开发者，但不要硬夸
- 如果代码没有明显问题，score 给 85+`;

async function reviewCode(code, language = 'javascript') {
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: REVIEW_SYSTEM_PROMPT },
      { role: 'user', content: `语言: ${language}\n\n\`\`\`${language}\n${code}\n\`\`\`` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  return parseAIJson(response.choices[0].message.content);
}

// 使用
const result = await reviewCode(`
export default {
  data() {
    return { list: [] }
  },
  async mounted() {
    const res = await fetch('/api/list')
    this.list = res.json()
    console.log(this.list)
  }
}
`, 'vue');

console.log(JSON.stringify(result, null, 2));
```

**Python：**

```python
from openai import OpenAI
import os

client = OpenAI(
    base_url="https://api.deepseek.com",
    api_key=os.getenv("DEEPSEEK_API_KEY"),
)

REVIEW_SYSTEM_PROMPT = """## Role
你是一个资深全栈代码审查员，精通 JavaScript/TypeScript、Vue、React、Python。

## Task
对用户提交的代码进行审查，找出 Bug、安全隐患、性能问题和代码规范问题。

## Output Format
严格输出以下 JSON 格式，不要输出 JSON 之外的任何内容：
{
  "score": <0-100 整数>,
  "summary": "<一句话总评>",
  "issues": [
    {
      "severity": "error | warning | info",
      "line": <行号或 null>,
      "category": "bug | security | performance | style | maintainability",
      "description": "<问题描述>",
      "suggestion": "<修复建议>"
    }
  ],
  "highlights": ["<做得好的地方>"]
}"""


def review_code(code: str, language: str = "javascript") -> dict:
    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
            {"role": "user", "content": f"语言: {language}\n\n```{language}\n{code}\n```"},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    return parse_ai_json(response.choices[0].message.content)
```

### 关键设计决策

- **temperature 设 0.3**：Code Review 需要稳定、可重复的输出。温度越低，输出越确定。
- **role 设定很具体**："精通 JS/TS、Vue、React、Python"——这不是废话，它影响 AI 检查的侧重点。
- **JSON 格式精确到字段类型**：`severity` 限定三个值，`category` 限定五个值——前端才好做条件渲染。
- **加了 highlights**：纯找问题太打击人了，加点正面反馈。

---

## 常见翻车案例和修复技巧

### 翻车 1：AI 输出了多余内容

**症状**：让 AI 输出 JSON，它在前面加了"好的，以下是 JSON 格式的结果："

**修复**：

```
不要输出任何解释或前缀。直接以 { 开头，以 } 结尾。
```

加上 `response_format: { type: 'json_object' }` 双保险。

### 翻车 2：AI 不遵守字数限制

**症状**：让它"一句话总结"，它写了一段话。

**修复**：用具体数字替代模糊描述。

```
❌ "简短回答"
✅ "用不超过 20 个字回答"
```

### 翻车 3：AI 输出不稳定

**症状**：同一个 Prompt，10 次调用有 3 次格式不对。

**修复**：
1. 降低 `temperature`（0.1-0.3）
2. 加 Few-shot 示例锁定格式
3. 在 Prompt 末尾重复格式要求（"再次提醒：只输出 JSON"）

### 翻车 4：AI "幻觉"

**症状**：AI 编造了不存在的 API、不存在的函数名。

**修复**：
1. 明确告诉 AI"如果不确定就说不知道"
2. 提供参考资料（上下文注入）
3. 降低 temperature

### 翻车 5：中英文混输

**症状**：你要中文回复，AI 突然蹦几个英文词。

**修复**：

```
所有输出必须使用中文。技术术语保留英文但用中文解释，如"Token（令牌）"。
```

---

## temperature 和 top_p 速查

| 场景 | temperature | 适合 |
|------|-------------|------|
| 代码生成、JSON 输出 | 0.1-0.3 | 需要确定性和格式稳定 |
| 日常对话、问答 | 0.5-0.7 | 平衡质量和多样性 |
| 创意写作、头脑风暴 | 0.8-1.0 | 需要多样化和创造力 |

**建议：AI 应用开发中 80% 的场景用 0.3-0.5 就对了。**

---

## 总结

1. **Prompt 工程是 AI 应用开发的核心技能**——比调 API 重要 10 倍。
2. **RCFE 框架**：Role（角色）+ Context（上下文）+ Format（格式）+ Examples（示例），四要素缺一不可。
3. **让 AI 输出 JSON**：明确 Schema + `response_format` 参数 + 容错解析三重保障。
4. **Few-shot 示例**是最简单有效的技巧——2-3 个例子锁定输出格式和内容风格。
5. **temperature 决定稳定性**：结构化输出用 0.1-0.3，对话用 0.5-0.7。
6. **永远做容错**：`parseAIJson()` 这种防御性函数是必备工具。

**下一篇**，我们补上 AI 应用开发的工程化基础——API Key 安全管理、代理配置、错误处理和重试机制。这些东西不性感，但少了它们你的代码上不了生产。

---

> **下一篇预告**：[07 | .env 管理、代理配置、错误处理——AI 应用的工程化基础](/series/junior/07-engineering-basics)

---

**讨论话题**：你写 Prompt 时踩过最大的坑是什么？有没有什么好用的 Prompt 技巧？评论区分享一下。
