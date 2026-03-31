---
title: "AI 网关层设计：多模型路由、降级、限流、成本控制"
description: "为什么需要 AI 网关、多模型路由策略、降级方案、限流设计、成本监控看板"
order: 3
cover: "./cover.png"
publishDate: "2025-08-12"
tags: ["AI 网关", "架构设计", "多模型", "成本控制"]
---

# AI 网关层设计：多模型路由、降级、限流、成本控制

> 本文是【高级前端的 AI 架构升级之路】系列第 03 篇。
> 上一篇：[从"会用 AI"到"架构 AI"：高级前端的认知升级](/series/senior/02-from-using-to-architecting) | 下一篇：[AI 应用的状态管理：比 Redux 复杂 10 倍的挑战](/series/senior/04-ai-state-management)

---

## 为什么需要 AI 网关

上一篇我们聊了"架构 AI"的思维升级。从这篇开始进入实战——第一个要解决的问题是：**你的系统怎么调 AI**。

很多团队的第一版方案是这样的：

```
前端 → 后端业务层 → 直接调 OpenAI API
```

简单直接。但随着 AI 功能越来越多、调用量越来越大，你会遇到一系列问题：

1. **多个业务模块各自调不同厂商的 API**，配置散落各处，密钥管理混乱
2. **DeepSeek 限流了**，整个系统 AI 功能全挂，没有备选
3. **月底一看账单**，Token 费用比预期高 3 倍，不知道哪个功能在烧钱
4. **某个用户疯狂调用**，一个人用掉了全公司一半的 AI 额度
5. **AI 返回了敏感内容**，没有任何审核就直接展示给了用户

这些问题的根因都一样——**AI 调用没有统一的管控层**。

解决方案就是加一个 **AI Gateway（AI 网关）**，让所有 AI 调用都经过这一层：

```
前端 → 后端业务层 → AI Gateway → AI Provider APIs
```

AI Gateway 的职责：

- **统一入口**：所有 AI 调用走同一个接口
- **模型路由**：根据任务类型、成本预算自动选择模型
- **降级容灾**：主模型挂了自动切备选
- **限流控制**：按用户/功能/时间维度限制调用量
- **成本核算**：实时统计 Token 消耗
- **日志审计**：记录每一次 AI 调用的输入输出

如果你做过 API Gateway（Kong、Nginx 网关），这个概念你很熟。AI Gateway 就是专门针对 AI 场景的网关。

---

## 整体架构设计

一个生产级 AI Gateway 的架构：

```
┌─────────────────────────────────────────────────────┐
│                    AI Gateway                        │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  认证鉴权 │→│  限流器   │→│    模型路由器     │  │
│  └──────────┘  └──────────┘  └────────┬─────────┘  │
│                                       │             │
│                              ┌────────┼────────┐   │
│                              ▼        ▼        ▼   │
│                          ┌──────┐ ┌──────┐ ┌──────┐│
│                          │  主  │ │  备  │ │ 本地 ││
│                          │模型  │ │模型  │ │模型  ││
│                          └──┬───┘ └──┬───┘ └──┬───┘│
│                             │        │        │    │
│                          ┌──┴────────┴────────┴──┐ │
│                          │      降级控制器       │ │
│                          └───────────┬───────────┘ │
│                                      ▼             │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ 成本统计  │←│  输出审核 │←│    响应处理器    │ │
│  └──────────┘  └──────────┘  └──────────────────┘ │
│                                                     │
│                     Redis (状态存储)                 │
└─────────────────────────────────────────────────────┘
```

接下来逐个模块展开。

---

## 模型路由：按场景自动选模型

不是所有 AI 请求都该用同一个模型。路由器的职责是根据请求特征，自动分配最合适的模型。

### 路由策略

| 策略 | 逻辑 | 适用场景 |
|------|------|---------|
| **按任务类型** | 聊天用 A，代码用 B，翻译用 C | 不同任务效果差异大 |
| **按成本等级** | 免费用户用便宜模型，付费用户用好模型 | SaaS 产品分级 |
| **按响应速度** | 需要快速响应用小模型，不赶时间用大模型 | 实时 vs 异步场景 |
| **按数据敏感度** | 敏感数据只走本地 Ollama，不出外网 | 合规要求 |
| **负载均衡** | 同质模型之间轮询/加权分配 | 分散流量避免限流 |

### Node.js 实现

```typescript
interface RouteConfig {
  provider: string;
  model: string;
  priority: number;
  conditions?: {
    taskType?: string[];
    userTier?: string[];
    maxTokenBudget?: number;
    sensitiveData?: boolean;
  };
}

const ROUTE_TABLE: RouteConfig[] = [
  {
    provider: 'ollama',
    model: 'qwen2.5:7b',
    priority: 1,
    conditions: { sensitiveData: true },
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    priority: 2,
    conditions: { userTier: ['premium'], taskType: ['code-review', 'analysis'] },
  },
  {
    provider: 'deepseek',
    model: 'deepseek-chat',
    priority: 3,
    conditions: { taskType: ['chat', 'translation', 'summary'] },
  },
  {
    provider: 'qwen',
    model: 'qwen-plus',
    priority: 10, // 兜底
  },
];

function routeModel(request: AIRequest): RouteConfig {
  const candidates = ROUTE_TABLE
    .filter(route => matchConditions(route.conditions, request))
    .sort((a, b) => a.priority - b.priority);

  if (candidates.length === 0) {
    throw new Error('No matching model route');
  }
  return candidates[0];
}

function matchConditions(
  conditions: RouteConfig['conditions'],
  request: AIRequest,
): boolean {
  if (!conditions) return true;

  if (conditions.sensitiveData !== undefined
    && conditions.sensitiveData !== request.sensitiveData) return false;

  if (conditions.taskType
    && !conditions.taskType.includes(request.taskType)) return false;

  if (conditions.userTier
    && !conditions.userTier.includes(request.userTier)) return false;

  if (conditions.maxTokenBudget
    && request.estimatedTokens > conditions.maxTokenBudget) return false;

  return true;
}
```

路由表是可配置的——你可以把它放在数据库或配置中心里，支持运行时热更新，不需要改代码重新部署。

---

## 降级策略：五层降级保证可用性

AI 服务的可用性远不如传统 API。每家厂商都有限流、宕机、响应慢的时候。一个健壮的 AI Gateway 需要多层降级：

```
L1: 主模型（DeepSeek）
 ↓ 失败
L2: 备用模型（通义千问）
 ↓ 失败
L3: 本地模型（Ollama）
 ↓ 失败
L4: 缓存命中（相似请求的历史结果）
 ↓ 未命中
L5: 规则兜底（预设模板回复）
```

### 实现

```typescript
import Redis from 'ioredis';
import crypto from 'crypto';

const redis = new Redis();

interface FallbackChain {
  providers: string[];
  enableCache: boolean;
  cacheExpiry: number; // 秒
  defaultResponse?: string;
}

const DEFAULT_CHAIN: FallbackChain = {
  providers: ['deepseek', 'qwen', 'ollama'],
  enableCache: true,
  cacheExpiry: 3600,
  defaultResponse: '抱歉，AI 服务暂时不可用，请稍后再试。',
};

async function callWithFallback(
  request: AIRequest,
  chain: FallbackChain = DEFAULT_CHAIN,
): Promise<AIResponse> {
  // 尝试每个 provider
  for (const provider of chain.providers) {
    try {
      const response = await callProvider(provider, request);

      // 成功后写入缓存
      if (chain.enableCache) {
        const cacheKey = buildCacheKey(request);
        await redis.setex(cacheKey, chain.cacheExpiry, JSON.stringify(response));
      }

      return response;
    } catch (err) {
      console.warn(`[${provider}] failed: ${err.message}`);
      await logFailure(provider, err);
    }
  }

  // 所有 provider 都失败，尝试缓存
  if (chain.enableCache) {
    const cached = await redis.get(buildCacheKey(request));
    if (cached) {
      console.info('Fallback to cached response');
      return { ...JSON.parse(cached), fromCache: true };
    }
  }

  // 缓存也没有，返回兜底
  return {
    content: chain.defaultResponse,
    provider: 'fallback',
    fromCache: false,
  };
}

function buildCacheKey(request: AIRequest): string {
  const normalized = JSON.stringify({
    messages: request.messages,
    taskType: request.taskType,
  });
  return `ai:cache:${crypto.createHash('md5').update(normalized).digest('hex')}`;
}
```

### 关键设计决策

**缓存策略怎么定？**

AI 输出是不确定的，同一输入不一定要相同输出。所以缓存不是"总是返回相同结果"，而是作为**降级兜底**——总比"服务不可用"强。

- **适合缓存的**：FAQ 问答、文档摘要、固定 Prompt 的内容生成
- **不适合缓存的**：多轮对话（上下文在变）、创意写作（用户期望不同结果）

**超时怎么设？**

AI API 的超时比普通 API 长得多。建议：
- 非流式请求：30 秒超时
- 流式请求：首 chunk 10 秒超时，后续 chunk 30 秒
- 超时后立即进入下一个 fallback，不等

---

## 限流设计：精细化的 Token 预算

AI 的限流和传统 API 不同——你不只是限制"每秒几次请求"，更要限制 **Token 消耗**，因为这直接关系到成本。

### 多维度限流

```typescript
interface RateLimitConfig {
  // 请求频率限制
  requestsPerMinute: number;
  requestsPerDay: number;

  // Token 预算限制
  tokensPerMinute: number;
  tokensPerDay: number;

  // 并发限制
  maxConcurrent: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  free: {
    requestsPerMinute: 5,
    requestsPerDay: 50,
    tokensPerMinute: 5000,
    tokensPerDay: 50000,
    maxConcurrent: 1,
  },
  pro: {
    requestsPerMinute: 20,
    requestsPerDay: 500,
    tokensPerMinute: 50000,
    tokensPerDay: 500000,
    maxConcurrent: 3,
  },
  enterprise: {
    requestsPerMinute: 100,
    requestsPerDay: 10000,
    tokensPerMinute: 500000,
    tokensPerDay: 5000000,
    maxConcurrent: 10,
  },
};
```

### Redis 滑动窗口实现

```typescript
async function checkRateLimit(
  userId: string,
  tier: string,
  estimatedTokens: number,
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  const config = RATE_LIMITS[tier];
  const now = Date.now();

  // 检查并发
  const concurrent = await redis.get(`ai:concurrent:${userId}`);
  if (Number(concurrent) >= config.maxConcurrent) {
    return { allowed: false, reason: 'Too many concurrent requests' };
  }

  // 检查每分钟请求数（滑动窗口）
  const minuteKey = `ai:rpm:${userId}`;
  const minuteCount = await redis.zcount(minuteKey, now - 60000, now);
  if (minuteCount >= config.requestsPerMinute) {
    return { allowed: false, reason: 'Rate limit: requests per minute', retryAfter: 60 };
  }

  // 检查每日 Token 预算
  const dailyKey = `ai:daily_tokens:${userId}:${new Date().toISOString().slice(0, 10)}`;
  const dailyTokens = Number(await redis.get(dailyKey) || 0);
  if (dailyTokens + estimatedTokens > config.tokensPerDay) {
    return { allowed: false, reason: 'Daily token budget exceeded' };
  }

  // 通过检查，记录这次请求
  await redis.zadd(minuteKey, now, `${now}`);
  await redis.expire(minuteKey, 120);
  await redis.incr(`ai:concurrent:${userId}`);

  return { allowed: true };
}

async function releaseRateLimit(userId: string, actualTokens: number): Promise<void> {
  await redis.decr(`ai:concurrent:${userId}`);

  const dailyKey = `ai:daily_tokens:${userId}:${new Date().toISOString().slice(0, 10)}`;
  await redis.incrby(dailyKey, actualTokens);
  await redis.expire(dailyKey, 86400);
}
```

### 限流后的前端体验

限流不只是后端返回 429——前端也要优雅处理：

```typescript
// 前端限流提示组件
interface RateLimitInfo {
  reason: string;
  retryAfter?: number;
  dailyUsed: number;
  dailyLimit: number;
}

function renderRateLimitUI(info: RateLimitInfo) {
  if (info.reason.includes('daily')) {
    return `今日 AI 额度已用完（${info.dailyUsed}/${info.dailyLimit} tokens），明天重置。升级 Pro 可获得 10 倍额度。`;
  }
  if (info.retryAfter) {
    return `请求太频繁，请 ${info.retryAfter} 秒后再试。`;
  }
  return '当前 AI 服务繁忙，请稍后再试。';
}
```

---

## 成本监控：知道钱花在哪了

每次 AI 调用都要记录成本数据，这是运营 AI 产品的基础。

### 数据模型

```typescript
interface AIUsageRecord {
  id: string;
  timestamp: Date;
  userId: string;
  feature: string;        // 哪个功能在调用：'chat' | 'code-review' | 'summary'
  provider: string;       // 哪个厂商
  model: string;          // 哪个模型
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;           // 折算成人民币
  latency: number;        // 响应时间 ms
  success: boolean;
  fromCache: boolean;
  fromFallback: boolean;
}
```

### 成本计算

```typescript
const PRICING: Record<string, { input: number; output: number }> = {
  'deepseek:deepseek-chat': { input: 0.001, output: 0.002 },       // ¥/千 token
  'openai:gpt-4o':          { input: 0.0175, output: 0.07 },
  'openai:gpt-4o-mini':     { input: 0.00105, output: 0.0042 },
  'qwen:qwen-plus':         { input: 0.004, output: 0.012 },
  'claude:claude-sonnet':   { input: 0.021, output: 0.105 },
  'ollama:*':               { input: 0, output: 0 },                // 本地免费
};

function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const key = `${provider}:${model}`;
  const pricing = PRICING[key] || PRICING[`${provider}:*`];
  if (!pricing) return 0;

  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1000;
}
```

### 监控看板的核心指标

搭成本监控看板时，这些是必须有的指标：

| 指标 | 维度 | 用途 |
|------|------|------|
| **日 Token 消耗** | 按功能/用户/模型 | 发现成本异常 |
| **日均成本** | 按功能 | 评估 ROI |
| **Token 效率** | 输出 tokens / 输入 tokens | 发现 Prompt 浪费 |
| **缓存命中率** | 全局 | 评估缓存策略效果 |
| **降级率** | 按 provider | 监控厂商稳定性 |
| **P99 延迟** | 按模型 | 体验保障 |
| **错误率** | 按 provider/错误类型 | 故障预警 |

---

## 把它们串起来：Gateway 主流程

最后把所有模块串成一个完整的请求处理流程：

```typescript
async function handleAIRequest(request: AIRequest): Promise<AIResponse> {
  const startTime = Date.now();

  // 1. 认证鉴权
  const user = await authenticate(request.token);
  if (!user) throw new UnauthorizedError();

  // 2. 限流检查
  const rateCheck = await checkRateLimit(user.id, user.tier, request.estimatedTokens);
  if (!rateCheck.allowed) {
    throw new RateLimitError(rateCheck.reason, rateCheck.retryAfter);
  }

  // 3. 模型路由
  const route = routeModel({
    ...request,
    userTier: user.tier,
  });

  // 4. 调用（含降级）
  let response: AIResponse;
  try {
    response = await callWithFallback(request, {
      providers: [route.provider, ...getFallbackProviders(route.provider)],
      enableCache: request.taskType !== 'chat',
      cacheExpiry: 3600,
    });
  } finally {
    // 5. 释放并发计数
    await releaseRateLimit(user.id, response?.totalTokens || 0);
  }

  // 6. 输出审核（可选）
  if (shouldAudit(request.taskType)) {
    const auditResult = await auditContent(response.content);
    if (!auditResult.safe) {
      response.content = '抱歉，该回复内容不适合展示。';
      response.audited = true;
    }
  }

  // 7. 记录用量
  await recordUsage({
    userId: user.id,
    feature: request.taskType,
    provider: response.provider,
    model: response.model,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    totalTokens: response.totalTokens,
    cost: calculateCost(response.provider, response.model, response.inputTokens, response.outputTokens),
    latency: Date.now() - startTime,
    success: true,
    fromCache: response.fromCache || false,
    fromFallback: response.provider !== route.provider,
  });

  return response;
}
```

七个步骤，从认证到记录，覆盖了一个生产级 AI Gateway 的核心流程。

---

## 自建 vs 用开源方案

最后一个决策：AI Gateway 要自建还是用现成的？

| 方案 | 优点 | 缺点 | 适合 |
|------|------|------|------|
| **完全自建** | 完全可控，贴合业务 | 开发成本高 | 大厂 / 复杂业务 |
| **LiteLLM** | 开源，多模型支持好 | Python 生态，前端团队不熟 | 需要快速支持 100+ 模型 |
| **Portkey** | SaaS 服务，开箱即用 | 数据过第三方 | 小团队快速上线 |
| **自建 + 参考开源** | 学习开源设计，按需裁剪 | 需要投入理解成本 | **推荐大多数团队** |

我的建议：**先看 LiteLLM 的源码学习设计思路，然后用 Node.js/Python 自建一个裁剪版**，只保留你需要的功能。AI Gateway 是你 AI 系统的核心基础设施，不建议完全依赖第三方。

---

## 总结

1. **AI Gateway 是 AI 系统的核心基础设施**——所有 AI 调用走统一入口，才能管控。
2. **模型路由**按任务类型、用户等级、数据敏感度等维度自动选择最合适的模型。
3. **五层降级**：主模型 → 备用模型 → 本地模型 → 缓存 → 规则兜底，保证永不白屏。
4. **限流不只限请求频率**，更要限 Token 预算——这才是 AI 场景的成本命脉。
5. **每次调用都要记录成本数据**——日 Token 消耗、功能维度分析、降级率是核心指标。
6. **推荐自建**，参考 LiteLLM 等开源方案的设计思路。

下一篇，我们从后端转向前端——AI 应用的状态管理，为什么说它比 Redux 复杂 10 倍。

---

> **下一篇预告**：[04 | AI 应用的状态管理：比 Redux 复杂 10 倍的挑战](/series/senior/04-ai-state-management)

---

**讨论话题**：你的项目里 AI 调用是怎么管理的？有统一的网关层吗？最大的痛点是什么？评论区交流。
