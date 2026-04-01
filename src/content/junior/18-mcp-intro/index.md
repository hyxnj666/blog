---
title: 'MCP 入门：AI 世界的"USB 接口"，前端写 Server 天然适配'
description: "MCP 协议入门：用 Node.js 写第一个 MCP Server 并在 Cursor 中使用"
order: 18
cover: "./cover.png"
publishDate: "2025-09-26"
tags: ["MCP", "AI", "Node.js", "Cursor", "TypeScript"]
---

# MCP 入门：AI 世界的"USB 接口"，前端写 Server 天然适配

> 本文是【前端转 AI 全栈实战】系列第 18 篇。
> 上一篇：[AI + 低代码：用自然语言生成页面 / 表单 / 图表](/series/junior/17-ai-lowcode) | 下一篇：[MCP 进阶：做一个有实用价值的 MCP Server 并发布](/series/junior/19-mcp-advanced)

---

## 这篇文章你会得到什么

前面做了 Agent——AI 可以调用工具了。但有个问题：**每个 AI 应用都得自己写工具集成**。

你在 Cursor 里想查数据库？写个 Cursor 插件。
你在 Claude 里想搜文档？写个 Claude 插件。
你在自己的 Agent 里想调 API？自己写 Function Calling。

同样的"查数据库"能力，得写三遍。

**MCP 解决了这个问题——写一次 Server，所有支持 MCP 的 AI 应用都能用。**

这就像 USB 接口：以前每个设备都有自己的充电口，现在统一用 Type-C。MCP 就是 AI 世界的 Type-C。

---

## MCP 是什么

**MCP = Model Context Protocol（模型上下文协议）**

由 Anthropic（Claude 的公司）提出的开放协议，定义了 AI 应用和外部工具/数据之间的标准通信方式。

### 一句话理解

```
没有 MCP：
  Cursor ←→ [自定义插件A] ←→ 数据库
  Claude ←→ [自定义插件B] ←→ 同一个数据库
  你的Agent ←→ [自定义代码C] ←→ 还是这个数据库

有了 MCP：
  Cursor    ←→ MCP Client ←→
  Claude    ←→ MCP Client ←→ [MCP Server] ←→ 数据库
  你的Agent ←→ MCP Client ←→
```

一个 MCP Server，所有 AI 应用都能连。

### 架构

```
┌─────────────────────────────────────────────────┐
│  Host（AI 应用：Cursor / Claude / 自研 Agent）      │
│  ┌─────────────┐                                 │
│  │  MCP Client  │ ← JSON-RPC 2.0 →              │
│  └──────┬───────┘                                │
└─────────┼────────────────────────────────────────┘
          │ stdio / SSE / Streamable HTTP
          ▼
┌─────────────────────┐
│     MCP Server       │
│  ┌───────────────┐   │
│  │ Tools          │   │  → 可调用的函数（查天气、搜文档）
│  │ Resources      │   │  → 可读取的数据（文件、数据库记录）
│  │ Prompts        │   │  → 预定义的提示模板
│  └───────────────┘   │
└─────────┬────────────┘
          │
          ▼
   外部服务 / 数据库 / API
```

### 三大核心能力

| 能力 | 类比 | 说明 |
|------|------|------|
| **Tools** | REST API 的 POST | AI 可以调用的函数，有副作用（写数据、发请求） |
| **Resources** | REST API 的 GET | AI 可以读取的数据，只读（文件内容、数据库记录） |
| **Prompts** | 模板引擎 | 预定义的 Prompt 模板，带参数 |

---

## 为什么前端写 MCP Server 是天然适配

MCP Server 的本质是什么？

1. **接收 JSON 请求** → 前端天天处理 JSON
2. **调用外部 API** → 前端天天 fetch 各种 API
3. **返回 JSON 响应** → 前端天天构造 JSON 数据
4. **用 TypeScript 写** → MCP 官方 SDK 就是 TypeScript
5. **Node.js 运行** → 前端的主场

MCP Server 本质就是一个 **JSON-RPC Server**。对前端来说，这和写一个 Express/Koa 中间件没区别。

---

## 实战：用 Node.js 写第一个 MCP Server

### 初始化项目

```bash
mkdir my-first-mcp && cd my-first-mcp
npm init -y
npm install @modelcontextprotocol/sdk zod
```

`@modelcontextprotocol/sdk` 是官方 TypeScript SDK，`zod` 用于参数校验。

### 最简 MCP Server

```javascript
// index.mjs
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "my-first-mcp",
  version: "1.0.0",
});

// 注册一个 Tool：获取当前时间
server.tool(
  "get_current_time",
  "获取当前时间，可指定时区",
  {
    timezone: z.string().optional().describe("时区，如 Asia/Shanghai"),
  },
  async ({ timezone }) => {
    const tz = timezone || "Asia/Shanghai";
    const now = new Date().toLocaleString("zh-CN", { timeZone: tz });
    return {
      content: [{ type: "text", text: `当前时间（${tz}）：${now}` }],
    };
  }
);

// 注册一个 Resource：读取项目信息
server.resource(
  "project-info",
  "project://info",
  async (uri) => ({
    contents: [{
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify({
        name: "my-first-mcp",
        version: "1.0.0",
        description: "我的第一个 MCP Server",
      }),
    }],
  })
);

// 注册一个 Prompt：代码审查模板
server.prompt(
  "code-review",
  "代码审查 Prompt 模板",
  {
    code: z.string().describe("要审查的代码"),
    language: z.string().optional().describe("编程语言"),
  },
  ({ code, language }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `请审查以下${language || ""}代码，指出问题并给出改进建议：\n\n\`\`\`${language || ""}\n${code}\n\`\`\``,
      },
    }],
  })
);

// 启动 Server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("MCP Server started");
```

就这么简单——定义 Tool/Resource/Prompt，启动 Server。

### package.json 配置

```json
{
  "name": "my-first-mcp",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "my-first-mcp": "index.mjs"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  }
}
```

---

## 在 Cursor / Claude 中使用

### Cursor 配置

在项目根目录创建 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "my-first-mcp": {
      "command": "node",
      "args": ["D:/work/my-first-mcp/index.mjs"]
    }
  }
}
```

重启 Cursor 后，在 Agent 模式下 AI 就能自动调用你的 Tool。

### Claude Desktop 配置

编辑 `claude_desktop_config.json`（Windows 路径：`%APPDATA%\Claude\claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "my-first-mcp": {
      "command": "node",
      "args": ["D:/work/my-first-mcp/index.mjs"]
    }
  }
}
```

重启 Claude Desktop，对话中就能使用你的工具了。

---

## 进阶：对接公司内部 API

实际场景——写一个 MCP Server 对接公司内部的项目管理 API。

```javascript
// project-api-mcp/index.mjs
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.PROJECT_API_BASE || "http://localhost:8000/api";
const API_TOKEN = process.env.PROJECT_API_TOKEN;

const server = new McpServer({
  name: "project-api",
  version: "1.0.0",
});

async function apiFetch(path, options = {}) {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
      ...options.headers,
    },
  });
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  return resp.json();
}

// Tool: 搜索项目
server.tool(
  "search_projects",
  "搜索项目列表，支持关键词过滤",
  {
    keyword: z.string().optional().describe("搜索关键词"),
    status: z.enum(["active", "archived", "all"]).optional().describe("项目状态"),
  },
  async ({ keyword, status }) => {
    const params = new URLSearchParams();
    if (keyword) params.set("q", keyword);
    if (status && status !== "all") params.set("status", status);

    const data = await apiFetch(`/projects?${params}`);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(data, null, 2),
      }],
    };
  }
);

// Tool: 获取项目详情
server.tool(
  "get_project_detail",
  "获取项目详细信息，包括成员和最近活动",
  {
    project_id: z.string().describe("项目 ID"),
  },
  async ({ project_id }) => {
    const data = await apiFetch(`/projects/${project_id}`);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(data, null, 2),
      }],
    };
  }
);

// Tool: 创建任务（危险操作，有副作用）
server.tool(
  "create_task",
  "在指定项目中创建一个新任务。注意：这会实际创建任务",
  {
    project_id: z.string().describe("项目 ID"),
    title: z.string().describe("任务标题"),
    description: z.string().optional().describe("任务描述"),
    assignee: z.string().optional().describe("负责人"),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  },
  async ({ project_id, title, description, assignee, priority }) => {
    const data = await apiFetch(`/projects/${project_id}/tasks`, {
      method: "POST",
      body: JSON.stringify({ title, description, assignee, priority }),
    });
    return {
      content: [{
        type: "text",
        text: `任务创建成功！ID: ${data.id}\n标题: ${title}`,
      }],
    };
  }
);

// Resource: 项目统计数据
server.resource(
  "project-stats",
  "project://stats",
  async (uri) => {
    const data = await apiFetch("/stats/overview");
    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(data),
      }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

配好后在 Cursor 里就能这样用：

```
你: "帮我看一下当前有哪些进行中的项目"
AI: [调用 search_projects(status="active")]
→ 列出所有活跃项目

你: "在 xxx 项目里创建一个任务：修复登录页面样式问题，优先级高"
AI: [调用 create_task(project_id="xxx", title="修复登录页面样式问题", priority="high")]
→ 任务创建成功
```

---

## 传输方式选择

MCP 支持三种传输方式：

| 传输方式 | 原理 | 适合场景 |
|---------|------|---------|
| **stdio** | 标准输入/输出 | 本地工具，Cursor/Claude Desktop |
| **SSE** | Server-Sent Events | 远程服务，Web 集成 |
| **Streamable HTTP** | HTTP POST + 可选流式 | 新标准，兼容无状态部署 |

### stdio（最常用）

```javascript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const transport = new StdioServerTransport();
await server.connect(transport);
```

AI 应用通过启动子进程，用 stdin/stdout 通信。简单直接，本地开发首选。

### SSE（远程服务）

```javascript
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";

const app = express();
let transport;

app.get("/sse", (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  server.connect(transport);
});

app.post("/messages", (req, res) => {
  transport.handlePostMessage(req, res);
});

app.listen(3001);
```

适合把 MCP Server 部署成远程服务，多人共用。

---

## 调试技巧

### MCP Inspector

官方提供的调试工具，可以直接在浏览器里测试 MCP Server。

```bash
npx @modelcontextprotocol/inspector node index.mjs
```

打开浏览器，可以：
- 查看 Server 暴露了哪些 Tools/Resources/Prompts
- 手动调用 Tool，查看输入输出
- 检查参数校验是否正确

### console.error 调试

因为 stdio 模式下 stdout 被 MCP 协议占用，调试信息要用 `console.error`：

```javascript
server.tool("my_tool", "描述", {}, async () => {
  console.error("Tool 被调用了！"); // 这会输出到终端
  // console.log 不行！会污染 MCP 通信
  return { content: [{ type: "text", text: "ok" }] };
});
```

### 常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| Cursor 不识别 Server | 配置路径错误 | 检查 `.cursor/mcp.json` 里的路径 |
| Tool 不出现 | Server 启动失败 | 先手动 `node index.mjs` 看报错 |
| 参数传递为空 | Zod Schema 不匹配 | 用 Inspector 测试 |
| "spawn ENOENT" | Node.js 路径问题 | 用绝对路径 `command: "C:/...node.exe"` |

---

## Tool 设计最佳实践

### 1. 命名清晰

```javascript
// ❌ 模糊命名
server.tool("do_stuff", ...)

// ✅ 动词_名词 格式
server.tool("search_projects", ...)
server.tool("create_task", ...)
server.tool("get_user_info", ...)
```

### 2. 描述详细

AI 根据描述决定什么时候调用你的工具——描述越清楚，AI 的判断越准确。

```javascript
// ❌ 描述模糊
server.tool("search", "搜索", ...)

// ✅ 描述详细
server.tool(
  "search_projects",
  "搜索公司内部项目列表。可以按关键词过滤项目名称和描述，也可以按状态（active/archived）筛选。返回项目 ID、名称、状态和最后更新时间。",
  ...
)
```

### 3. 参数用 Zod 严格校验

```javascript
server.tool(
  "create_task",
  "创建任务",
  {
    title: z.string().min(1).max(200).describe("任务标题，不超过200字"),
    priority: z.enum(["low", "medium", "high", "urgent"]).describe("优先级"),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("截止日期，格式 YYYY-MM-DD"),
  },
  async (args) => { /* ... */ }
);
```

### 4. 错误处理友好

```javascript
server.tool("get_project", "获取项目", { id: z.string() }, async ({ id }) => {
  try {
    const data = await apiFetch(`/projects/${id}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    return {
      content: [{ type: "text", text: `获取项目失败：${err.message}` }],
      isError: true,
    };
  }
});
```

---

## 总结

1. **MCP = AI 世界的 USB 接口**——写一次 Server，所有 AI 应用都能用。
2. **三大能力**：Tools（函数调用）、Resources（数据读取）、Prompts（提示模板）。
3. **前端写 MCP Server 天然适配**——JSON-RPC + Node.js + TypeScript，全是前端技能栈。
4. **官方 SDK 简单易用**——`McpServer` + `server.tool()` + `StdioServerTransport`，几十行代码搞定。
5. **调试用 Inspector**——`npx @modelcontextprotocol/inspector` 浏览器可视化调试。
6. **Tool 设计关键**——命名清晰、描述详细、参数严格、错误友好。

**下一篇**，我们做一个有实用价值的 MCP Server——对接真实场景，发布到 npm。

---

> **下一篇预告**：[19 | MCP 进阶：做一个有实用价值的 MCP Server 并发布](/series/junior/19-mcp-advanced)

---

**讨论话题**：你用 Cursor 或 Claude Desktop 配过 MCP 吗？觉得什么场景最适合做成 MCP Server？评论区聊聊。
