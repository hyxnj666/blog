---
title: "作为 TL，怎么带团队从 0 到 1 落地 AI 功能"
description: "技术负责人带团队落地 AI 功能的完整操作手册"
order: 17
cover: "./cover.png"
publishDate: "2025-11-16"
tags: ["团队管理", "项目管理", "AI落地", "技术领导力"]
---

# 作为 TL，怎么带团队从 0 到 1 落地 AI 功能

> 本文是【高级前端的 AI 架构升级之路】系列第 17 篇。
> 上一篇：[AI 应用的商业化设计：从技术 Demo 到能收费的产品](/series/senior/16-ai-monetization) | 下一篇：[前端团队的 AI 工作流升级：不只是用 Copilot](/series/senior/18-ai-workflow)

---

## 引言

老板说："我们也做个 AI 功能。"

然后看向你——前端 TL。

你面对的不是一个技术问题，而是一个**系统工程问题**：团队没人做过 AI、产品需求模糊、后端说"你们前端搞就行"、老板觉得"ChatGPT 不是很简单吗"。

这篇文章是给**技术负责人**的操作手册。

---

## 阶段一：立项（第 1-2 周）

### 需求澄清

老板说"加个 AI 功能"时，你需要问清楚：

| 问题 | 为什么重要 |
|------|-----------|
| 给谁用？ | 内部员工 vs 外部用户，安全要求不同 |
| 解决什么问题？ | "提效"太模糊，需要量化（减少 XX 步骤） |
| 预算多少？ | AI API 费用是持续支出，不是一次性的 |
| 数据在哪里？ | 有没有现成的知识库/文档/数据库 |
| 成功标准是什么？ | 采纳率 > 50%？处理时间减少 30%？ |

### 技术可行性评估

```
花 3 天做一个 最简 POC（Proof of Concept）

1. 拿真实的业务数据
2. 写一个最简单的 Prompt
3. 调 API 看效果
4. 评估：AI 能解决这个问题到什么程度？
```

POC 的目的不是做产品，是**验证 AI 能力的上限**。如果 Prompt + GPT-4o 都搞不定，那就不要立项。

### 输出物

```markdown
## AI 功能立项评估

### 目标
- 用户：客服团队（30 人）
- 场景：客户咨询自动回复建议
- 目标：客服响应时间从平均 5 分钟降到 2 分钟

### POC 结果
- 准确率：78%（可接受，上线后可通过反馈优化）
- 平均延迟：1.8s（可接受）
- 预估月成本：$200-400

### 技术方案
- 模型：DeepSeek（成本低，中文效果好）
- 架构：前端 → 后端 API → AI Gateway → DeepSeek
- 知识库：公司产品文档（RAG）

### 里程碑
- Week 1-2: 后端 API + RAG
- Week 3-4: 前端 UI + 集成测试
- Week 5: 内测（10 人）
- Week 6: 灰度（全量的 30%）
- Week 7-8: 全量 + 监控
```

---

## 阶段二：团队分工（第 1 周）

### 最小团队配置

```
AI 功能最小团队（4 人）：
├── 前端 1 人    → AI 交互 UI、流式渲染、状态管理
├── 后端 1 人    → AI Gateway、RAG、API
├── TL (你)      → 架构设计、Prompt 工程、项目管理
└── 产品 0.5 人  → 需求定义、用户测试
```

### 分工原则

| 角色 | 职责 | 你要做的 |
|------|------|---------|
| 前端 | AI 交互 UI | 给他上一篇"AI 交互设计模式"的文章 |
| 后端 | API 和 AI 调用层 | 和他对齐接口协议（SSE 格式） |
| 你（TL） | Prompt 工程 + 架构 | 先写好 Prompt，再分配具体开发 |

关键洞察：**Prompt 工程是 TL 的活，不要委托给没经验的人**。Prompt 质量直接决定产品效果。

---

## 阶段三：技术架构（第 1 周）

### 架构决策记录

```markdown
## ADR-001: AI 调用架构

### 决策
后端统一代理 AI 调用，前端不直接调 AI API。

### 原因
1. API Key 安全——前端不能暴露 Key
2. 统一计费——所有调用经过后端记录
3. 可控——后端可以做限流、降级、切换模型
4. 合规——敏感数据不直接发给第三方

### 方案
前端 → 后端 API（SSE）→ AI Gateway → AI Provider

### 取舍
- 多了一层代理的延迟（~50ms），可接受
- 后端需要处理流式转发，增加复杂度
```

### 前后端接口协议

```typescript
// 统一的 SSE 协议
// 事件类型
type SSEEvent =
  | { type: 'start'; data: { sessionId: string } }
  | { type: 'content'; data: { text: string } }
  | { type: 'done'; data: { usage: { inputTokens: number; outputTokens: number } } }
  | { type: 'error'; data: { code: string; message: string } }

// POST /api/ai/chat
// Request
interface ChatRequest {
  message: string
  sessionId?: string
  context?: {
    pageUrl?: string
    selectedText?: string
    metadata?: Record<string, any>
  }
}
```

提前对齐协议，前后端可以并行开发。

---

## 阶段四：开发（第 2-4 周）

### Sprint 规划

```
Sprint 1（Week 2）: 基础链路
  - [后端] AI API 对接 + 基础 Prompt
  - [前端] 聊天 UI 骨架 + SSE 接入
  - [TL]   Prompt 调试 + 评估测试集

Sprint 2（Week 3）: 核心功能
  - [后端] RAG 知识库 + 上下文管理
  - [前端] 流式渲染 + Markdown + 反馈组件
  - [TL]   Prompt 优化 + Edge case 处理

Sprint 3（Week 4）: 打磨 + 灰度准备
  - [后端] 监控 + 降级 + 成本控制
  - [前端] 加载态 + 错误处理 + 交互细节
  - [TL]   端到端测试 + 灰度方案
```

### Code Review 关注点

作为 TL 审代码时，重点关注：

```
✅ API Key 不能出现在前端代码和 Git 历史中
✅ AI 调用有超时和重试机制
✅ 流式渲染有错误处理（网络断开、AI 返回空）
✅ 用户输入有长度限制和过滤（防 Prompt 注入）
✅ AI 输出有 XSS 防护（DOMPurify）
✅ 有用量监控和成本告警
✅ 有降级方案（AI 挂了用户看到友好提示，而不是白屏）
```

---

## 阶段五：灰度发布（第 5-6 周）

### 灰度策略

```
Week 5: 内测
  - 10 个种子用户
  - 收集定性反馈
  - 修复明显问题

Week 6: 灰度 30%
  - 按用户 ID 分流
  - 监控核心指标：
    - AI 调用成功率 > 95%
    - P95 延迟 < 5s
    - 用户采纳率 > 40%
    - 日均成本在预算内

Week 7: 灰度 100%
  - 全量放开
  - 持续监控
```

### 灰度开关

```typescript
// 前端 Feature Flag
const AI_FEATURE_FLAG = 'ai_chat_v1'

async function shouldShowAI(userId: string): Promise<boolean> {
  // 1. 总开关
  const globalEnabled = await getFeatureFlag(AI_FEATURE_FLAG)
  if (!globalEnabled) return false

  // 2. 灰度比例
  const rolloutPercent = await getFeatureRollout(AI_FEATURE_FLAG)
  const userBucket = hashUserId(userId) % 100
  if (userBucket >= rolloutPercent) return false

  return true
}
```

---

## 阶段六：持续优化（第 7 周+）

### 建立反馈闭环

```
用户使用 AI → 点赞/点踩 → 数据入库
                            ↓
              每周分析差评 case
                            ↓
              优化 Prompt / 补充知识库
                            ↓
              重新评估 → 发布新版本
```

### 周报模板

```markdown
## AI 功能周报 - Week 8

### 核心指标
- 日均调用：1,200 次（↑15%）
- 采纳率：62%（↑5%）
- 用户满意度：4.1/5
- 周成本：$85

### 本周优化
- 优化了退货场景的 Prompt，准确率从 65% 提升到 82%
- 新增 3 篇产品文档到知识库

### 下周计划
- 支持多轮对话
- 接入订单查询 Tool（Agent 模式）
```

---

## 常见坑

### 1. "先做完再优化 Prompt"

Prompt 质量决定产品成败。**应该先花 1 周把 Prompt 调到 80 分，再开始写代码**。

### 2. "AI 能解决一切"

和产品经理明确：AI 能做的 ≠ AI 做得好的。有些场景规则引擎比 AI 更可靠。

### 3. "成本后面再考虑"

一个不控制成本的 AI 功能，月均 token 费可能超出预算 10 倍。从第一天就做成本监控。

### 4. "一次性开发"

AI 功能是**运营型功能**，需要持续维护 Prompt、更新知识库、监控质量。预留 20% 的人力做持续优化。

---

## 总结

1. **立项先做 POC**——3 天验证 AI 能力上限，别盲目开发。
2. **TL 亲自做 Prompt 工程**——这决定了产品 80% 的效果。
3. **前后端协议先行**——SSE 格式提前对齐，并行开发。
4. **灰度发布**——内测 → 30% → 100%，每一步都有数据支撑。
5. **持续优化**——建立反馈闭环，AI 功能需要长期维护。

---

> **下一篇预告**：[18 | 前端团队的 AI 工作流升级：不只是用 Copilot](/series/senior/18-ai-workflow)

---

**管理讨论**：你带团队做 AI 功能踩过什么坑？最大的挑战是什么？评论区聊聊。
