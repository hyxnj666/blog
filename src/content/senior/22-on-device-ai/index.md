---
title: "端侧 AI：浏览器里直接跑模型，不调 API"
description: "浏览器端 AI 推理技术栈与端云混合架构实战指南"
order: 22
cover: "./cover.png"
publishDate: "2025-12-21"
tags: ["端侧AI", "WebGPU", "Transformers.js", "浏览器AI"]
---

# 端侧 AI：浏览器里直接跑模型，不调 API

> 本文是【高级前端的 AI 架构升级之路】系列第 22 篇。
> 上一篇：[AI Native 应用：从"给现有产品加 AI"到"为 AI 重新设计产品"](/series/senior/21-ai-native) | 下一篇：[2027 展望：前端工程师在 AI 时代的终局](/series/senior/23-ai-future)

---

## 引言

到目前为止，我们所有的 AI 调用都是：前端 → 后端 → AI API。

但如果模型可以**直接在浏览器里跑**呢？

- 零延迟（不走网络）
- 零成本（不调 API）
- 零隐私风险（数据不出浏览器）

这就是端侧 AI（On-Device AI）——前端开发者的新领地。

---

## 浏览器 AI 技术栈

| 技术 | 成熟度 | 用途 |
|------|--------|------|
| **WebGPU** | 渐趋成熟 | GPU 加速推理 |
| **WebNN** | 早期 | 浏览器原生 AI 推理 API |
| **ONNX Runtime Web** | 可用 | 跨框架模型推理 |
| **Transformers.js** | 可用 | HuggingFace 模型浏览器端运行 |
| **MediaPipe** | 成熟 | 视觉/音频 AI 任务 |
| **TensorFlow.js** | 成熟 | 通用 ML |

---

## Transformers.js：最易上手

### 安装

```bash
npm install @huggingface/transformers
```

### 文本分类

```typescript
import { pipeline } from '@huggingface/transformers'

// 首次加载会下载模型（~50MB），后续使用缓存
const classifier = await pipeline('sentiment-analysis', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english')

const result = await classifier('I love this product!')
// [{ label: 'POSITIVE', score: 0.9998 }]
```

### 文本嵌入（本地向量搜索）

```typescript
const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')

async function getEmbedding(text: string): Promise<number[]> {
  const output = await embedder(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data)
}

// 本地语义搜索
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
  }
  return dotProduct
}

async function localSearch(query: string, documents: string[]): Promise<string[]> {
  const queryEmb = await getEmbedding(query)
  const docEmbs = await Promise.all(documents.map(d => getEmbedding(d)))

  const scored = documents.map((doc, i) => ({
    doc,
    score: cosineSimilarity(queryEmb, docEmbs[i]),
  }))

  return scored.sort((a, b) => b.score - a.score).map(s => s.doc)
}
```

### 图片描述

```typescript
const captioner = await pipeline('image-to-text', 'Xenova/vit-gpt2-image-captioning')

// 从 img 元素或 URL
const result = await captioner('https://example.com/photo.jpg')
// [{ generated_text: 'a dog sitting on a couch' }]
```

---

## Web Worker 隔离

模型推理是 CPU/GPU 密集型任务，**必须在 Web Worker 中运行**，否则会阻塞 UI。

```typescript
// ai-worker.ts
import { pipeline, Pipeline } from '@huggingface/transformers'

let classifier: Pipeline | null = null

self.onmessage = async (e) => {
  const { type, payload, id } = e.data

  if (type === 'init') {
    self.postMessage({ id, type: 'progress', data: 'Loading model...' })

    classifier = await pipeline('sentiment-analysis', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english', {
      progress_callback: (progress: any) => {
        self.postMessage({ id, type: 'progress', data: `${Math.round(progress.progress)}%` })
      },
    })

    self.postMessage({ id, type: 'ready' })
    return
  }

  if (type === 'classify' && classifier) {
    const result = await classifier(payload.text)
    self.postMessage({ id, type: 'result', data: result })
  }
}
```

```typescript
// 主线程使用
class LocalAI {
  private worker: Worker
  private callbacks = new Map<string, (data: any) => void>()

  constructor() {
    this.worker = new Worker(new URL('./ai-worker.ts', import.meta.url), { type: 'module' })

    this.worker.onmessage = (e) => {
      const { id, type, data } = e.data
      const callback = this.callbacks.get(id)
      if (callback && type === 'result') {
        callback(data)
        this.callbacks.delete(id)
      }
    }
  }

  async init(): Promise<void> {
    return new Promise((resolve) => {
      const id = crypto.randomUUID()
      this.worker.onmessage = (e) => {
        if (e.data.type === 'ready') resolve()
      }
      this.worker.postMessage({ id, type: 'init' })
    })
  }

  async classify(text: string): Promise<any> {
    return new Promise((resolve) => {
      const id = crypto.randomUUID()
      this.callbacks.set(id, resolve)
      this.worker.postMessage({ id, type: 'classify', payload: { text } })
    })
  }
}

// Vue 组件中
const localAI = new LocalAI()
await localAI.init()
const result = await localAI.classify('Great product!')
```

---

## 端云混合架构

```
用户输入
  │
  ├── 简单任务（分类、搜索、校验）→ 端侧模型（零成本、零延迟）
  │
  └── 复杂任务（生成、推理、长文）→ 云端 API（GPT-4o / DeepSeek）
```

```typescript
// 端云混合路由
class HybridAI {
  private localAI: LocalAI
  private cloudAI: CloudAI

  async process(input: string, task: string): Promise<string> {
    // 简单任务用本地模型
    const localTasks = ['classify', 'embed', 'detect_language', 'spell_check']
    if (localTasks.includes(task)) {
      return this.localAI.run(task, input)
    }

    // 复杂任务用云端
    return this.cloudAI.call(task, input)
  }

  // 智能路由：先本地预判，再决定是否需要云端
  async smartRoute(input: string): Promise<string> {
    // 用本地模型做意图分类
    const intent = await this.localAI.classify(input)

    if (intent.label === 'simple_query' && intent.score > 0.9) {
      // 本地能处理
      return this.localAI.run('qa', input)
    }

    // 需要云端
    return this.cloudAI.call('chat', input)
  }
}
```

---

## 实际应用场景

| 场景 | 端侧模型 | 优势 |
|------|---------|------|
| **输入校验** | 文本分类模型 | 实时反馈，无延迟 |
| **本地搜索** | Embedding 模型 | 离线可用 |
| **敏感词检测** | 分类模型 | 数据不出浏览器 |
| **OCR** | 文字识别模型 | 隐私保护 |
| **图片分类** | 视觉模型 | 离线可用 |
| **语音输入** | Whisper | 本地转写 |
| **翻译** | 翻译模型 | 离线翻译 |

---

## 性能优化

### 模型加载优化

```typescript
// 1. 预加载（用户进入页面时就开始加载模型）
const modelPromise = pipeline('sentiment-analysis', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english')

// 2. 缓存到 IndexedDB（避免重复下载）
// Transformers.js 默认使用 Cache API 缓存模型文件

// 3. 量化模型（更小、更快）
const model = await pipeline('sentiment-analysis', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english', {
  quantized: true,  // 使用量化版本，模型体积减少 4 倍
})
```

### WebGPU 加速

```typescript
// 检测 WebGPU 支持
const hasWebGPU = 'gpu' in navigator

const model = await pipeline('text-generation', 'Xenova/phi-2', {
  device: hasWebGPU ? 'webgpu' : 'wasm',  // 有 WebGPU 就用 GPU
})
```

---

## 限制和取舍

| 限制 | 影响 | 缓解 |
|------|------|------|
| 模型大小 | 大模型（>1GB）加载慢 | 用量化/蒸馏小模型 |
| 推理速度 | 比云端 GPU 慢 | 只跑小任务 |
| 内存占用 | 大模型占几百 MB | 用完释放 |
| 浏览器兼容性 | WebGPU 覆盖率 ~70% | WASM fallback |
| 模型能力 | 小模型能力有限 | 端云混合，小事本地、大事云端 |

---

## 总结

1. **Transformers.js**——HuggingFace 模型直接在浏览器跑，最容易上手。
2. **Web Worker 隔离**——模型推理必须在 Worker 中，否则卡 UI。
3. **端云混合**——简单任务本地跑（零成本），复杂任务上云端。
4. **量化 + WebGPU**——量化减小体积，WebGPU 加速推理。
5. **前端的新领地**——端侧 AI 完全是前端的活，后端完全不需要参与。

---

> **下一篇预告**：[23 | 2027 展望：前端工程师在 AI 时代的终局](/series/senior/23-ai-future)

---

**端侧讨论**：你在浏览器里跑过 AI 模型吗？哪些场景觉得端侧 AI 有价值？评论区聊聊。
