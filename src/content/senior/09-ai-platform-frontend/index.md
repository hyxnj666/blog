---
title: "搭建公司内部的 AI 平台（下）：前端控制台开发"
description: "实现 AI 平台前端控制台：Prompt 编辑器、知识库管理、监控大盘"
order: 9
cover: "./cover.png"
publishDate: "2025-09-21"
tags: ["前端", "AI平台", "Vue", "控制台"]
---

# 搭建公司内部的 AI 平台（下）：前端控制台开发

> 本文是【高级前端的 AI 架构升级之路】系列第 09 篇。
> 上一篇：[搭建公司内部的 AI 平台（上）：架构设计与核心模块](/series/senior/08-ai-platform-backend) | 下一篇：[Prompt 工程化管理：从散落在代码里到版本化、可测试、可回滚](/series/senior/10-prompt-management)

---

## 引言

上一篇设计了 AI 平台的后端架构。这一篇做前端——**AI 平台管控台**。

管控台是团队和 AI 平台交互的唯一界面。做得好，团队自助完成 90% 的操作；做得差，每天被问"怎么配模型""我的额度用了多少"。

作为高级前端，这是你最擅长的领域——把复杂后端能力变成好用的管理界面。

---

## 核心页面规划

| 页面 | 核心功能 | 复杂度 |
|------|---------|--------|
| **模型管理** | 模型列表、权限分配、健康状态 | ⭐⭐ |
| **Prompt 市场** | 模板浏览、在线编辑、版本对比、测试 | ⭐⭐⭐⭐ |
| **知识库管理** | 文档上传、切片预览、检索测试 | ⭐⭐⭐ |
| **用量分析** | 实时看板、多维聚合、成本分析 | ⭐⭐⭐ |
| **权限管理** | 团队 CRUD、API Key 管理、配额 | ⭐⭐ |

---

## 页面一：Prompt 在线编辑器

这是整个管控台最复杂也最有价值的页面。

### 功能拆解

1. **模板编辑**——支持 `{{variable}}` 语法高亮
2. **变量面板**——自动提取变量，提供输入框
3. **在线测试**——填入变量 → 选模型 → 发送 → 查看结果
4. **版本管理**——历史版本列表、Diff 对比、一键回滚
5. **A/B 对比**——两个版本并排运行，对比输出质量

### 模板编辑器

```typescript
// 用 Monaco Editor 做 Prompt 编辑器
import * as monaco from 'monaco-editor'

function createPromptEditor(container: HTMLElement) {
  // 自定义 Prompt 语言高亮
  monaco.languages.register({ id: 'prompt' })
  monaco.languages.setMonarchTokensProvider('prompt', {
    tokenizer: {
      root: [
        [/\{\{[^}]+\}\}/, 'variable'],     // {{variable}} 高亮
        [/##\s.*$/, 'heading'],              // ## 标题
        [/^-\s/, 'list'],                    // - 列表
      ],
    },
  })

  const editor = monaco.editor.create(container, {
    language: 'prompt',
    theme: 'vs-dark',
    wordWrap: 'on',
    minimap: { enabled: false },
    lineNumbers: 'on',
    fontSize: 14,
  })

  return editor
}
```

### 变量自动提取

```typescript
function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) || []
  return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))]
}

// "你是{{company}}的{{role}}助手" → ["company", "role"]
```

### 在线测试面板

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const template = ref('你是{{company}}的客服助手...')
const variables = computed(() => extractVariables(template.value))
const variableValues = ref<Record<string, string>>({})
const selectedModel = ref('gpt-4o-mini')
const testResult = ref('')
const testing = ref(false)

async function runTest() {
  testing.value = true
  // 替换变量
  let prompt = template.value
  for (const [key, value] of Object.entries(variableValues.value)) {
    prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }

  const resp = await fetch('/api/platform/prompt/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model: selectedModel.value }),
  })

  const data = await resp.json()
  testResult.value = data.output
  testing.value = false
}
</script>

<template>
  <div class="prompt-editor-layout">
    <!-- 左侧：编辑器 -->
    <div class="editor-panel">
      <MonacoEditor v-model="template" language="prompt" />
    </div>

    <!-- 右侧：变量 + 测试 -->
    <div class="test-panel">
      <h3>变量</h3>
      <div v-for="v in variables" :key="v" class="variable-input">
        <label>{{ v }}</label>
        <input v-model="variableValues[v]" :placeholder="`输入 ${v}`" />
      </div>

      <h3>模型</h3>
      <select v-model="selectedModel">
        <option value="gpt-4o-mini">GPT-4o Mini</option>
        <option value="deepseek-chat">DeepSeek</option>
        <option value="claude-3-5-sonnet">Claude 3.5</option>
      </select>

      <button @click="runTest" :disabled="testing">
        {{ testing ? '测试中...' : '运行测试' }}
      </button>

      <div v-if="testResult" class="test-result">
        <h3>输出</h3>
        <div class="result-content" v-html="renderMarkdown(testResult)" />
      </div>
    </div>
  </div>
</template>
```

### 版本 Diff 对比

```typescript
import { DiffEditor } from 'monaco-editor'

function showVersionDiff(container: HTMLElement, oldVersion: string, newVersion: string) {
  const diffEditor = monaco.editor.createDiffEditor(container, {
    renderSideBySide: true,
    readOnly: true,
  })

  diffEditor.setModel({
    original: monaco.editor.createModel(oldVersion, 'prompt'),
    modified: monaco.editor.createModel(newVersion, 'prompt'),
  })
}
```

---

## 页面二：知识库管理

### 文档上传 + 处理进度

```vue
<script setup lang="ts">
import { ref } from 'vue'

interface Document {
  id: string
  filename: string
  status: 'uploading' | 'processing' | 'indexed' | 'failed'
  progress: number
  chunkCount: number
}

const documents = ref<Document[]>([])

async function handleUpload(files: FileList) {
  for (const file of files) {
    const doc: Document = {
      id: crypto.randomUUID(),
      filename: file.name,
      status: 'uploading',
      progress: 0,
      chunkCount: 0,
    }
    documents.value.push(doc)

    const formData = new FormData()
    formData.append('file', file)

    const resp = await fetch('/api/platform/kb/upload', {
      method: 'POST',
      body: formData,
    })

    const { taskId } = await resp.json()
    doc.status = 'processing'

    // 轮询处理进度
    pollProgress(doc, taskId)
  }
}

async function pollProgress(doc: Document, taskId: string) {
  const timer = setInterval(async () => {
    const resp = await fetch(`/api/platform/kb/task/${taskId}`)
    const data = await resp.json()

    doc.progress = data.progress
    doc.chunkCount = data.chunkCount || 0

    if (data.status === 'done') {
      doc.status = 'indexed'
      clearInterval(timer)
    } else if (data.status === 'failed') {
      doc.status = 'failed'
      clearInterval(timer)
    }
  }, 2000)
}
</script>
```

### 切片预览

上传文档后，用户需要看到文档被切成了什么样——确认切片质量。

```vue
<template>
  <div class="chunk-preview">
    <div class="chunk-stats">
      <span>共 {{ chunks.length }} 个切片</span>
      <span>平均长度 {{ avgChunkLength }} 字符</span>
    </div>

    <div v-for="(chunk, i) in chunks" :key="i" class="chunk-card">
      <div class="chunk-header">
        <span class="chunk-index">#{{ i + 1 }}</span>
        <span class="chunk-length">{{ chunk.content.length }} 字符</span>
      </div>
      <div class="chunk-content">{{ chunk.content }}</div>
      <div v-if="chunk.overlap" class="chunk-overlap">
        重叠区域: {{ chunk.overlap }}
      </div>
    </div>
  </div>
</template>
```

### 检索测试

```vue
<template>
  <div class="retrieval-test">
    <input v-model="query" placeholder="输入测试问题..." />
    <button @click="testRetrieval">检索</button>

    <div v-for="(result, i) in results" :key="i" class="result-card">
      <div class="result-header">
        <span class="rank">#{{ i + 1 }}</span>
        <span class="score">相似度: {{ (result.score * 100).toFixed(1) }}%</span>
        <span class="source">来源: {{ result.source }}</span>
      </div>
      <div class="result-content">
        <HighlightText :text="result.content" :query="query" />
      </div>
    </div>
  </div>
</template>
```

---

## 页面三：实时监控大盘

### 关键指标卡片

```typescript
interface DashboardMetrics {
  today: {
    totalCalls: number
    totalTokens: number
    totalCost: number
    avgLatency: number
    errorRate: number
    activeTeams: number
  }
  trend: {
    calls7d: number[]      // 近 7 天每日调用量
    cost7d: number[]        // 近 7 天每日成本
    latency7d: number[]     // 近 7 天平均延迟
  }
  byModel: {
    model: string
    calls: number
    tokens: number
    cost: number
    avgLatency: number
  }[]
  byTeam: {
    team: string
    calls: number
    cost: number
    quota: number           // 配额
    usagePercent: number    // 使用百分比
  }[]
}
```

### 可视化布局

```
┌──────────┬──────────┬──────────┬──────────┐
│ 今日调用   │ Token 消耗 │ 今日成本   │ 平均延迟   │
│ 12,345    │ 5.2M     │ $8.45    │ 1.2s     │
│ ↑12%      │ ↑8%      │ ↓3%      │ ↓15%     │
└──────────┴──────────┴──────────┴──────────┘

┌──────────────────────┬───────────────────────┐
│  📈 近 7 天调用趋势     │  🍩 模型分布（饼图）      │
│  [折线图]               │  [饼图]                  │
└──────────────────────┴───────────────────────┘

┌──────────────────────┬───────────────────────┐
│  💰 团队成本排行        │  ⚡ 实时调用流           │
│  [横向柱状图]           │  [滚动列表]              │
└──────────────────────┴───────────────────────┘
```

### 实时调用流

```typescript
// 用 WebSocket 接收实时调用事件
const ws = new WebSocket('/ws/platform/live')

interface LiveCall {
  timestamp: number
  team: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  status: 'success' | 'error'
}

const liveCalls = ref<LiveCall[]>([])

ws.onmessage = (event) => {
  const call = JSON.parse(event.data) as LiveCall
  liveCalls.value.unshift(call)

  // 保持最多 100 条
  if (liveCalls.value.length > 100) {
    liveCalls.value.pop()
  }
}
```

---

## 页面四：权限管理

### 团队配额管理

```vue
<template>
  <div class="team-quota">
    <table>
      <thead>
        <tr>
          <th>团队</th>
          <th>月配额</th>
          <th>已使用</th>
          <th>使用率</th>
          <th>允许模型</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="team in teams" :key="team.id">
          <td>{{ team.name }}</td>
          <td>{{ formatTokens(team.monthlyLimit) }}</td>
          <td>{{ formatTokens(team.used) }}</td>
          <td>
            <ProgressBar
              :percent="team.usagePercent"
              :color="team.usagePercent > 80 ? 'red' : 'green'"
            />
          </td>
          <td>
            <Tag v-for="m in team.allowedModels" :key="m">{{ m }}</Tag>
          </td>
          <td>
            <button @click="editTeam(team)">编辑</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

### API Key 管理

```vue
<template>
  <div class="api-key-management">
    <button @click="createKey">+ 创建 API Key</button>

    <div v-for="key in apiKeys" :key="key.id" class="key-card">
      <div class="key-info">
        <span class="key-name">{{ key.name }}</span>
        <code class="key-value">{{ key.maskedKey }}</code>
        <span class="key-created">{{ formatDate(key.createdAt) }}</span>
      </div>
      <div class="key-actions">
        <button @click="copyKey(key)">复制</button>
        <button @click="revokeKey(key)" class="danger">吊销</button>
      </div>
    </div>
  </div>
</template>
```

---

## 技术选型

| 维度 | 推荐 | 理由 |
|------|------|------|
| **框架** | Vue 3 + TypeScript | 团队熟悉、生态好 |
| **UI 库** | Element Plus / Ant Design Vue | 管控台表格和表单多 |
| **图表** | ECharts | 监控大盘需要丰富图表 |
| **代码编辑** | Monaco Editor | Prompt 编辑、Diff 对比 |
| **状态管理** | Pinia | 轻量够用 |
| **请求** | TanStack Query | 缓存、重试、轮询 |

### 项目结构

```
src/
├── views/
│   ├── dashboard/          # 监控大盘
│   ├── models/             # 模型管理
│   ├── prompts/            # Prompt 市场
│   │   ├── PromptList.vue
│   │   ├── PromptEditor.vue
│   │   ├── PromptDiff.vue
│   │   └── PromptTest.vue
│   ├── knowledge/          # 知识库
│   ├── usage/              # 用量分析
│   └── settings/           # 权限管理
├── components/
│   ├── MonacoEditor.vue
│   ├── ProgressBar.vue
│   ├── LiveCallFeed.vue
│   └── MetricCard.vue
├── api/                    # API 封装
├── stores/                 # Pinia stores
└── utils/
```

---

## 总结

1. **Prompt 编辑器是核心页面**——Monaco Editor + 变量提取 + 在线测试 + 版本 Diff，这四个功能做好就值回票价。
2. **知识库管理**——文档上传 + 处理进度 + 切片预览 + 检索测试，让用户确信"文档被正确理解了"。
3. **实时监控大盘**——指标卡片 + 趋势图 + 模型分布 + 实时调用流，运维必备。
4. **权限管理**——团队配额 + API Key 管理，自助化减少运维沟通。
5. **技术栈**——Vue 3 + Element Plus + ECharts + Monaco，管控台标配。

---

> **下一篇预告**：[10 | Prompt 工程化管理：从散落在代码里到版本化、可测试、可回滚](/series/senior/10-prompt-management)

---

**架构讨论**：你们公司的 AI 管控台长什么样？Prompt 编辑器有哪些必备功能？评论区聊聊。
