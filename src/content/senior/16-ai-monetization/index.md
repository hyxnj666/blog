---
title: "AI 应用的商业化设计：从技术 Demo 到能收费的产品"
description: "AI 应用的定价模型、前端商业化组件和成本控制策略全解析"
order: 16
cover: "./cover.png"
publishDate: "2025-11-09"
tags: ["商业化", "定价策略", "成本控制", "付费墙"]
---

# AI 应用的商业化设计：从技术 Demo 到能收费的产品

> 本文是【高级前端的 AI 架构升级之路】系列第 16 篇。
> 上一篇：[AI + 编辑器：富文本 / 代码编辑器中的 AI 集成方案](/series/senior/15-ai-editor) | 下一篇：[作为 TL，怎么带团队从 0 到 1 落地 AI 功能](/series/senior/17-ai-team-lead)

---

## 引言

你做了个 AI 产品，技术上很 cool，同事都说"牛逼"。

但老板问了一个灵魂问题：**"怎么赚钱？"**

作为高级前端 / 技术负责人，你需要从纯技术视角升级到**产品 + 商业视角**。这不是产品经理一个人的事——AI 功能的商业化设计，很大程度上取决于**技术架构怎么设计**。

---

## AI 产品的定价模型

### 模型一：按量计费

```
用户使用 AI 功能 → 消耗 Token → 按量收费
```

**技术架构要求**：

```typescript
interface UsageRecord {
  userId: string
  feature: string          // 哪个 AI 功能
  model: string
  inputTokens: number
  outputTokens: number
  cost: number             // 我方成本
  price: number            // 向用户收取
  timestamp: Date
}

// 实时计费中间件
async function billingMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTokens = { input: 0, output: 0 }

  // 包装 AI 调用，追踪 token
  req.trackUsage = (usage: { inputTokens: number; outputTokens: number }) => {
    startTokens.input += usage.inputTokens
    startTokens.output += usage.outputTokens
  }

  await next()

  // 记录用量
  await recordUsage({
    userId: req.user.id,
    feature: req.path,
    inputTokens: startTokens.input,
    outputTokens: startTokens.output,
    cost: calculateCost(startTokens),
    price: calculatePrice(startTokens, req.user.plan),
  })
}
```

适用于：API 服务、开发者工具。

### 模型二：订阅制（分层套餐）

```
免费版: 每月 50 次 AI 调用
Pro:    每月 500 次，$9.9/月
Team:   无限次，$29.9/人/月
```

**技术架构要求**：

```typescript
interface UserPlan {
  plan: 'free' | 'pro' | 'team' | 'enterprise'
  monthlyQuota: number | null    // null = 无限
  usedThisMonth: number
  features: {
    aiChat: boolean
    aiSummary: boolean
    aiCodeReview: boolean
    advancedModels: boolean      // 是否可以用 GPT-4o / Claude
    customPrompts: boolean
  }
}

// 配额检查中间件
async function quotaMiddleware(req: Request, res: Response, next: NextFunction) {
  const plan = await getUserPlan(req.user.id)

  if (plan.monthlyQuota !== null && plan.usedThisMonth >= plan.monthlyQuota) {
    return res.status(429).json({
      error: 'quota_exceeded',
      message: '本月 AI 额度已用完',
      upgrade_url: '/pricing',
      reset_date: getNextMonthFirstDay(),
    })
  }

  await next()

  // 扣减配额
  await incrementUsage(req.user.id)
}
```

适用于：SaaS 产品、内容工具。

### 模型三：增值功能

```
核心产品免费 → AI 功能作为付费增值
```

适用于：已有产品加 AI 能力。

---

## 前端的商业化组件

### 付费墙（Paywall）

```vue
<template>
  <!-- AI 功能入口 -->
  <button @click="handleAIAction">
    ✨ AI 智能摘要
  </button>

  <!-- 付费墙弹窗 -->
  <Teleport to="body">
    <div v-if="showPaywall" class="paywall-overlay">
      <div class="paywall-card">
        <h2>升级解锁 AI 功能</h2>
        <p>{{ paywallMessage }}</p>

        <div class="plans">
          <div v-for="plan in plans" :key="plan.id" class="plan-card">
            <h3>{{ plan.name }}</h3>
            <div class="price">{{ plan.price }}</div>
            <ul>
              <li v-for="feature in plan.features" :key="feature">
                ✅ {{ feature }}
              </li>
            </ul>
            <button @click="subscribe(plan.id)">选择</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const showPaywall = ref(false)
const paywallMessage = ref('')

async function handleAIAction() {
  const plan = await getUserPlan()

  if (!plan.features.aiSummary) {
    paywallMessage.value = '智能摘要是 Pro 版功能'
    showPaywall.value = true
    trackEvent('paywall_shown', { feature: 'ai_summary', trigger: 'click' })
    return
  }

  if (plan.usedThisMonth >= plan.monthlyQuota!) {
    paywallMessage.value = `本月 AI 额度已用完（${plan.usedThisMonth}/${plan.monthlyQuota}）`
    showPaywall.value = true
    trackEvent('paywall_shown', { feature: 'ai_summary', trigger: 'quota' })
    return
  }

  // 正常使用
  await runAISummary()
}
</script>
```

### 用量展示

```vue
<template>
  <div class="usage-widget">
    <div class="usage-bar">
      <div class="usage-fill" :style="{ width: usagePercent + '%' }" />
    </div>
    <span class="usage-text">
      {{ used }} / {{ total }} 次 AI 调用
    </span>
    <button v-if="usagePercent > 80" @click="goToPricing" class="upgrade-hint">
      额度即将用完，升级套餐
    </button>
  </div>
</template>
```

### 功能降级体验

让免费用户**体验到 AI 的价值**，而不是完全屏蔽：

```typescript
// 免费用户看到 AI 结果的前 3 行，模糊后面的内容
function renderAIResult(result: string, plan: UserPlan) {
  if (plan.plan === 'free') {
    const lines = result.split('\n')
    const preview = lines.slice(0, 3).join('\n')
    const blurred = lines.slice(3).join('\n')

    return {
      preview,
      blurred,
      showUpgradePrompt: lines.length > 3,
    }
  }

  return { preview: result, blurred: '', showUpgradePrompt: false }
}
```

---

## 成本控制策略

AI 功能的毛利取决于**成本控制**。

### 分层模型策略

```typescript
function selectModel(user: User, task: string): string {
  // 免费用户 → 最便宜的模型
  if (user.plan === 'free') return 'gpt-4o-mini'

  // Pro 用户 → 根据任务选模型
  const taskModelMap: Record<string, string> = {
    'simple_qa': 'gpt-4o-mini',      // 简单问答
    'summary': 'gpt-4o-mini',         // 摘要
    'code_review': 'gpt-4o',          // 代码审查用好模型
    'translation': 'deepseek-chat',   // 翻译用便宜的
    'creative': 'claude-3-5-sonnet',  // 创意写作
  }

  return taskModelMap[task] || 'gpt-4o-mini'
}
```

### 缓存策略

```typescript
// 相同问题不重复调用 AI
import { createHash } from 'crypto'

async function cachedAICall(prompt: string, options: AIOptions): Promise<string> {
  const cacheKey = createHash('md5')
    .update(JSON.stringify({ prompt, model: options.model, temperature: options.temperature }))
    .digest('hex')

  const cached = await redis.get(`ai:cache:${cacheKey}`)
  if (cached) {
    await recordUsage({ ...options, cached: true, cost: 0 })
    return cached
  }

  const result = await callAI(prompt, options)
  await redis.set(`ai:cache:${cacheKey}`, result, 'EX', 3600)

  return result
}
```

---

## 转化漏斗优化

```
曝光 AI 功能 → 尝试使用 → 触发付费墙 → 查看定价 → 付款
  100%          40%          15%          8%         3%
```

每一步都有优化空间：

| 环节 | 优化手段 |
|------|---------|
| 曝光 | 在用户最需要的时候展示 AI 入口（如写作时展示"AI 续写"） |
| 尝试 | 给免费用户一定体验额度（如每月 10 次） |
| 付费墙 | 展示"AI 帮你节省了 XX 时间"的具体数据 |
| 定价 | A/B 测试不同价格点 |
| 付款 | 简化支付流程，支持多种支付方式 |

---

## 总结

1. **三种定价模型**——按量计费（API）、订阅制（SaaS）、增值功能（已有产品），按业务选择。
2. **前端组件**——付费墙、用量展示、功能降级，都需要精心设计。
3. **成本控制**——分层模型 + 缓存 + 免费用户用便宜模型，保证毛利。
4. **转化漏斗**——从曝光到付款的每一步都可以优化。
5. **技术决定商业**——AI 功能的商业模式很大程度上取决于技术架构的灵活性。

---

> **下一篇预告**：[17 | 作为 TL，怎么带团队从 0 到 1 落地 AI 功能](/series/senior/17-ai-team-lead)

---

**商业讨论**：你做的 AI 功能是怎么收费的？免费用户的体验怎么设计？评论区聊聊。
