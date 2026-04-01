---
title: "从单 Chat 到多 Agent 系统：AI 应用的架构演进路线"
description: "探索 AI 应用从单 Chat 到多 Agent 系统的架构演进与前端实现"
order: 6
cover: "./cover.png"
publishDate: "2025-08-31"
tags: ["架构", "Agent", "Multi-Agent", "前端"]
---

# 从单 Chat 到多 Agent 系统：AI 应用的架构演进路线

> 本文是【高级前端的 AI 架构升级之路】系列第 06 篇。
> 上一篇：[AI Streaming 架构：从浏览器到服务端的全链路流式设计](/series/senior/05-streaming-architecture) | 下一篇：[AI 应用的安全架构：Prompt 注入、数据泄露、权限边界](/series/senior/07-ai-security)

---

## 引言

前五篇搞定了 AI 应用的基础架构——网关、状态管理、流式链路。但这些都建立在一个假设上：**一个 AI 做一件事**。

现实场景远比这复杂。一个"智能项目助手"可能需要：
- 代码 Agent 负责生成和审查代码
- 文档 Agent 负责检索和更新知识库
- 运维 Agent 负责查询部署状态和日志
- 协调 Agent 决定什么时候调哪个 Agent

这就是 **Multi-Agent 系统**——多个 AI 各司其职、协作完成任务。对前端架构来说，这意味着一系列全新的挑战。

---

## AI 应用的五层演进

```
L0: 单次调用     → callAI(prompt) → 返回结果
L1: 多轮对话     → 维护 messages 数组，上下文管理
L2: RAG 增强     → 检索相关文档 → 注入上下文 → 调 AI
L3: Tool Use     → AI 可以调用工具（Function Calling）
L4: Multi-Agent  → 多个 AI 各有角色，协作完成复杂任务
```

### 每一层对前端的架构影响

| 层级 | 后端变化 | 前端架构影响 |
|------|---------|-------------|
| L0 | 无状态 | 简单请求-响应 |
| L1 | 会话管理 | 对话历史 UI、上下文指示器 |
| L2 | 向量检索 + 上下文拼接 | 引用来源展示、知识库关联 |
| L3 | 工具调用循环 | 工具调用过程可视化、确认弹窗 |
| **L4** | **Agent 编排、并行/串行调度** | **多 Agent 状态展示、思考过程、冲突处理** |

L4 的前端复杂度是指数级增长——因为你不再展示"一个 AI 在说话"，而是展示"一群 AI 在协作"。

---

## Agent 编排模式

### 模式一：串行（Pipeline）

```
用户输入 → Agent A → Agent B → Agent C → 最终输出

示例：智能写作
用户输入主题 → 大纲Agent生成大纲 → 写作Agent撰写正文 → 审校Agent校对润色
```

**前端**：展示为步骤条 / 进度条，每个 Agent 完成一步点亮一个节点。

```typescript
interface PipelineStep {
  agent: string
  status: 'pending' | 'running' | 'done' | 'error'
  input?: string
  output?: string
  startTime?: number
  endTime?: number
}

// SSE 事件类型
type PipelineEvent =
  | { type: 'step_start'; agent: string }
  | { type: 'step_stream'; agent: string; content: string }
  | { type: 'step_done'; agent: string; output: string }
  | { type: 'pipeline_done'; finalOutput: string }
```

### 模式二：并行（Fan-out / Fan-in）

```
                ┌→ Agent A（搜索技术文档）→┐
用户输入 → 分发 ├→ Agent B（搜索 Stack Overflow）→├→ 汇总 → 最终输出
                └→ Agent C（搜索 GitHub Issues）→┘

示例：智能搜索
用户问一个技术问题 → 同时搜三个来源 → 汇总最相关的答案
```

**前端**：多列并排展示，每列一个 Agent 的实时输出，最后合并。

```typescript
interface ParallelAgents {
  agents: {
    [agentId: string]: {
      name: string
      status: 'running' | 'done'
      streamContent: string
    }
  }
  mergedResult?: string
}
```

### 模式三：路由（Router）

```
                 ┌→ 代码Agent（代码相关）
用户输入 → 路由Agent ├→ 文档Agent（文档相关）
                 └→ 通用Agent（其他）

示例：全能助手
用户输入先经过分类，路由到最合适的专家Agent
```

**前端**：展示路由决策——"AI 判断这是一个代码问题，已转给代码专家"。

### 模式四：监督者（Supervisor）

```
              ┌→ 研究Agent ←┐
Supervisor ←──┼→ 写作Agent ←┤ ← 协调、分配、审核
              └→ 审校Agent ←┘

示例：报告生成
Supervisor 把任务拆分，分配给不同Agent，审核结果，不满意就退回重做
```

**前端**：最复杂——展示 Supervisor 的决策树、各 Agent 的任务分配、重试过程。

---

## 前端架构：多 Agent 状态管理

### 状态模型

```typescript
interface MultiAgentState {
  sessionId: string
  mode: 'pipeline' | 'parallel' | 'router' | 'supervisor'

  // 全局状态
  status: 'idle' | 'running' | 'done' | 'error'
  userInput: string
  finalOutput?: string

  // 各 Agent 状态
  agents: Record<string, AgentState>

  // Agent 间通信记录
  messages: AgentMessage[]

  // 执行轨迹（用于可视化）
  trace: TraceEvent[]
}

interface AgentState {
  id: string
  name: string
  role: string
  status: 'idle' | 'thinking' | 'tool_calling' | 'streaming' | 'done' | 'error'
  currentTask?: string
  streamContent: string
  toolCalls: ToolCallRecord[]
  output?: string
  tokenUsage: { input: number; output: number }
}

interface AgentMessage {
  from: string  // agentId 或 'user' 或 'supervisor'
  to: string
  content: string
  timestamp: number
}

interface TraceEvent {
  type: 'agent_start' | 'agent_end' | 'tool_call' | 'handoff' | 'decision'
  agentId: string
  detail: any
  timestamp: number
}
```

### SSE 协议设计

后端通过 SSE 推送多 Agent 的事件流：

```typescript
// 后端推送的事件类型
type ServerEvent =
  // Agent 生命周期
  | { type: 'agent_start'; agentId: string; task: string }
  | { type: 'agent_thinking'; agentId: string; thought: string }
  | { type: 'agent_stream'; agentId: string; content: string }
  | { type: 'agent_done'; agentId: string; output: string }
  | { type: 'agent_error'; agentId: string; error: string }

  // 工具调用
  | { type: 'tool_call'; agentId: string; tool: string; args: any }
  | { type: 'tool_result'; agentId: string; tool: string; result: any }

  // Agent 间协作
  | { type: 'handoff'; from: string; to: string; message: string }
  | { type: 'supervisor_decision'; decision: string; assignments: any }

  // 全局
  | { type: 'final_output'; content: string }
  | { type: 'done'; tokenUsage: any }
```

前端统一消费事件流，更新对应 Agent 的状态：

```typescript
function handleServerEvent(event: ServerEvent, state: MultiAgentState) {
  switch (event.type) {
    case 'agent_start':
      state.agents[event.agentId].status = 'thinking'
      state.agents[event.agentId].currentTask = event.task
      break

    case 'agent_stream':
      state.agents[event.agentId].status = 'streaming'
      state.agents[event.agentId].streamContent += event.content
      break

    case 'agent_done':
      state.agents[event.agentId].status = 'done'
      state.agents[event.agentId].output = event.output
      break

    case 'handoff':
      state.messages.push({
        from: event.from,
        to: event.to,
        content: event.message,
        timestamp: Date.now(),
      })
      break

    case 'final_output':
      state.finalOutput = event.content
      state.status = 'done'
      break
  }

  state.trace.push({
    type: event.type as any,
    agentId: (event as any).agentId || 'system',
    detail: event,
    timestamp: Date.now(),
  })
}
```

---

## Thinking UI：展示 Agent 的思考过程

Multi-Agent 系统最重要的 UX 设计——**让用户看到 AI 在干什么**。

### 设计原则

1. **透明度**——用户知道哪些 Agent 在工作、各自在做什么
2. **进度感**——即使 AI 还没出最终结果，也能看到中间进展
3. **可控性**——用户可以中断、跳过某个 Agent、手动干预

### UI 方案

```
┌────────────────────────────────────────────────┐
│  用户: "帮我重构这个模块并更新文档"                    │
├────────────────────────────────────────────────┤
│                                                │
│  🤖 Supervisor                                  │
│  └─ 已拆分为 2 个子任务                            │
│                                                │
│  ┌─ 🔧 代码Agent ──────┐  ┌─ 📝 文档Agent ────┐  │
│  │ ✅ 分析现有代码结构     │  │ ⏳ 等待代码Agent...  │  │
│  │ ✅ 生成重构方案        │  │                    │  │
│  │ 🔄 正在重写代码...     │  │                    │  │
│  │ ▌                    │  │                    │  │
│  └─────────────────────┘  └─────────────────── ┘  │
│                                                │
│  📊 Token 消耗: 1,234 input / 567 output          │
│  ⏱ 已用时: 12s                                    │
│                                                │
│  [停止] [跳过当前Agent]                             │
└────────────────────────────────────────────────┘
```

### 关键组件

```typescript
// AgentCard 组件
interface AgentCardProps {
  agent: AgentState
  onSkip?: () => void
  onRetry?: () => void
}

// ThinkingIndicator - 展示 Agent 的思考步骤
interface ThinkingStep {
  label: string
  status: 'done' | 'running' | 'pending'
  detail?: string
}

// TraceTimeline - 执行轨迹时间线
interface TraceTimelineProps {
  events: TraceEvent[]
  agents: Record<string, AgentState>
}
```

---

## 冲突处理

当多个 Agent 同时操作时可能产生冲突。

### 场景

- 代码 Agent 修改了 `utils.ts`，同时文档 Agent 也在引用 `utils.ts` 的旧版本
- 两个 Agent 对同一问题给出了矛盾的建议

### 策略

```typescript
interface ConflictResolution {
  strategy: 'supervisor_decides' | 'user_decides' | 'last_write_wins' | 'merge'
}

// Supervisor 决策
async function resolveConflict(conflicts: Conflict[]): Promise<Resolution> {
  // 方案1：交给 Supervisor Agent 仲裁
  const resolution = await supervisorAgent.resolve(conflicts)

  // 方案2：展示给用户选择
  if (resolution.confidence < 0.8) {
    return { strategy: 'user_decides', options: resolution.options }
  }

  return resolution
}
```

**前端**：当检测到冲突时，弹出对比视图让用户选择，类似 Git merge conflict 的 UI。

---

## 性能考量

### 渲染优化

多个 Agent 同时流式输出 = 高频 DOM 更新。

```typescript
// 方案：合并更新 + RAF 节流
class MultiAgentRenderer {
  private pendingUpdates = new Map<string, string>()
  private rafId: number | null = null

  queueUpdate(agentId: string, content: string) {
    const existing = this.pendingUpdates.get(agentId) || ''
    this.pendingUpdates.set(agentId, existing + content)

    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => this.flush())
    }
  }

  private flush() {
    this.pendingUpdates.forEach((content, agentId) => {
      // 批量更新 DOM
      updateAgentContent(agentId, content)
    })
    this.pendingUpdates.clear()
    this.rafId = null
  }
}
```

### WebSocket vs SSE

多 Agent 场景更适合 WebSocket——因为需要双向通信（用户可能要中途干预某个 Agent）。

```typescript
const ws = new WebSocket('/ws/multi-agent')

ws.onmessage = (event) => {
  const serverEvent = JSON.parse(event.data) as ServerEvent
  handleServerEvent(serverEvent, state)
}

// 用户干预
function skipAgent(agentId: string) {
  ws.send(JSON.stringify({ type: 'skip_agent', agentId }))
}

function retryAgent(agentId: string) {
  ws.send(JSON.stringify({ type: 'retry_agent', agentId }))
}
```

---

## 实战：多 Agent 协作的任务执行界面

### 后端编排（Python 伪代码）

```python
async def multi_agent_task(user_input: str, websocket: WebSocket):
    supervisor = SupervisorAgent()
    agents = {
        "coder": CoderAgent(),
        "reviewer": ReviewerAgent(),
        "documenter": DocumenterAgent(),
    }

    # Supervisor 拆分任务
    plan = await supervisor.plan(user_input)
    await websocket.send_json({
        "type": "supervisor_decision",
        "decision": plan.summary,
        "assignments": plan.assignments,
    })

    # 按依赖关系执行
    for step in plan.execution_order:
        if step.parallel:
            # 并行执行
            tasks = [
                run_agent(agents[a], step.tasks[a], websocket)
                for a in step.agent_ids
            ]
            await asyncio.gather(*tasks)
        else:
            # 串行执行
            await run_agent(agents[step.agent_id], step.task, websocket)

    # 汇总最终结果
    final = await supervisor.summarize(
        {a: agents[a].output for a in agents}
    )
    await websocket.send_json({"type": "final_output", "content": final})
```

### 前端核心布局

```
┌──────────────────────────────────────────┐
│  Multi-Agent Task View                    │
├──────────┬───────────────────────────────┤
│          │                               │
│  Agent   │   主内容区                      │
│  列表     │   （当前选中 Agent 的详细输出）    │
│          │                               │
│  🟢 Coder │                               │
│  🟡 Reviewer│                              │
│  ⚪ Docs   │                               │
│          │                               │
├──────────┴───────────────────────────────┤
│  执行轨迹时间线                              │
│  ●──●──●──●──○──○                         │
└──────────────────────────────────────────┘
```

---

## 总结

1. **AI 应用五层演进**：L0 单次调用 → L1 多轮 → L2 RAG → L3 Tool Use → L4 Multi-Agent，每层前端复杂度递增。
2. **四种编排模式**：串行（Pipeline）、并行（Fan-out/Fan-in）、路由（Router）、监督者（Supervisor）。
3. **前端核心挑战**：多 Agent 状态管理、SSE/WebSocket 协议设计、Thinking UI、冲突处理。
4. **Thinking UI 是关键**——用户需要看到每个 Agent 在做什么，才有信任感和控制感。
5. **性能**：多路流式输出用 RAF 合并渲染，WebSocket 支持双向干预。

---

> **下一篇预告**：[07 | AI 应用的安全架构：Prompt 注入、数据泄露、权限边界](/series/senior/07-ai-security)

---

**架构讨论**：你在做 Multi-Agent 系统时，选的是哪种编排模式？前端怎么展示多 Agent 协作过程？评论区聊聊。
