---
title: "AI 应用的可观测性：你的 AI 系统在生产上到底表现怎么样"
description: "构建 AI 应用的可观测性体系：Metrics、Logs、Traces 与质量评估"
order: 12
cover: "./cover.png"
publishDate: "2025-10-12"
tags: ["可观测性", "监控", "架构", "质量评估"]
---

# AI 应用的可观测性：你的 AI 系统在生产上到底表现怎么样

> 本文是【高级前端的 AI 架构升级之路】系列第 12 篇。
> 上一篇：[MCP Server 进阶：为团队构建标准化的 AI 工具生态](/series/senior/11-mcp-advanced) | 下一篇：[AI 交互设计模式：超越聊天框的 10 种 AI UI 范式](/series/senior/13-ai-interaction-design)

---

## 引言

传统应用的监控你很熟——QPS、P99 延迟、错误率、CPU 内存。但 AI 应用多了一个维度：**输出质量不可控**。

接口 200 了，但回答是胡说八道，你的监控报绿灯。

这就是 AI 可观测性的核心挑战：**不仅要监控"系统健不健康"，还要监控"AI 答得好不好"**。

---

## AI 可观测性的三大支柱

| 支柱 | 传统应用 | AI 应用额外需求 |
|------|---------|----------------|
| **Metrics** | QPS、延迟、错误率 | Token 用量、成本、模型延迟分布 |
| **Logs** | 请求/响应日志 | Prompt 内容、AI 输出、Token 明细 |
| **Traces** | 请求链路追踪 | Prompt → 模型调用 → 后处理 → 输出的全链路 |

在此基础上，AI 应用还需要第四个支柱——**Eval（质量评估）**。

---

## Metrics：AI 应用的关键指标

### 核心指标定义

```typescript
interface AIMetrics {
  // 基础指标
  totalCalls: number
  successRate: number
  errorRate: number
  avgLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
  p99LatencyMs: number

  // AI 特有指标
  totalInputTokens: number
  totalOutputTokens: number
  avgTokensPerCall: number
  totalCost: number
  costPerCall: number

  // 质量指标
  avgQualityScore: number          // AI-as-Judge 评分
  halluccinationRate: number       // 幻觉率
  refusalRate: number              // 拒绝回答率
  formatErrorRate: number          // 格式错误率（JSON 解析失败等）

  // 流式指标
  avgFirstTokenLatency: number     // 首 Token 延迟（TTFT）
  avgTokensPerSecond: number       // Token 吞吐量
  streamAbortRate: number          // 用户中断流式率
}
```

### 指标采集

```typescript
// metrics-collector.ts
class AIMetricsCollector {
  private metrics: Map<string, number[]> = new Map()

  record(event: {
    model: string
    latencyMs: number
    inputTokens: number
    outputTokens: number
    cost: number
    status: 'success' | 'error'
    firstTokenMs?: number
    qualityScore?: number
  }) {
    const { model } = event

    this.push(`${model}.latency`, event.latencyMs)
    this.push(`${model}.input_tokens`, event.inputTokens)
    this.push(`${model}.output_tokens`, event.outputTokens)
    this.push(`${model}.cost`, event.cost)

    if (event.firstTokenMs) {
      this.push(`${model}.ttft`, event.firstTokenMs)
    }
    if (event.qualityScore !== undefined) {
      this.push(`${model}.quality`, event.qualityScore)
    }
    if (event.status === 'error') {
      this.increment(`${model}.errors`)
    }
    this.increment(`${model}.total`)
  }

  getStats(model: string) {
    return {
      totalCalls: this.get(`${model}.total`),
      errorRate: this.get(`${model}.errors`) / this.get(`${model}.total`),
      avgLatency: this.average(`${model}.latency`),
      p95Latency: this.percentile(`${model}.latency`, 0.95),
      avgCost: this.average(`${model}.cost`),
      avgTTFT: this.average(`${model}.ttft`),
      avgQuality: this.average(`${model}.quality`),
    }
  }

  private push(key: string, value: number) {
    if (!this.metrics.has(key)) this.metrics.set(key, [])
    this.metrics.get(key)!.push(value)
  }

  private increment(key: string) {
    this.push(key, 1)
  }

  private get(key: string): number {
    return this.metrics.get(key)?.length || 0
  }

  private average(key: string): number {
    const values = this.metrics.get(key) || []
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
  }

  private percentile(key: string, p: number): number {
    const values = [...(this.metrics.get(key) || [])].sort((a, b) => a - b)
    if (!values.length) return 0
    const index = Math.ceil(values.length * p) - 1
    return values[index]
  }
}
```

---

## Logs：结构化 AI 日志

### 日志格式

```typescript
interface AICallLog {
  // 追踪信息
  traceId: string
  spanId: string
  parentSpanId?: string

  // 请求信息
  timestamp: string
  model: string
  provider: string
  team: string
  user: string

  // Prompt 信息
  promptId?: string
  promptVersion?: number
  systemPrompt: string
  userMessage: string
  messageCount: number

  // 响应信息
  output: string
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error'
  inputTokens: number
  outputTokens: number
  totalTokens: number

  // 性能信息
  latencyMs: number
  firstTokenMs?: number
  tokensPerSecond?: number

  // 成本
  cost: number

  // 质量评估（异步填充）
  qualityScore?: number
  qualityIssues?: string[]
}
```

### 日志中间件

```python
# Python FastAPI 日志中间件
import time
import uuid
import json
from fastapi import Request

@app.middleware("http")
async def ai_logging_middleware(request: Request, call_next):
    trace_id = request.headers.get("X-Trace-Id", str(uuid.uuid4()))
    start_time = time.time()

    # 注入 trace_id
    request.state.trace_id = trace_id

    response = await call_next(request)

    duration_ms = (time.time() - start_time) * 1000

    # AI 调用的特殊日志
    if hasattr(request.state, "ai_call_log"):
        log = request.state.ai_call_log
        log["trace_id"] = trace_id
        log["latency_ms"] = round(duration_ms, 2)

        # 结构化输出到 stdout，便于日志采集
        print(json.dumps(log, ensure_ascii=False))

    return response
```

### 敏感信息脱敏

```typescript
function sanitizeLog(log: AICallLog): AICallLog {
  return {
    ...log,
    // 用户输入脱敏
    userMessage: maskPII(log.userMessage),
    // AI 输出截断
    output: log.output.length > 500 ? log.output.slice(0, 500) + '...[truncated]' : log.output,
    // System Prompt 只记录 ID，不记录全文
    systemPrompt: log.promptId ? `[Prompt: ${log.promptId} v${log.promptVersion}]` : '[inline]',
  }
}

function maskPII(text: string): string {
  return text
    .replace(/1[3-9]\d{9}/g, '1****')         // 手机号
    .replace(/\d{6}(19|20)\d{8}/g, '***')      // 身份证
    .replace(/[\w.]+@[\w.]+/g, '***@***.com')   // 邮箱
}
```

---

## Traces：AI 调用链路追踪

### 为什么需要 Trace

一次用户提问可能涉及多个步骤：

```
用户提问
  ├── [1] 意图识别（AI 调用 1）      50ms
  ├── [2] RAG 检索（向量搜索）        120ms
  ├── [3] 构建 Prompt（拼接上下文）    5ms
  ├── [4] AI 生成（AI 调用 2）        2000ms
  ├── [5] 输出校验（格式检查）         10ms
  └── [6] 安全过滤（敏感词检测）       15ms
                               总耗时: 2200ms
```

### Trace 实现

```typescript
class AITracer {
  private spans: Map<string, Span> = new Map()

  startTrace(name: string): Trace {
    const traceId = crypto.randomUUID()
    return new Trace(traceId, this)
  }

  recordSpan(span: Span) {
    this.spans.set(span.spanId, span)
  }
}

class Trace {
  constructor(
    public traceId: string,
    private tracer: AITracer,
  ) {}

  startSpan(name: string, parentSpanId?: string): Span {
    const span: Span = {
      traceId: this.traceId,
      spanId: crypto.randomUUID(),
      parentSpanId,
      name,
      startTime: Date.now(),
      endTime: 0,
      attributes: {},
    }
    return span
  }

  endSpan(span: Span, attributes?: Record<string, any>) {
    span.endTime = Date.now()
    span.attributes = { ...span.attributes, ...attributes }
    this.tracer.recordSpan(span)
  }
}

interface Span {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  startTime: number
  endTime: number
  attributes: Record<string, any>
}

// 使用
const tracer = new AITracer()
const trace = tracer.startTrace('user_question')

const intentSpan = trace.startSpan('intent_recognition')
const intent = await recognizeIntent(question)
trace.endSpan(intentSpan, { intent, model: 'gpt-4o-mini', tokens: 50 })

const ragSpan = trace.startSpan('rag_retrieval')
const docs = await searchDocs(question)
trace.endSpan(ragSpan, { docCount: docs.length, topScore: docs[0]?.score })

const genSpan = trace.startSpan('ai_generation')
const answer = await generateAnswer(question, docs)
trace.endSpan(genSpan, { model: 'gpt-4o', inputTokens: 2000, outputTokens: 500 })
```

---

## Eval：质量评估

### 在线质量评估

```typescript
// 异步评估，不阻塞主流程
async function asyncQualityEval(log: AICallLog) {
  const checks: QualityCheck[] = [
    // 格式检查
    { name: 'format_valid', fn: checkFormat },
    // 长度检查
    { name: 'length_reasonable', fn: checkLength },
    // 拒绝检查
    { name: 'not_refused', fn: checkNotRefused },
    // AI-as-Judge（用便宜的模型评估贵的模型输出）
    { name: 'ai_judge', fn: aiJudge },
  ]

  const results = await Promise.all(
    checks.map(async check => ({
      name: check.name,
      passed: await check.fn(log),
    }))
  )

  const score = results.filter(r => r.passed).length / results.length
  const issues = results.filter(r => !r.passed).map(r => r.name)

  // 写回日志
  await updateLogQuality(log.traceId, { score, issues })

  // 低分告警
  if (score < 0.5) {
    await sendAlert({
      level: 'warning',
      message: `AI 输出质量低分: ${score}`,
      traceId: log.traceId,
      issues,
    })
  }
}

async function aiJudge(log: AICallLog): Promise<boolean> {
  const response = await callAI({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: `评估以下 AI 回答的质量（1-10 分）。

用户问题: ${log.userMessage}
AI 回答: ${log.output}

只回复一个数字分数。`,
    }],
    max_tokens: 5,
  })

  const score = parseInt(response.choices[0].message.content.trim())
  return score >= 6
}
```

### 告警规则

```typescript
interface AlertRule {
  name: string
  metric: string
  condition: 'gt' | 'lt'
  threshold: number
  window: string       // "5m" / "1h" / "1d"
  severity: 'info' | 'warning' | 'critical'
}

const alertRules: AlertRule[] = [
  { name: '错误率过高', metric: 'error_rate', condition: 'gt', threshold: 0.05, window: '5m', severity: 'critical' },
  { name: 'P95 延迟过高', metric: 'p95_latency', condition: 'gt', threshold: 10000, window: '5m', severity: 'warning' },
  { name: '每小时成本异常', metric: 'hourly_cost', condition: 'gt', threshold: 50, window: '1h', severity: 'warning' },
  { name: '质量评分下降', metric: 'avg_quality', condition: 'lt', threshold: 0.7, window: '1h', severity: 'warning' },
  { name: '首 Token 延迟过高', metric: 'avg_ttft', condition: 'gt', threshold: 3000, window: '5m', severity: 'info' },
  { name: '幻觉率过高', metric: 'hallucination_rate', condition: 'gt', threshold: 0.1, window: '1h', severity: 'critical' },
]
```

---

## 监控大盘设计

### 分层看板

```
┌─────────── L1: 全局概览（给 CTO 看） ──────────┐
│  今日调用 | 今日成本 | 平均质量分 | 错误率 | SLA   │
└────────────────────────────────────────────────┘

┌─────────── L2: 模型维度（给架构师看）──────────┐
│  按模型: 调用量/延迟/成本/质量分布               │
│  模型健康度: 每个模型的 SLA / 错误趋势           │
│  成本明细: 按模型/按团队/按场景                  │
└────────────────────────────────────────────────┘

┌─────────── L3: 调用明细（给开发者看）──────────┐
│  单次调用: Trace 详情 / Prompt / 输出 / 耗时     │
│  异常调用: 低质量/高延迟/高成本的具体调用         │
│  Prompt 性能: 每个 Prompt 模板的平均质量          │
└────────────────────────────────────────────────┘
```

### 前端大盘实现要点

```typescript
// 实时数据用 WebSocket
const ws = new WebSocket('/ws/metrics/live')
ws.onmessage = (e) => {
  const data = JSON.parse(e.data)
  updateDashboard(data)
}

// 历史数据用 TanStack Query + 自动刷新
const { data } = useQuery({
  queryKey: ['ai-metrics', timeRange],
  queryFn: () => fetchMetrics(timeRange),
  refetchInterval: 30000,
})

// ECharts 图表避免频繁重建
const chartRef = useRef<echarts.ECharts | null>(null)
useEffect(() => {
  if (!chartRef.current) {
    chartRef.current = echarts.init(containerRef.current)
  }
  chartRef.current.setOption(options, { notMerge: false })
}, [options])
```

---

## 总结

1. **Metrics**——除了传统的 QPS、延迟，还要监控 Token 用量、成本、TTFT、质量评分。
2. **Logs**——结构化日志记录完整的 Prompt + 输出 + Token 明细，注意 PII 脱敏。
3. **Traces**——追踪一次提问从意图识别到输出的全链路，定位瓶颈。
4. **Eval**——异步质量评估（格式检查 + AI-as-Judge），低分自动告警。
5. **分层看板**——CTO 看全局、架构师看模型、开发者看调用明细。

---

> **下一篇预告**：[13 | AI 交互设计模式：超越聊天框的 10 种 AI UI 范式](/series/senior/13-ai-interaction-design)

---

**架构讨论**：你们的 AI 应用有监控吗？最关心哪些指标？评论区聊聊。
