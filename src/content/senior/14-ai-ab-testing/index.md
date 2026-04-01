---
title: "AI 功能的 A/B 测试和效果度量：怎么证明 AI 功能有用"
description: "通过 A/B 测试和数据度量体系，科学验证 AI 功能的真实价值"
order: 14
cover: "./cover.png"
publishDate: "2025-10-26"
tags: ["A/B测试", "数据度量", "前端", "产品"]
---

# AI 功能的 A/B 测试和效果度量：怎么证明 AI 功能有用

> 本文是【高级前端的 AI 架构升级之路】系列第 14 篇。
> 上一篇：[AI 交互设计模式：超越聊天框的 10 种 AI UI 范式](/series/senior/13-ai-interaction-design) | 下一篇：[AI + 编辑器：富文本 / 代码编辑器中的 AI 集成方案](/series/senior/15-ai-editor)

---

## 引言

你花了两个月做了个 AI 功能，老板问："有用吗？"

你说"用户觉得挺好的"——这不是数据。

AI 功能的度量比传统功能更难：**用户可能觉得好玩但不实用，也可能实用但体验差**。怎么用数据证明 AI 功能真的有价值？

---

## AI 功能度量的特殊性

| 传统功能 | AI 功能 |
|---------|--------|
| 结果确定 | 结果不确定（同样输入不同输出） |
| 衡量"做没做" | 衡量"做得好不好" |
| A/B 分组简单 | 需要控制模型/Prompt 变量 |
| 指标明确（转化率、点击率） | 需要定义新指标（采纳率、质量分） |

---

## AI 专属指标体系

### 交互指标

```typescript
interface AIInteractionMetrics {
  // 触发
  featureExposure: number        // 功能曝光次数
  featureClickRate: number       // 功能点击率

  // 使用
  aiCallCount: number            // AI 调用次数
  avgCallsPerUser: number        // 人均调用次数
  retentionRate: number          // 次日/次周留存使用率

  // 采纳
  acceptanceRate: number         // AI 建议被接受的比例
  editAfterAccept: number        // 接受后又编辑的比例（说明质量不够好）
  rejectRate: number             // AI 建议被明确拒绝的比例
  ignoreRate: number             // AI 建议被忽略（无操作）的比例

  // 效率
  timeToComplete: number         // 完成任务的时间
  timeToFirstAccept: number      // 从展示到第一次接受的时间
  manualWorkReduction: number    // 手动操作减少的比例
}
```

### 质量指标

```typescript
interface AIQualityMetrics {
  avgQualityScore: number        // AI-as-Judge 平均评分
  userSatisfactionScore: number  // 用户评价（点赞/点踩）
  thumbsUpRate: number           // 点赞率
  thumbsDownRate: number         // 点踩率
  formatErrorRate: number        // 格式错误率
  halluccinationRate: number     // 幻觉率（RAG 场景）
}
```

### 业务指标

```typescript
interface AIBusinessMetrics {
  taskCompletionRate: number     // 任务完成率提升
  userEfficiency: number         // 用户效率提升（完成时间减少比例）
  supportTicketReduction: number // 客服工单减少率
  conversionLift: number         // 转化率提升
  revenuePerAIUser: number       // AI 用户人均收入
  costPerAICall: number          // 每次 AI 调用成本
  roi: number                    // ROI = (业务收益 - AI 成本) / AI 成本
}
```

---

## A/B 测试架构

### 实验配置

```typescript
interface ABExperiment {
  id: string
  name: string
  description: string
  startDate: Date
  endDate: Date
  status: 'draft' | 'running' | 'paused' | 'completed'

  // 分组
  groups: {
    id: string
    name: string          // "control" | "treatment_a" | "treatment_b"
    weight: number        // 流量比例，如 0.5
    config: {
      aiEnabled: boolean
      model?: string
      promptVersion?: number
      temperature?: number
    }
  }[]

  // 分流策略
  splitStrategy: 'user_id' | 'session_id' | 'device_id'

  // 指标
  primaryMetric: string
  secondaryMetrics: string[]
  guardrailMetrics: string[]    // 护栏指标（不能变差的指标）
}
```

### 前端分流

```typescript
// ab-test.ts
class ABTestClient {
  private assignments = new Map<string, string>()

  async getGroup(experimentId: string, userId: string): Promise<string> {
    const cacheKey = `${experimentId}:${userId}`
    if (this.assignments.has(cacheKey)) {
      return this.assignments.get(cacheKey)!
    }

    // 确定性分流：同一用户始终在同一组
    const hash = await this.hashString(`${experimentId}:${userId}`)
    const bucket = hash % 100

    const experiment = await this.fetchExperiment(experimentId)
    let cumWeight = 0
    for (const group of experiment.groups) {
      cumWeight += group.weight * 100
      if (bucket < cumWeight) {
        this.assignments.set(cacheKey, group.id)
        return group.id
      }
    }

    return experiment.groups[0].id
  }

  private async hashString(input: string): Promise<number> {
    const encoder = new TextEncoder()
    const data = encoder.encode(input)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = new Uint8Array(hashBuffer)
    return hashArray[0] * 256 + hashArray[1]
  }
}

// 使用
const abTest = new ABTestClient()
const group = await abTest.getGroup('ai-summary-v2', userId)

if (group === 'treatment_a') {
  // 显示 AI 摘要功能
  showAISummary({ model: 'gpt-4o-mini', promptVersion: 3 })
} else {
  // 对照组：不显示 AI 功能
}
```

### 事件埋点

```typescript
// 统一的 AI 事件上报
function trackAIEvent(event: {
  experimentId: string
  group: string
  userId: string
  action: 'exposure' | 'click' | 'call' | 'accept' | 'reject' | 'ignore' | 'thumbs_up' | 'thumbs_down'
  metadata?: Record<string, any>
}) {
  navigator.sendBeacon('/api/analytics/ai-event', JSON.stringify({
    ...event,
    timestamp: Date.now(),
    sessionId: getSessionId(),
    pageUrl: location.href,
  }))
}

// 曝光
trackAIEvent({ experimentId: 'ai-summary-v2', group, userId, action: 'exposure' })

// 用户接受了 AI 建议
trackAIEvent({
  experimentId: 'ai-summary-v2', group, userId,
  action: 'accept',
  metadata: { latencyMs: 1200, tokenCount: 350 },
})
```

---

## 统计分析

### 显著性检验

```python
# Python 后端分析
from scipy import stats
import numpy as np

def analyze_experiment(control_data: list, treatment_data: list) -> dict:
    # 基础统计
    control_mean = np.mean(control_data)
    treatment_mean = np.mean(treatment_data)
    lift = (treatment_mean - control_mean) / control_mean

    # T 检验
    t_stat, p_value = stats.ttest_ind(control_data, treatment_data)

    # 95% 置信区间
    se = np.sqrt(np.var(control_data) / len(control_data) + np.var(treatment_data) / len(treatment_data))
    ci_lower = (treatment_mean - control_mean) - 1.96 * se
    ci_upper = (treatment_mean - control_mean) + 1.96 * se

    return {
        "control_mean": round(control_mean, 4),
        "treatment_mean": round(treatment_mean, 4),
        "lift": f"{lift * 100:.2f}%",
        "p_value": round(p_value, 4),
        "significant": p_value < 0.05,
        "confidence_interval": [round(ci_lower, 4), round(ci_upper, 4)],
        "sample_size": {
            "control": len(control_data),
            "treatment": len(treatment_data),
        },
    }
```

### 结果展示

```
┌─────────────────────────────────────────────┐
│  实验：AI 智能摘要 v2                          │
│  状态：已完成 | 运行 14 天 | 样本量 12,000      │
├──────────────┬──────────┬───────────────────┤
│   指标         │  对照组    │  实验组             │
├──────────────┼──────────┼───────────────────┤
│  任务完成率    │  62%     │  78% (+25.8%) ✅   │
│  平均完成时间  │  4.2min  │  2.8min (-33%) ✅  │
│  用户满意度    │  3.8/5   │  4.2/5 (+10.5%) ✅│
│  AI 采纳率     │  -       │  68%               │
│  编辑后接受率  │  -       │  23%               │
│  AI 成本/用户  │  $0      │  $0.03             │
├──────────────┴──────────┴───────────────────┤
│  📊 主指标（任务完成率）p=0.003，统计显著        │
│  💰 ROI = 收益增长 $12,000 / AI 成本 $360 = 33x│
│  ✅ 建议全量发布                                │
└─────────────────────────────────────────────┘
```

---

## 用户反馈收集

### 轻量反馈组件

```vue
<template>
  <div class="ai-feedback">
    <span class="ai-label">AI 生成</span>
    <button
      :class="{ active: feedback === 'up' }"
      @click="submitFeedback('up')"
    >
      👍
    </button>
    <button
      :class="{ active: feedback === 'down' }"
      @click="submitFeedback('down')"
    >
      👎
    </button>

    <!-- 点踩后展开原因 -->
    <div v-if="feedback === 'down'" class="feedback-reasons">
      <label v-for="r in reasons" :key="r.id">
        <input type="checkbox" :value="r.id" v-model="selectedReasons" />
        {{ r.label }}
      </label>
      <textarea v-model="comment" placeholder="其他反馈..." />
      <button @click="submitDetail">提交</button>
    </div>
  </div>
</template>

<script setup lang="ts">
const reasons = [
  { id: 'irrelevant', label: '回答不相关' },
  { id: 'incorrect', label: '信息有误' },
  { id: 'incomplete', label: '回答不完整' },
  { id: 'format', label: '格式有问题' },
  { id: 'slow', label: '响应太慢' },
]
</script>
```

---

## 常见陷阱

### 1. 新鲜感偏差

用户刚接触 AI 功能时使用率高，两周后暴跌。

**解决**：实验至少跑 4 周，观察留存曲线是否稳定。

### 2. 忽略成本

AI 功能让转化率提升了 2%，但每月 AI 成本增加了 $5000。

**解决**：始终计算 ROI，把 AI 成本作为护栏指标。

### 3. 只看平均值

AI 功能对高级用户效果极好（+50%），对新手反而更差（-10%），平均值看起来还行。

**解决**：按用户分层分析，关注长尾。

### 4. 样本污染

同一用户在不同设备被分到不同组。

**解决**：用 `user_id` 而非 `session_id` 分流。

---

## 总结

1. **三层指标**——交互指标（采纳率）、质量指标（满意度）、业务指标（ROI），缺一不可。
2. **确定性分流**——基于 user_id 的哈希分流，保证同一用户始终在同一组。
3. **统计显著性**——不是看绝对数值大小，要看 p-value < 0.05 和置信区间。
4. **轻量反馈**——👍👎 + 点踩原因，不要搞太复杂的问卷。
5. **护栏指标**——AI 成本、延迟、用户体验不能因为 AI 功能变差。

---

> **下一篇预告**：[15 | AI + 编辑器：富文本 / 代码编辑器中的 AI 集成方案](/series/senior/15-ai-editor)

---

**度量讨论**：你们怎么衡量 AI 功能的效果？有跑过 A/B 测试吗？评论区聊聊。
