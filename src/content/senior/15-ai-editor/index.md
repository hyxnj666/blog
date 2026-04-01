---
title: "AI + 编辑器：富文本 / 代码编辑器中的 AI 集成方案"
description: "深入解析富文本和代码编辑器中 AI 集成的技术方案与实现细节"
order: 15
cover: "./cover.png"
publishDate: "2025-11-02"
tags: ["编辑器", "AI集成", "TipTap", "Monaco Editor"]
---

# AI + 编辑器：富文本 / 代码编辑器中的 AI 集成方案

> 本文是【高级前端的 AI 架构升级之路】系列第 15 篇。
> 上一篇：[AI 功能的 A/B 测试和效果度量：怎么证明 AI 功能有用](/series/senior/14-ai-ab-testing) | 下一篇：[AI 应用的商业化设计：从技术 Demo 到能收费的产品](/series/senior/16-ai-monetization)

---

## 引言

编辑器是前端最复杂的组件之一。而"编辑器 + AI"是 2025-2026 年产品差异化的核心战场——Notion AI、Cursor、Google Docs AI，都在编辑器上做文章。

作为高级前端，你很可能要做这件事：**给公司现有的编辑器加上 AI 能力**。

---

## 两类编辑器，两种策略

| 类型 | 代表 | AI 集成重点 |
|------|------|-----------|
| **富文本编辑器** | TipTap、Slate、ProseMirror | 内容生成、改写、翻译 |
| **代码编辑器** | Monaco Editor、CodeMirror | 补全、解释、重构 |

核心区别：富文本编辑器操作的是**结构化文档**（JSON/HTML），代码编辑器操作的是**纯文本**。

---

## 富文本编辑器 AI 集成

以 TipTap（基于 ProseMirror）为例。

### AI Extension 架构

```typescript
// tiptap-ai-extension.ts
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

const AIExtensionKey = new PluginKey('ai')

export const AIExtension = Extension.create({
  name: 'ai',

  addCommands() {
    return {
      aiRewrite: (options: { tone?: string }) => ({ editor, tr }) => {
        const { from, to } = editor.state.selection
        const selectedText = editor.state.doc.textBetween(from, to)

        if (!selectedText) return false

        // 标记为正在处理
        this.storage.processing = true

        // 异步调用 AI
        callAI({
          prompt: `改写以下内容，语气: ${options.tone || '专业'}\n\n${selectedText}`,
        }).then(result => {
          editor.chain()
            .focus()
            .deleteRange({ from, to })
            .insertContentAt(from, result)
            .run()

          this.storage.processing = false
        })

        return true
      },

      aiContinue: () => ({ editor }) => {
        const endPos = editor.state.doc.content.size
        const context = editor.state.doc.textBetween(
          Math.max(0, endPos - 2000), endPos
        )

        callAIStream({
          prompt: `续写以下内容:\n\n${context}`,
          onChunk: (chunk) => {
            editor.commands.insertContentAt(editor.state.doc.content.size, chunk)
          },
        })

        return true
      },

      aiTranslate: (language: string) => ({ editor }) => {
        const { from, to } = editor.state.selection
        const selectedText = editor.state.doc.textBetween(from, to)

        callAI({
          prompt: `将以下内容翻译为${language}:\n\n${selectedText}`,
        }).then(result => {
          editor.chain()
            .focus()
            .deleteRange({ from, to })
            .insertContentAt(from, result)
            .run()
        })

        return true
      },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-j': () => this.editor.commands.aiContinue(),
      'Mod-Shift-r': () => this.editor.commands.aiRewrite({}),
    }
  },
})
```

### Slash Command 菜单

```typescript
// slash-command.ts
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'

const aiCommands = [
  { id: 'continue', label: '继续写', icon: '✍️', action: (editor) => editor.commands.aiContinue() },
  { id: 'rewrite', label: '改写', icon: '✏️', action: (editor) => editor.commands.aiRewrite({}) },
  { id: 'summarize', label: '总结', icon: '📋', action: (editor) => editor.commands.aiSummarize() },
  { id: 'translate-en', label: '翻译为英文', icon: '🌐', action: (editor) => editor.commands.aiTranslate('English') },
  { id: 'longer', label: '扩写', icon: '📝', action: (editor) => editor.commands.aiExpand() },
  { id: 'shorter', label: '精简', icon: '✂️', action: (editor) => editor.commands.aiShorten() },
  { id: 'fix', label: '修正语法', icon: '🔧', action: (editor) => editor.commands.aiFix() },
]

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        items: ({ query }: { query: string }) => {
          return aiCommands.filter(cmd =>
            cmd.label.toLowerCase().includes(query.toLowerCase())
          )
        },
        render: () => {
          // 渲染下拉菜单
          let popup: HTMLElement
          return {
            onStart(props: any) {
              popup = createPopup(props.items, props.command)
              document.body.appendChild(popup)
            },
            onUpdate(props: any) {
              updatePopup(popup, props.items)
            },
            onExit() {
              popup?.remove()
            },
          }
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...this.options.suggestion })]
  },
})
```

### AI 生成内容的 Decoration

在 AI 生成内容时，用不同颜色高亮标记"AI 生成的部分"。

```typescript
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// 用 ProseMirror Decoration 标记 AI 生成的范围
function createAIDecoration(from: number, to: number): DecorationSet {
  return DecorationSet.create(doc, [
    Decoration.inline(from, to, {
      class: 'ai-generated',
      'data-ai': 'true',
    }),
  ])
}
```

```css
.ai-generated {
  background-color: rgba(139, 92, 246, 0.1);
  border-left: 2px solid #8b5cf6;
  transition: background-color 0.3s;
}

.ai-generated:hover {
  background-color: rgba(139, 92, 246, 0.2);
}
```

---

## 代码编辑器 AI 集成

以 Monaco Editor 为例。

### Inline Completion Provider

```typescript
import * as monaco from 'monaco-editor'

class AIInlineCompletionProvider implements monaco.languages.InlineCompletionsProvider {
  async provideInlineCompletions(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.InlineCompletionContext,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.InlineCompletions> {
    // 获取光标前的上下文
    const textBeforeCursor = model.getValueInRange({
      startLineNumber: Math.max(1, position.lineNumber - 50),
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    })

    // 获取光标后的上下文
    const textAfterCursor = model.getValueInRange({
      startLineNumber: position.lineNumber,
      startColumn: position.column,
      endLineNumber: Math.min(model.getLineCount(), position.lineNumber + 10),
      endColumn: model.getLineMaxColumn(Math.min(model.getLineCount(), position.lineNumber + 10)),
    })

    if (token.isCancellationRequested) return { items: [] }

    try {
      const suggestion = await callAI({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Complete the following code. Only return the completion, no explanation.

File: ${model.uri.path}
Language: ${model.getLanguageId()}

Code before cursor:
${textBeforeCursor}
[CURSOR]
Code after cursor:
${textAfterCursor}`,
        }],
        max_tokens: 150,
        stop: ['\n\n\n'],
      })

      return {
        items: [{
          insertText: suggestion,
          range: new monaco.Range(
            position.lineNumber, position.column,
            position.lineNumber, position.column
          ),
        }],
      }
    } catch {
      return { items: [] }
    }
  }

  freeInlineCompletions() {}
}

// 注册
monaco.languages.registerInlineCompletionsProvider(
  { pattern: '**' },
  new AIInlineCompletionProvider()
)
```

### Code Action Provider

```typescript
class AICodeActionProvider implements monaco.languages.CodeActionProvider {
  async provideCodeActions(
    model: monaco.editor.ITextModel,
    range: monaco.Range,
    context: monaco.languages.CodeActionContext,
  ): Promise<monaco.languages.CodeActionList> {
    const selectedText = model.getValueInRange(range)
    if (!selectedText) return { actions: [], dispose: () => {} }

    const actions: monaco.languages.CodeAction[] = [
      {
        title: '🔧 AI: 重构选中代码',
        kind: 'refactor.ai',
        command: {
          id: 'ai.refactor',
          title: 'AI Refactor',
          arguments: [selectedText, range],
        },
      },
      {
        title: '💡 AI: 解释这段代码',
        kind: 'source.ai',
        command: {
          id: 'ai.explain',
          title: 'AI Explain',
          arguments: [selectedText],
        },
      },
      {
        title: '🧪 AI: 生成单元测试',
        kind: 'source.ai',
        command: {
          id: 'ai.generateTest',
          title: 'AI Generate Test',
          arguments: [selectedText, model.uri.path],
        },
      },
    ]

    return { actions, dispose: () => {} }
  }
}
```

### Diff Preview（修改预览）

```typescript
// 用 Monaco Diff Editor 展示 AI 修改建议
function showAIDiff(original: string, aiSuggested: string, language: string) {
  const diffEditor = monaco.editor.createDiffEditor(container, {
    renderSideBySide: true,
    readOnly: true,
    automaticLayout: true,
  })

  diffEditor.setModel({
    original: monaco.editor.createModel(original, language),
    modified: monaco.editor.createModel(aiSuggested, language),
  })

  // Accept / Reject 按钮
  addActionButtons(diffEditor, {
    onAccept: () => {
      mainEditor.setValue(aiSuggested)
      diffEditor.dispose()
    },
    onReject: () => {
      diffEditor.dispose()
    },
  })
}
```

---

## 通用挑战

### 1. 光标位置管理

AI 插入内容后，光标应该在哪？

```typescript
// 策略：AI 内容插入后，光标移到插入内容末尾
function insertAIContent(editor: Editor, content: string, position: Position) {
  const endPosition = editor.model.getPositionAt(
    editor.model.getOffsetAt(position) + content.length
  )
  editor.executeEdits('ai', [{
    range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
    text: content,
  }])
  editor.setPosition(endPosition)
  editor.focus()
}
```

### 2. Undo/Redo 兼容

AI 修改必须作为一个整体可以 Undo。

```typescript
// ProseMirror: 用 transaction 包装
editor.view.dispatch(
  editor.view.state.tr
    .delete(from, to)
    .insert(from, newContent)
    .setMeta('addToHistory', true)  // 确保进入 undo 历史
    .setMeta('aiGenerated', true)   // 标记为 AI 生成
)

// Monaco: 用 pushEditOperations
model.pushEditOperations(
  [],
  [{ range, text: aiContent }],
  () => null  // 返回光标位置
)
```

### 3. 流式插入的性能

AI 流式输出时，每个 token 都触发编辑器更新会很卡。

```typescript
// 用 buffer + RAF 批量更新
let buffer = ''
let rafId: number | null = null

function onStreamChunk(chunk: string) {
  buffer += chunk

  if (!rafId) {
    rafId = requestAnimationFrame(() => {
      editor.commands.insertContentAt(editor.state.doc.content.size, buffer)
      buffer = ''
      rafId = null
    })
  }
}
```

---

## 总结

1. **富文本编辑器**——基于 TipTap/ProseMirror 的 Extension 机制，通过 Commands + Slash Menu + Decoration 集成 AI。
2. **代码编辑器**——基于 Monaco 的 InlineCompletionProvider + CodeActionProvider + DiffEditor 集成 AI。
3. **光标和 Undo**——AI 修改必须正确管理光标位置，并作为整体可 Undo。
4. **流式性能**——用 buffer + RAF 批量更新，避免逐 token 刷新导致卡顿。
5. **AI 标记**——用 Decoration 或 CSS 区分"AI 生成"和"人工输入"的内容。

---

> **下一篇预告**：[16 | AI 应用的商业化设计：从技术 Demo 到能收费的产品](/series/senior/16-ai-monetization)

---

**编辑器讨论**：你们的产品有在编辑器里集成 AI 吗？用的什么编辑器？评论区聊聊。
