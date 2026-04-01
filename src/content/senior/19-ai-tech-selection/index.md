---
title: "AI 时代的技术选型方法论：该自建还是用第三方"
description: "AI 技术选型的四维评估框架与常见场景决策指南"
order: 19
cover: "./cover.png"
publishDate: "2025-11-30"
tags: ["技术选型", "架构决策", "自建vs第三方", "方法论"]
---

# AI 时代的技术选型方法论：该自建还是用第三方

> 本文是【高级前端的 AI 架构升级之路】系列第 19 篇。
> 上一篇：[前端团队的 AI 工作流升级：不只是用 Copilot](/series/senior/18-ai-workflow) | 下一篇：[高级前端的 AI 学习路线：从 T7 到 T8/T9 的破局之道](/series/senior/20-ai-learning-path)

---

## 引言

"用 LangChain 还是自己写？"
"接 Dify 还是自建 AI 平台？"
"用 OpenAI 还是 DeepSeek？"

AI 技术选型比传统技术选型更复杂——因为 AI 领域**每个月都在变**。今天的最优解，三个月后可能被淘汰。

这篇文章给你一个**系统化的技术选型框架**，不是告诉你选 A 还是 B，而是教你怎么判断。

---

## 选型框架：四维评估

```
┌─────────────────────────────────────┐
│           技术选型四维模型             │
│                                     │
│   ┌─────────┐     ┌─────────┐      │
│   │ 业务匹配度│     │ 技术成熟度│      │
│   └─────────┘     └─────────┘      │
│                                     │
│   ┌─────────┐     ┌─────────┐      │
│   │ 团队适配度│     │ 成本可控度│      │
│   └─────────┘     └─────────┘      │
│                                     │
└─────────────────────────────────────┘
```

### 维度一：业务匹配度

| 问题 | 选 A | 选 B |
|------|------|------|
| 需求标准化程度 | 标准（用第三方） | 定制（自建） |
| 迭代速度要求 | 快速验证（用第三方） | 长期打磨（自建） |
| 数据敏感度 | 可上云（第三方 API） | 必须私有化（自建/本地） |
| 差异化需求 | 通用功能（第三方） | 核心竞争力（自建） |

### 维度二：技术成熟度

```typescript
interface TechMaturityAssessment {
  age: 'new' | 'growing' | 'mature' | 'declining'
  communitySize: number
  githubStars: number
  lastReleaseDate: Date
  breakingChangesFrequency: 'high' | 'medium' | 'low'
  documentationQuality: 1 | 2 | 3 | 4 | 5
  productionReferences: string[]
}
```

AI 领域的特殊性：**"mature" 可能只有 6 个月历史**。

### 维度三：团队适配度

```
团队会 Python → FastAPI + LangChain
团队只会 JS/TS → Vercel AI SDK + Node.js
团队无 AI 经验 → Dify/Coze 低代码平台
团队有 AI 经验 → 自建 AI Gateway
```

### 维度四：成本可控度

```typescript
interface CostAssessment {
  // 初始成本
  developmentTime: string      // 开发周期
  teamSize: number             // 需要的人力

  // 持续成本
  apiCostMonthly: number       // API 月费
  infraCostMonthly: number     // 基础设施月费
  maintenanceCostMonthly: number // 维护人力月费

  // 隐性成本
  vendorLockIn: 'low' | 'medium' | 'high'
  migrationCost: 'low' | 'medium' | 'high'
  learningCurve: 'low' | 'medium' | 'high'
}
```

---

## 常见选型场景

### 场景一：AI 模型选择

| 场景 | 推荐 | 理由 |
|------|------|------|
| 中文对话 | DeepSeek | 性价比最高，中文效果好 |
| 英文 + 复杂推理 | GPT-4o / Claude | 综合能力最强 |
| 代码生成 | Claude 3.5 | 代码质量高 |
| 成本敏感 | DeepSeek / Qwen | 价格低一个量级 |
| 隐私敏感 | Ollama 本地 | 数据不出域 |
| 多模态 | GPT-4o / Gemini | 图文理解能力强 |

**关键原则：不绑定单一模型**。设计抽象层，随时可以切换。

### 场景二：AI 框架选择

| 方案 | 适合 | 不适合 |
|------|------|--------|
| **原生 SDK** | 简单场景、需要完全控制 | 复杂 Agent、RAG |
| **LangChain** | RAG、Agent、复杂链式调用 | 简单 API 调用（太重） |
| **Vercel AI SDK** | Next.js/React 项目、流式 UI | 非 JS 项目 |
| **Google ADK** | Agent 开发、Google 生态 | 非 Agent 场景 |

### 场景三：自建 vs 第三方平台

```
                    定制化需求
                       高
                        │
            自建 AI      │      自建 +
            平台         │      Dify 定制
                        │
        ─────────────────┼─────────────────
                        │
            不需要       │      Dify / Coze
            AI 平台      │      直接用
                        │
                       低
              低 ──────────────── 高
                    团队规模/预算
```

| 选择 | 条件 |
|------|------|
| **Dify 直接用** | < 10 人团队，标准 RAG/Agent 需求 |
| **Dify + 定制** | 10-50 人，有一些定制需求但不想全建 |
| **自建平台** | > 50 人，核心竞争力，数据安全要求高 |
| **不需要平台** | < 5 人，只有一两个 AI 功能点 |

---

## 决策记录模板

```markdown
## ADR-003: RAG 方案选型

### 背景
需要给客服系统接入知识库问答。

### 候选方案
1. Dify RAG（开箱即用）
2. LangChain + ChromaDB（自建）
3. 自研 RAG Pipeline

### 评估

| 维度 | Dify | LangChain | 自研 |
|------|------|-----------|------|
| 业务匹配 | 8/10 | 7/10 | 9/10 |
| 技术成熟 | 7/10 | 8/10 | 3/10 |
| 团队适配 | 9/10 | 6/10 | 4/10 |
| 成本可控 | 9/10 | 7/10 | 3/10 |
| **总分** | **33** | **28** | **19** |

### 决策
选择 Dify。

### 理由
- 团队 4 人，没有 RAG 经验
- 需求标准（产品文档问答），无特殊定制
- 1 周内上线 vs 自建需要 1 个月

### 风险
- Dify 版本更新可能有 Breaking Change
- 后续如果需求复杂化，可能要迁移

### 退出策略
Dify 的 API 输出格式与自建方案兼容，迁移成本可控。
```

---

## 避坑指南

### 1. 不要追新

```
2025 Q1: "LangChain 最好！"
2025 Q3: "LangChain 太重了，用 LlamaIndex！"
2026 Q1: "都不好，自己写！"
```

**选成熟的、有退出策略的。**

### 2. 不要过度抽象

```
❌ 第一天就建"支持所有模型所有场景的统一 AI 框架"
✅ 先用最简单的方式跑通，需要时再抽象
```

### 3. 不要忽略退出成本

选任何第三方之前问：**如果它明天倒闭了，我要多久迁走？**

### 4. 做 POC，不要做 PPT

```
❌ 花一周做技术选型 PPT
✅ 每个候选方案花 2 天做 POC，用真实数据跑
```

---

## 总结

1. **四维评估**——业务匹配、技术成熟、团队适配、成本可控，缺一不可。
2. **不绑定单一供应商**——模型、框架、平台都要有退出策略。
3. **决策记录**——ADR 格式记录每个选型决策的理由和风险，方便回溯。
4. **POC 优先**——真实数据 + 真实场景跑 2 天，胜过开会讨论 2 周。
5. **适合的才是最好的**——5 人团队用 Dify 可能比 50 人团队自建更好。

---

> **下一篇预告**：[20 | 高级前端的 AI 学习路线：从 T7 到 T8/T9 的破局之道](/series/senior/20-ai-learning-path)

---

**选型讨论**：你最近做过什么 AI 技术选型？最纠结的点是什么？评论区聊聊。
