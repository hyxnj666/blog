---
title: "AI + VS Code 插件：给你的编辑器加上 AI 超能力"
description: "开发 VS Code 插件实现 AI 代码注释、代码解释和 Commit Message 生成"
order: 21
cover: "./cover.png"
publishDate: "2025-10-17"
tags: ["VS Code", "插件开发", "TypeScript", "AI工具", "开发效率"]
---

# AI + VS Code 插件：给你的编辑器加上 AI 超能力

> 本文是【前端转 AI 全栈实战】系列第 21 篇。
> 上一篇：[AI + Chrome 扩展：做一个 AI 驱动的浏览器插件](/series/junior/20-ai-chrome-extension) | 下一篇：[多模态 AI API：不只是文本，图片和语音也能玩](/series/junior/22-multimodal-ai)

---

## 这篇文章你会得到什么

上一篇做了 Chrome 扩展，这一篇做另一个前端最熟悉的平台——**VS Code 插件**。

你每天都在 VS Code 里写代码，如果能做一个插件：
- 选中代码 → AI 自动生成注释
- 选中代码 → AI 解释这段代码做了什么
- Git commit → AI 自动生成 Commit Message

这些都不需要离开编辑器。**VS Code 插件 = 你的 AI 能力直接嵌入工作流。**

---

## VS Code Extension 基础

### 学习曲线比你想的低

| 前端技能 | VS Code Extension 对应 |
|---------|----------------------|
| TypeScript | 插件的主要语言 |
| npm / package.json | 依赖管理完全一样 |
| 事件监听 | `vscode.commands.registerCommand` |
| DOM 操作 | `vscode.window` / `vscode.workspace` API |
| 组件开发 | Webview Panel（嵌入 HTML 页面） |

**你已经会 TypeScript 了——VS Code 插件开发 80% 的知识你已经有了。**

### 项目初始化

```bash
# 安装脚手架
npm install -g yo generator-code

# 生成项目
yo code

# 选择：
# ? What type of extension? → New Extension (TypeScript)
# ? Extension name? → ai-comment-generator
# ? Extension identifier? → ai-comment-generator
# ? Initialize a git repository? → Yes
```

### 项目结构

```
ai-comment-generator/
├── package.json           # 扩展配置（命令、快捷键、菜单）
├── tsconfig.json
├── src/
│   ├── extension.ts       # 入口文件（activate / deactivate）
│   ├── ai.ts              # AI 调用层
│   └── commands/
│       ├── generateComment.ts
│       ├── explainCode.ts
│       └── commitMessage.ts
└── .vscode/
    └── launch.json        # F5 调试配置
```

### package.json 配置

```json
{
  "name": "ai-comment-generator",
  "displayName": "AI Comment Generator",
  "description": "AI 驱动的代码注释生成、代码解释、Commit Message 生成",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": [],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "ai-comment.generateComment",
        "title": "AI: 生成代码注释"
      },
      {
        "command": "ai-comment.explainCode",
        "title": "AI: 解释选中代码"
      },
      {
        "command": "ai-comment.commitMessage",
        "title": "AI: 生成 Commit Message"
      }
    ],
    "menus": {
      "editor/context": [
        {
          "command": "ai-comment.generateComment",
          "when": "editorHasSelection",
          "group": "ai-tools@1"
        },
        {
          "command": "ai-comment.explainCode",
          "when": "editorHasSelection",
          "group": "ai-tools@2"
        }
      ]
    },
    "keybindings": [
      {
        "command": "ai-comment.generateComment",
        "key": "ctrl+shift+/",
        "mac": "cmd+shift+/",
        "when": "editorHasSelection"
      }
    ],
    "configuration": {
      "title": "AI Comment Generator",
      "properties": {
        "ai-comment.apiKey": {
          "type": "string",
          "default": "",
          "description": "DeepSeek API Key"
        },
        "ai-comment.model": {
          "type": "string",
          "default": "deepseek-chat",
          "description": "AI 模型名称"
        },
        "ai-comment.language": {
          "type": "string",
          "default": "zh-CN",
          "enum": ["zh-CN", "en"],
          "description": "注释语言"
        }
      }
    }
  }
}
```

---

## AI 调用层

```typescript
// src/ai.ts
import * as vscode from "vscode";

interface AIResponse {
  content: string;
  error?: string;
}

export async function callAI(
  systemPrompt: string,
  userContent: string
): Promise<AIResponse> {
  const config = vscode.workspace.getConfiguration("ai-comment");
  const apiKey = config.get<string>("apiKey");
  const model = config.get<string>("model") || "deepseek-chat";

  if (!apiKey) {
    vscode.window.showWarningMessage(
      "请先配置 API Key：设置 → AI Comment Generator → API Key"
    );
    return { content: "", error: "未配置 API Key" };
  }

  try {
    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    const data = (await resp.json()) as any;

    if (data.error) {
      return { content: "", error: data.error.message };
    }

    return { content: data.choices[0].message.content };
  } catch (err: any) {
    return { content: "", error: err.message };
  }
}
```

---

## 功能一：AI 生成代码注释

选中一段代码，右键 → "AI: 生成代码注释"，自动在代码上方插入注释。

```typescript
// src/commands/generateComment.ts
import * as vscode from "vscode";
import { callAI } from "../ai";

export async function generateComment() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const selection = editor.selection;
  const selectedCode = editor.document.getText(selection);

  if (!selectedCode.trim()) {
    vscode.window.showWarningMessage("请先选中代码");
    return;
  }

  const lang = editor.document.languageId;
  const config = vscode.workspace.getConfiguration("ai-comment");
  const commentLang = config.get<string>("language") === "en" ? "English" : "中文";

  const systemPrompt = `你是一个代码注释生成专家。
为给定的代码生成简洁的注释。

## 规则
- 使用 ${commentLang} 写注释
- 注释风格匹配 ${lang} 语言惯例
- 函数/方法：生成 JSDoc/docstring 格式
- 代码块：生成行内注释
- 只输出注释，不要输出代码本身
- 不要用 \`\`\` 包裹`;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "AI 正在生成注释...",
      cancellable: false,
    },
    async () => {
      const result = await callAI(systemPrompt, selectedCode);

      if (result.error) {
        vscode.window.showErrorMessage(`AI 错误：${result.error}`);
        return;
      }

      // 在选中代码的上方插入注释
      const insertPosition = new vscode.Position(selection.start.line, 0);
      const indent = editor.document.lineAt(selection.start.line).text.match(/^\s*/)?.[0] || "";
      const commentText = result.content
        .split("\n")
        .map((line) => indent + line)
        .join("\n") + "\n";

      await editor.edit((editBuilder) => {
        editBuilder.insert(insertPosition, commentText);
      });
    }
  );
}
```

### 效果

选中这段代码：

```typescript
async function fetchUserData(userId: string, options?: { cache?: boolean }) {
  const cacheKey = `user_${userId}`;
  if (options?.cache) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  }
  const resp = await fetch(`/api/users/${userId}`);
  const data = await resp.json();
  if (options?.cache) localStorage.setItem(cacheKey, JSON.stringify(data));
  return data;
}
```

AI 生成的注释：

```typescript
/**
 * 获取用户数据，支持本地缓存
 * @param userId - 用户 ID
 * @param options - 可选配置
 * @param options.cache - 是否启用 localStorage 缓存
 * @returns 用户数据对象
 */
```

---

## 功能二：AI 解释代码

选中代码 → 在 Output Panel 里显示 AI 的解释。

```typescript
// src/commands/explainCode.ts
import * as vscode from "vscode";
import { callAI } from "../ai";

const outputChannel = vscode.window.createOutputChannel("AI Code Explain");

export async function explainCode() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const selectedCode = editor.document.getText(editor.selection);
  if (!selectedCode.trim()) {
    vscode.window.showWarningMessage("请先选中代码");
    return;
  }

  const lang = editor.document.languageId;

  const systemPrompt = `你是一个代码讲解专家。用简洁清晰的中文解释给定的代码。

## 格式
1. **概述**：一句话说明代码做了什么
2. **逐段解析**：按逻辑分段，解释每段的作用
3. **关键技术**：用到了什么技术/模式/API
4. **潜在问题**：如果有的话，指出可能的 bug 或优化点`;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "AI 正在分析代码...",
      cancellable: false,
    },
    async () => {
      const result = await callAI(
        systemPrompt,
        `语言：${lang}\n\n代码：\n${selectedCode}`
      );

      if (result.error) {
        vscode.window.showErrorMessage(`AI 错误：${result.error}`);
        return;
      }

      outputChannel.clear();
      outputChannel.appendLine("=== AI 代码解释 ===\n");
      outputChannel.appendLine(result.content);
      outputChannel.show();
    }
  );
}
```

---

## 功能三：AI 生成 Commit Message

基于当前的 Git diff，自动生成 Commit Message。

```typescript
// src/commands/commitMessage.ts
import * as vscode from "vscode";
import { callAI } from "../ai";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function commitMessage() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showWarningMessage("请先打开一个项目");
    return;
  }

  const cwd = workspaceFolder.uri.fsPath;

  try {
    // 获取 staged diff
    let { stdout: diff } = await execAsync("git diff --cached", { cwd });

    if (!diff.trim()) {
      // 没有 staged 的文件，尝试获取所有 diff
      const result = await execAsync("git diff", { cwd });
      diff = result.stdout;
    }

    if (!diff.trim()) {
      vscode.window.showInformationMessage("没有检测到代码变更");
      return;
    }

    // 限制 diff 长度
    if (diff.length > 5000) {
      diff = diff.slice(0, 5000) + "\n... (diff 过长已截断)";
    }

    const systemPrompt = `你是一个 Git Commit Message 专家。根据 Git diff 生成 Commit Message。

## 格式
type(scope): 简短描述

详细说明（可选）

## type 类型
- feat: 新功能
- fix: 修复 bug
- refactor: 重构
- style: 样式/格式调整
- docs: 文档
- chore: 构建/工具/依赖

## 规则
- 标题不超过 50 个字符
- 用中文写描述
- 只输出 commit message，不要解释`;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "AI 正在生成 Commit Message...",
        cancellable: false,
      },
      async () => {
        const result = await callAI(systemPrompt, diff);

        if (result.error) {
          vscode.window.showErrorMessage(`AI 错误：${result.error}`);
          return;
        }

        // 填入 Source Control 输入框
        const gitExtension = vscode.extensions.getExtension("vscode.git");
        if (gitExtension) {
          const git = gitExtension.exports.getAPI(1);
          const repo = git.repositories[0];
          if (repo) {
            repo.inputBox.value = result.content;
            vscode.window.showInformationMessage("Commit Message 已生成，请在 Source Control 查看");
          }
        }
      }
    );
  } catch (err: any) {
    vscode.window.showErrorMessage(`执行失败：${err.message}`);
  }
}
```

---

## 入口文件

```typescript
// src/extension.ts
import * as vscode from "vscode";
import { generateComment } from "./commands/generateComment";
import { explainCode } from "./commands/explainCode";
import { commitMessage } from "./commands/commitMessage";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("ai-comment.generateComment", generateComment),
    vscode.commands.registerCommand("ai-comment.explainCode", explainCode),
    vscode.commands.registerCommand("ai-comment.commitMessage", commitMessage)
  );
}

export function deactivate() {}
```

---

## VS Code 插件 vs MCP Server

| 维度 | VS Code 插件 | MCP Server |
|------|-------------|-----------|
| **运行位置** | VS Code 进程内 | 独立进程 |
| **UI 能力** | 完整（Webview、TreeView、状态栏） | 无 UI |
| **适用场景** | 需要深度集成编辑器 UI 的功能 | 通用工具，不限于某个 AI 客户端 |
| **复用性** | 只在 VS Code 里用 | Cursor / Claude / 自研 Agent 都能用 |
| **开发语言** | TypeScript | TypeScript / Python / 任何语言 |

**简单规则**：
- 需要 UI、需要操作编辑器 → VS Code 插件
- 通用数据/工具能力、想被多个 AI 应用调用 → MCP Server
- 两者可以组合：VS Code 插件内部连接 MCP Server

---

## Webview Panel：嵌入 React/Vue 页面

如果你想在 VS Code 里做一个复杂 UI（比如 AI 聊天面板），可以用 Webview。

```typescript
const panel = vscode.window.createWebviewPanel(
  "aiChat",
  "AI 聊天",
  vscode.ViewColumn.Beside,
  {
    enableScripts: true,
    retainContextWhenHidden: true,
  }
);

panel.webview.html = `
  <!DOCTYPE html>
  <html>
  <body>
    <div id="app"></div>
    <script>
      const vscode = acquireVsCodeApi();

      // 发消息给插件
      vscode.postMessage({ type: "ask", question: "你好" });

      // 接收插件的消息
      window.addEventListener("message", (event) => {
        const { type, content } = event.data;
        if (type === "answer") {
          document.getElementById("app").innerText = content;
        }
      });
    </script>
  </body>
  </html>
`;

// 插件侧接收 Webview 消息
panel.webview.onDidReceiveMessage(async (msg) => {
  if (msg.type === "ask") {
    const result = await callAI("你是一个助手", msg.question);
    panel.webview.postMessage({ type: "answer", content: result.content });
  }
});
```

Webview 就是一个独立的 iframe——你可以在里面跑完整的 React/Vue 应用。

---

## 调试和发布

### 调试

按 `F5` → 打开新 VS Code 窗口（Extension Development Host）→ 测试你的插件。

### 发布到 Marketplace

```bash
# 安装发布工具
npm install -g @vscode/vsce

# 打包
vsce package
# → ai-comment-generator-0.1.0.vsix

# 发布（需要 Azure DevOps PAT）
vsce publish
```

---

## 总结

1. **VS Code 插件 80% 是前端技能**——TypeScript、npm、事件监听，你已经会了。
2. **三个实用 AI 功能**：代码注释生成、代码解释、Commit Message 生成。
3. **API Key 放 settings**——用 `vscode.workspace.getConfiguration` 读取，安全且用户友好。
4. **Webview = iframe**——可以嵌入完整的 React/Vue 应用。
5. **VS Code 插件 vs MCP**——需要 UI 用插件，需要复用用 MCP，可以组合。

**下一篇**，我们探索多模态 AI——不只是文本，图片和语音也能玩。

---

> **下一篇预告**：[22 | 多模态 AI API：不只是文本，图片和语音也能玩](/series/junior/22-multimodal-ai)

---

**讨论话题**：你用过哪些 AI 驱动的 VS Code 插件？自己最想做什么功能？评论区聊聊。
