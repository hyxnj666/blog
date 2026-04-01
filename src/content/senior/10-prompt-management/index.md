---
title: "Prompt 工程化管理：从散落在代码里到版本化、可测试、可回滚"
description: "将 Prompt 从代码中解耦，实现版本化管理、在线测试和自动评估"
order: 10
cover: "./cover.png"
publishDate: "2025-09-28"
tags: ["Prompt", "架构", "工程化", "评估"]
---

# Prompt 工程化管理：从散落在代码里到版本化、可测试、可回滚

> 本文是【高级前端的 AI 架构升级之路】系列第 10 篇。
> 上一篇：[搭建公司内部的 AI 平台（下）：前端控制台开发](/series/senior/09-ai-platform-frontend) | 下一篇：[MCP Server 进阶：为团队构建标准化的 AI 工具生态](/series/senior/11-mcp-advanced)

---

## 引言

你的 AI 应用上线了，客服 Prompt 写死在 `src/prompts/customer-service.ts` 里。

产品说"帮我改一下 Prompt，语气再友好一点"——你改代码、提 PR、Code Review、合并、部署。改一句话用了半天。

隔天产品说"改回去，之前的效果更好"——你 git revert、重新部署。

**Prompt 不应该和代码耦合在一起。它是配置，不是代码。**

---

## Prompt 即配置

### 核心思路

```
之前: Prompt 写在代码里 → 改 Prompt = 改代码 = 发版
之后: Prompt 存在配置中心 → 改 Prompt = 改配置 = 热更新
```

### Prompt 配置中心架构

```
┌─────────────────────────────────┐
│     Prompt Management Console    │
│  (编辑、测试、版本管理、发布)        │
└───────────────┬─────────────────┘
                │ REST API
┌───────────────┴─────────────────┐
│     Prompt Config Service        │
│  ┌──────────┐  ┌──────────────┐ │
│  │ 版本存储   │  │ Eval 评估    │ │
│  │ PostgreSQL│  │ 流水线       │ │
│  └──────────┘  └──────────────┘ │
└───────────────┬─────────────────┘
                │
    ┌───────────┼───────────┐
    ▼           ▼           ▼
  App A       App B       App C
  (SDK拉取)   (SDK拉取)   (SDK拉取)
```

应用通过 SDK 拉取最新 Prompt，不需要改代码就能更新 Prompt。

---

## Prompt Management SDK

### TypeScript SDK

```typescript
// prompt-sdk.ts
interface PromptConfig {
  id: string
  template: string
  variables: string[]
  model: string
  temperature: number
  version: number
}

class PromptManager {
  private cache = new Map<string, PromptConfig>()
  private baseUrl: string
  private apiKey: string
  private refreshInterval: number

  constructor(options: {
    baseUrl: string
    apiKey: string
    refreshInterval?: number
  }) {
    this.baseUrl = options.baseUrl
    this.apiKey = options.apiKey
    this.refreshInterval = options.refreshInterval || 60000

    // 定期刷新缓存
    setInterval(() => this.refreshAll(), this.refreshInterval)
  }

  async getPrompt(promptId: string): Promise<PromptConfig> {
    // 先查缓存
    const cached = this.cache.get(promptId)
    if (cached) return cached

    // 缓存未命中，请求配置中心
    const resp = await fetch(`${this.baseUrl}/api/prompts/${promptId}/latest`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    const config = await resp.json()

    this.cache.set(promptId, config)
    return config
  }

  render(config: PromptConfig, variables: Record<string, string>): string {
    let result = config.template
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
    }
    return result
  }

  async call(promptId: string, variables: Record<string, string>, userMessage: string) {
    const config = await this.getPrompt(promptId)
    const systemPrompt = this.render(config, variables)

    return callAI({
      model: config.model,
      temperature: config.temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    })
  }

  private async refreshAll() {
    for (const [id] of this.cache) {
      try {
        const resp = await fetch(`${this.baseUrl}/api/prompts/${id}/latest`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        })
        const config = await resp.json()
        this.cache.set(id, config)
      } catch {
        // 刷新失败用缓存兜底
      }
    }
  }
}

// 使用
const prompts = new PromptManager({
  baseUrl: 'https://ai-platform.internal.com',
  apiKey: process.env.PLATFORM_KEY!,
  refreshInterval: 30000,
})

// 业务代码里只用 promptId，不写死任何 Prompt 内容
const result = await prompts.call('customer-service-v1', {
  company: '我们公司',
  product: 'XXX 产品',
}, userQuestion)
```

### 降级策略

```typescript
class PromptManager {
  private fallbacks = new Map<string, PromptConfig>()

  // 注册降级 Prompt（写在代码里兜底）
  registerFallback(promptId: string, config: PromptConfig) {
    this.fallbacks.set(promptId, config)
  }

  async getPrompt(promptId: string): Promise<PromptConfig> {
    try {
      // 1. 缓存
      const cached = this.cache.get(promptId)
      if (cached) return cached

      // 2. 远程
      const remote = await this.fetchRemote(promptId)
      this.cache.set(promptId, remote)
      return remote
    } catch {
      // 3. 降级
      const fallback = this.fallbacks.get(promptId)
      if (fallback) return fallback

      throw new Error(`Prompt ${promptId} not found and no fallback registered`)
    }
  }
}
```

---

## 版本管理

### 数据模型

```typescript
interface PromptVersion {
  promptId: string
  version: number
  template: string
  variables: string[]
  modelConfig: {
    model: string
    temperature: number
    maxTokens: number
  }
  changelog: string
  author: string
  createdAt: Date
  evalScore?: number
  status: 'draft' | 'testing' | 'published' | 'archived'
}
```

### 版本生命周期

```
Draft（草稿）→ Testing（测试中）→ Published（已发布）→ Archived（归档）
                    ↓
              如果评分下降
                    ↓
              Rollback（回滚到上一个 Published 版本）
```

### API 设计

```
POST   /api/prompts                           # 创建 Prompt
GET    /api/prompts/:id/versions              # 获取所有版本
POST   /api/prompts/:id/versions              # 创建新版本
GET    /api/prompts/:id/versions/:version     # 获取特定版本
POST   /api/prompts/:id/publish/:version      # 发布版本
POST   /api/prompts/:id/rollback              # 回滚到上一个版本
GET    /api/prompts/:id/latest                 # 获取最新已发布版本（SDK 调用）
GET    /api/prompts/:id/diff?v1=3&v2=5        # 版本对比
```

---

## 变量模板引擎

不只是简单的字符串替换——支持条件渲染和循环。

```typescript
class PromptTemplateEngine {
  render(template: string, context: Record<string, any>): string {
    let result = template

    // 1. 条件渲染: {{#if variable}}...{{/if}}
    result = result.replace(
      /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_, variable, content) => {
        return context[variable] ? content : ''
      }
    )

    // 2. 循环: {{#each items}}...{{/each}}
    result = result.replace(
      /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
      (_, variable, content) => {
        const items = context[variable] as any[]
        if (!items?.length) return ''
        return items.map((item, i) =>
          content
            .replace(/\{\{this\}\}/g, String(item))
            .replace(/\{\{@index\}\}/g, String(i))
        ).join('\n')
      }
    )

    // 3. 简单变量替换: {{variable}}
    result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return context[key] !== undefined ? String(context[key]) : `{{${key}}}`
    })

    return result
  }
}

// 使用
const engine = new PromptTemplateEngine()
const prompt = engine.render(`
你是{{company}}的客服助手。

{{#if vip}}
这是 VIP 客户，请优先处理并使用尊敬的语气。
{{/if}}

你可以回答以下产品的问题：
{{#each products}}
- {{this}}
{{/each}}
`, {
  company: 'ABC 科技',
  vip: true,
  products: ['产品A', '产品B', '产品C'],
})
```

---

## Prompt 评估流水线

改了 Prompt 后，怎么知道效果变好还是变差？

### 评估流水线

```
新 Prompt 版本提交
        ↓
自动跑评估测试集（50-100 个 case）
        ↓
计算评分（准确率 / 格式正确率 / AI-as-Judge 评分）
        ↓
和上一个 Published 版本对比
        ↓
  评分提升 → 标记为可发布
  评分下降 → 告警，不允许发布
```

### 实现

```python
# eval_pipeline.py
async def evaluate_prompt(prompt_id: str, version: int) -> EvalResult:
    # 1. 获取 Prompt 版本
    prompt = await get_prompt_version(prompt_id, version)

    # 2. 获取评估测试集
    test_cases = await get_eval_cases(prompt_id)

    # 3. 逐条运行
    results = []
    for case in test_cases:
        rendered = render_template(prompt.template, case.variables)
        output = await call_ai(rendered, case.user_input, model=prompt.model)

        score = await evaluate_output(
            output=output,
            expected_traits=case.expected_traits,
            criteria=case.criteria,
        )
        results.append(score)

    # 4. 聚合分数
    avg_score = sum(r.score for r in results) / len(results)
    pass_rate = sum(1 for r in results if r.passed) / len(results)

    # 5. 和上一个版本对比
    prev_eval = await get_latest_eval(prompt_id)
    regression = prev_eval and avg_score < prev_eval.avg_score * 0.95

    return EvalResult(
        prompt_id=prompt_id,
        version=version,
        avg_score=avg_score,
        pass_rate=pass_rate,
        regression=regression,
        details=results,
    )
```

### 评估结果展示

```
┌─────────────────────────────────────────┐
│  Prompt: customer-service-v1             │
│  Version: v5 vs v4                       │
├──────────────┬──────────┬───────────────┤
│   指标         │  v4      │  v5           │
├──────────────┼──────────┼───────────────┤
│  平均评分      │  7.8     │  8.2 ↑        │
│  通过率        │  85%     │  92% ↑        │
│  格式正确率    │  95%     │  98% ↑        │
│  测试用例数    │  50      │  50           │
├──────────────┴──────────┴───────────────┤
│  ✅ 评分提升，建议发布                       │
└─────────────────────────────────────────┘
```

---

## 总结

1. **Prompt 即配置**——从代码里抽离到配置中心，改 Prompt 不需要发版。
2. **SDK + 缓存 + 降级**——应用通过 SDK 拉取 Prompt，缓存 + 代码降级保证可用性。
3. **版本管理**——Draft → Testing → Published → Archived，支持 Diff 对比和一键回滚。
4. **模板引擎**——支持条件渲染 `{{#if}}`、循环 `{{#each}}`，不只是简单替换。
5. **评估流水线**——每次修改自动跑 Eval，评分对比，回归立即告警。

---

> **下一篇预告**：[11 | MCP Server 进阶：为团队构建标准化的 AI 工具生态](/series/senior/11-mcp-advanced)

---

**架构讨论**：你们的 Prompt 是怎么管理的？写死在代码里还是配置化了？有跑 Eval 评估吗？评论区聊聊。
