---
title: "AI 交互设计模式：超越聊天框的 10 种 AI UI 范式"
description: "探索超越聊天框的 10 种 AI 交互设计模式与前端实现方案"
order: 13
cover: "./cover.png"
publishDate: "2025-10-19"
tags: ["交互设计", "前端", "UI", "用户体验"]
---

# AI 交互设计模式：超越聊天框的 10 种 AI UI 范式

> 本文是【高级前端的 AI 架构升级之路】系列第 13 篇。
> 上一篇：[AI 应用的可观测性：你的 AI 系统在生产上到底表现怎么样](/series/senior/12-observability) | 下一篇：[AI 功能的 A/B 测试和效果度量：怎么证明 AI 功能有用](/series/senior/14-ai-ab-testing)

---

## 引言

提到 AI 产品，你脑子里是不是只有聊天框？

ChatGPT 式的对话界面只是 AI 交互的冰山一角。作为高级前端，**设计 AI 交互模式**才是你的核心竞争力——产品经理想不到的交互方式，得由你来提。

---

## 范式一：Inline Completion（行内补全）

**代表产品**：GitHub Copilot、Cursor

```
用户正在输入 → AI 实时预测后续内容 → 灰色文字显示 → Tab 确认
```

### 核心交互

```typescript
// 行内补全的前端状态
interface InlineCompletion {
  position: { line: number; column: number }
  suggestion: string
  visible: boolean
  loading: boolean
}

// 防抖触发补全
function useInlineCompletion(editor: Editor) {
  const completion = ref<InlineCompletion | null>(null)

  const requestCompletion = useDebounceFn(async (context: string, position: Position) => {
    completion.value = { position, suggestion: '', visible: false, loading: true }

    const result = await callAI({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `续写以下代码:\n${context}` }],
      max_tokens: 100,
      stop: ['\n\n'],
    })

    completion.value = {
      position,
      suggestion: result,
      visible: true,
      loading: false,
    }
  }, 500)

  // Tab 接受，Esc 拒绝
  editor.onKeyDown((e) => {
    if (e.key === 'Tab' && completion.value?.visible) {
      e.preventDefault()
      editor.insertText(completion.value.suggestion)
      completion.value = null
    }
    if (e.key === 'Escape') {
      completion.value = null
    }
  })

  return { completion, requestCompletion }
}
```

### 适用场景
- 代码编辑器
- 文本编辑（邮件、文档）
- 搜索框联想

---

## 范式二：Command Palette（命令面板）

**代表产品**：Notion AI、Raycast AI

```
用户按快捷键 → 弹出命令面板 → 输入自然语言指令 → AI 执行操作
```

### 核心交互

```vue
<template>
  <Teleport to="body">
    <div v-if="visible" class="command-palette">
      <input
        v-model="query"
        placeholder="输入 AI 指令..."
        @keydown.enter="executeCommand"
        @keydown.escape="visible = false"
        autofocus
      />
      <div class="suggestions">
        <div
          v-for="cmd in filteredCommands"
          :key="cmd.id"
          class="command-item"
          @click="executeCommand(cmd)"
        >
          <span class="icon">{{ cmd.icon }}</span>
          <span class="label">{{ cmd.label }}</span>
          <span class="shortcut">{{ cmd.shortcut }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
```

### 预定义 + 自由指令

```typescript
const commands = [
  { id: 'summarize', label: '总结选中内容', icon: '📝', action: summarizeSelection },
  { id: 'translate', label: '翻译为英文', icon: '🌐', action: translateSelection },
  { id: 'fix', label: '修正语法错误', icon: '🔧', action: fixGrammar },
  { id: 'tone', label: '调整语气', icon: '🎭', action: changeTone },
  // 自由指令：不匹配预定义命令时，直接发给 AI
]
```

### 适用场景
- 富文本编辑器
- IDE
- 管理后台的批量操作

---

## 范式三：Side Panel（侧边面板）

**代表产品**：Cursor Chat、Figma AI

```
用户在主工作区操作 → 右侧面板提供 AI 辅助 → 结果可直接应用到工作区
```

### 核心设计

```
┌────────────────────────┬──────────────┐
│                        │  AI 助手面板   │
│    主工作区             │              │
│    (代码/文档/设计)     │  [对话历史]    │
│                        │  [建议列表]    │
│    ← AI 修改高亮 →     │  [应用按钮]    │
│                        │              │
└────────────────────────┴──────────────┘
```

关键点：**AI 建议 ≠ 自动执行**。用户需要明确"应用"动作。

```typescript
interface AISuggestion {
  id: string
  type: 'replace' | 'insert' | 'delete'
  range: { start: Position; end: Position }
  original: string
  suggested: string
  explanation: string
  applied: boolean
}

function applySuggestion(suggestion: AISuggestion) {
  editor.replaceRange(suggestion.range, suggestion.suggested)
  suggestion.applied = true
}

function revertSuggestion(suggestion: AISuggestion) {
  editor.replaceRange(suggestion.range, suggestion.original)
  suggestion.applied = false
}
```

---

## 范式四：Contextual Popup（上下文弹出）

**代表产品**：Grammarly、Google Docs AI

```
用户选中文本 → 弹出 AI 操作浮窗 → 一键执行（改写/翻译/解释）
```

### 核心交互

```typescript
function useContextualAI(editor: Editor) {
  const popup = ref<{ x: number; y: number; actions: Action[] } | null>(null)

  editor.onSelectionChange((selection) => {
    if (selection.isEmpty) {
      popup.value = null
      return
    }

    const rect = editor.getSelectionRect()
    popup.value = {
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      actions: [
        { label: '改写', icon: '✏️', action: () => rewrite(selection.text) },
        { label: '翻译', icon: '🌐', action: () => translate(selection.text) },
        { label: '解释', icon: '💡', action: () => explain(selection.text) },
        { label: '扩写', icon: '📝', action: () => expand(selection.text) },
      ],
    }
  })

  return { popup }
}
```

---

## 范式五：Progressive Disclosure（渐进展示）

**代表产品**：Perplexity、ChatGPT Search

```
AI 先给简短答案 → 用户可展开查看详情/引用/推理过程
```

### 分层信息架构

```vue
<template>
  <div class="ai-answer">
    <!-- 第一层：直接答案 -->
    <div class="summary">
      <p>{{ answer.summary }}</p>
    </div>

    <!-- 第二层：展开详情 -->
    <details>
      <summary>查看详细分析</summary>
      <div v-html="renderMarkdown(answer.detail)" />
    </details>

    <!-- 第三层：引用来源 -->
    <details>
      <summary>引用来源 ({{ answer.sources.length }})</summary>
      <div v-for="source in answer.sources" :key="source.url" class="source-card">
        <a :href="source.url" target="_blank">{{ source.title }}</a>
        <p class="source-excerpt">{{ source.excerpt }}</p>
        <span class="relevance">相关度: {{ source.score }}%</span>
      </div>
    </details>

    <!-- 第四层：推理过程（Thinking） -->
    <details v-if="answer.reasoning">
      <summary>AI 推理过程</summary>
      <div class="reasoning-steps">
        <div v-for="(step, i) in answer.reasoning" :key="i" class="step">
          <span class="step-number">{{ i + 1 }}</span>
          <span>{{ step }}</span>
        </div>
      </div>
    </details>
  </div>
</template>
```

---

## 范式六：Before/After Preview（修改预览）

**代表产品**：Cursor Apply、Notion AI

```
AI 生成修改建议 → 显示修改前后的 Diff → 用户确认/拒绝
```

### Diff 展示

```typescript
// 基于 diff-match-patch 生成行级 diff
function generateDiff(original: string, modified: string): DiffLine[] {
  const dmp = new DiffMatchPatch()
  const diffs = dmp.diff_main(original, modified)
  dmp.diff_cleanupSemantic(diffs)

  return diffs.map(([type, text]) => ({
    type: type === 0 ? 'unchanged' : type === 1 ? 'added' : 'removed',
    content: text,
  }))
}
```

```vue
<template>
  <div class="diff-preview">
    <div class="diff-header">
      <span>AI 建议的修改</span>
      <div class="actions">
        <button class="accept" @click="applyAll">全部接受</button>
        <button class="reject" @click="rejectAll">全部拒绝</button>
      </div>
    </div>
    <div v-for="line in diffLines" :key="line.id" :class="['diff-line', line.type]">
      <span class="prefix">{{ line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ' }}</span>
      <span class="content">{{ line.content }}</span>
    </div>
  </div>
</template>
```

---

## 范式七：Multi-Step Wizard（多步引导）

**代表产品**：v0.dev、Bolt.new

```
AI 把复杂任务拆成多步 → 每步用户确认/调整 → 最终生成结果
```

```
Step 1: 描述你要做什么 → AI 生成方案
Step 2: 确认技术选型 → AI 开始生成
Step 3: 预览结果 → 用户微调
Step 4: 导出/部署
```

---

## 范式八：Ambient Intelligence（环境智能）

**代表产品**：Notion AI、Gmail Smart Reply

```
AI 在后台默默分析 → 适时出现建议 → 不打断用户流程
```

设计原则：**AI 是配角，不是主角**。

```typescript
// 非侵入式建议
interface AmbientSuggestion {
  trigger: 'idle' | 'pattern' | 'error' | 'completion'
  position: 'inline' | 'toast' | 'badge' | 'margin'
  priority: 'low' | 'medium' | 'high'
  dismissable: boolean
  autoHide: number    // 自动消失时间（ms），0 表示不自动消失
}

const suggestionRules: AmbientSuggestion[] = [
  // 用户停顿 5 秒，轻轻提示
  { trigger: 'idle', position: 'margin', priority: 'low', dismissable: true, autoHide: 10000 },
  // 检测到错误，在行内标注
  { trigger: 'error', position: 'inline', priority: 'high', dismissable: true, autoHide: 0 },
  // 检测到重复模式，Toast 提示
  { trigger: 'pattern', position: 'toast', priority: 'medium', dismissable: true, autoHide: 5000 },
]
```

---

## 范式九：Canvas / Whiteboard（画布模式）

**代表产品**：ChatGPT Canvas、Claude Artifacts

```
左侧对话 → 右侧实时画布/代码预览 → AI 和用户共同编辑
```

核心难点：**AI 修改和用户修改的冲突处理**（类似多人协作编辑的 OT/CRDT 问题）。

---

## 范式十：Agent Dashboard（Agent 面板）

**代表产品**：Devin、OpenAI Operator

```
用户下达任务 → AI Agent 自主执行 → 实时展示进度/决策/中间结果 → 关键节点请求确认
```

```vue
<template>
  <div class="agent-dashboard">
    <!-- 任务进度 -->
    <div class="task-progress">
      <div v-for="step in agent.steps" :key="step.id" :class="['step', step.status]">
        <div class="step-icon">
          <LoadingSpinner v-if="step.status === 'running'" />
          <CheckIcon v-if="step.status === 'done'" />
          <PauseIcon v-if="step.status === 'waiting_approval'" />
        </div>
        <div class="step-info">
          <span class="step-name">{{ step.name }}</span>
          <span class="step-detail">{{ step.detail }}</span>
        </div>
      </div>
    </div>

    <!-- 需要确认的决策 -->
    <div v-if="pendingApproval" class="approval-card">
      <h3>需要你的确认</h3>
      <p>{{ pendingApproval.question }}</p>
      <div class="options">
        <button
          v-for="opt in pendingApproval.options"
          :key="opt.id"
          @click="approve(opt.id)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- 实时输出 -->
    <div class="agent-output">
      <pre>{{ agent.currentOutput }}</pre>
    </div>
  </div>
</template>
```

---

## 选型决策树

```
你的 AI 功能是什么类型？

├── 内容生成/编辑类
│   ├── 用户在编辑器中 → Inline Completion 或 Contextual Popup
│   ├── 需要大段改写 → Before/After Preview
│   └── 多种操作可选 → Command Palette
│
├── 信息查询类
│   ├── 简单问答 → 聊天框（但用 Progressive Disclosure）
│   └── 复杂调研 → Side Panel
│
├── 任务执行类
│   ├── 简单任务 → Command Palette
│   ├── 复杂多步 → Multi-Step Wizard
│   └── 自主执行 → Agent Dashboard
│
└── 辅助增强类
    └── 后台默默工作 → Ambient Intelligence
```

---

## 总结

1. **聊天框只是 10 种范式之一**——别让所有 AI 功能都挤进对话界面。
2. **匹配场景选范式**——编辑场景用 Inline/Contextual，查询场景用 Progressive Disclosure，任务场景用 Wizard/Agent。
3. **AI 是配角**——环境智能的核心原则是不打断用户。
4. **用户控制感**——Before/After Preview 让用户决定是否接受 AI 修改。
5. **高级前端的价值**——这些交互模式的设计和实现，正是产品经理想不到、后端做不了的。

---

> **下一篇预告**：[14 | AI 功能的 A/B 测试和效果度量：怎么证明 AI 功能有用](/series/senior/14-ai-ab-testing)

---

**交互讨论**：你用过的 AI 产品里，哪种交互模式体验最好？评论区聊聊。
