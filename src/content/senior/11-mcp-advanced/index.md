---
title: "MCP Server 进阶：为团队构建标准化的 AI 工具生态"
description: "从个人 MCP Server 到团队级工具生态的架构升级与最佳实践"
order: 11
cover: "./cover.png"
publishDate: "2025-10-05"
tags: ["MCP", "架构", "工具生态", "团队协作"]
---

# MCP Server 进阶：为团队构建标准化的 AI 工具生态

> 本文是【高级前端的 AI 架构升级之路】系列第 11 篇。
> 上一篇：[Prompt 工程化管理：从散落在代码里到版本化、可测试、可回滚](/series/senior/10-prompt-management) | 下一篇：[AI 应用的可观测性：你的 AI 系统在生产上到底表现怎么样](/series/senior/12-observability)

---

## 引言

初级篇教了怎么写一个 MCP Server。但在团队环境下，问题不是"能不能写"，而是"怎么管"：

- 10 个人写了 30 个 MCP Server，质量参差不齐
- 没有统一的错误处理、日志、测试
- 权限控制靠自觉，有人的 Server 能删数据库
- 更新了 Server 不知道通知谁

这一篇讲的是**从个人 MCP Server 到团队级 MCP 工具生态**的架构升级。

---

## MCP Server 设计模式

### 模式一：单一职责

```
❌ all-in-one-server
   ├── 查 GitLab
   ├── 查 Jenkins
   ├── 查数据库
   ├── 发邮件
   └── 操作 K8s

✅ 按领域拆分
   ├── gitlab-mcp-server      → Git 相关
   ├── ci-mcp-server           → CI/CD 相关
   ├── database-mcp-server     → 数据库查询
   ├── notification-mcp-server → 通知相关
   └── infra-mcp-server        → 基础设施
```

**拆分原则**：一个 Server 对应一个**领域**，而不是一个系统。

### 模式二：组合使用

多个 MCP Server 同时加载到 Cursor/Claude，AI 自动选择合适的工具：

```json
{
  "mcpServers": {
    "gitlab": { "command": "npx", "args": ["@company/gitlab-mcp"] },
    "ci": { "command": "npx", "args": ["@company/ci-mcp"] },
    "db": { "command": "npx", "args": ["@company/db-mcp"] }
  }
}
```

AI 收到"查一下 user 表最近的数据变更，然后看看是哪个 MR 引入的"——会自动先调 `db-mcp` 查数据，再调 `gitlab-mcp` 查 MR。

### 模式三：分层架构

```
┌─────────────────────────────┐
│  业务层 MCP Server            │  → 对接业务系统的具体 Tool
│  (gitlab / jenkins / ...)     │
└──────────────┬──────────────┘
               │ 继承 / 依赖
┌──────────────┴──────────────┐
│  基础层 (mcp-server-base)    │  → 统一的错误处理、日志、鉴权
└─────────────────────────────┘
```

---

## 开发脚手架

### 项目模板

```
company-mcp-template/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # 入口
│   ├── tools/             # Tool 定义
│   │   └── example.ts
│   ├── resources/         # Resource 定义
│   ├── middleware/         # 中间件（鉴权、日志、限流）
│   │   ├── auth.ts
│   │   ├── logger.ts
│   │   └── rateLimiter.ts
│   └── utils/
│       ├── config.ts      # 环境变量管理
│       └── errors.ts      # 统一错误类型
├── tests/
│   ├── tools/
│   │   └── example.test.ts
│   └── integration/
│       └── server.test.ts
├── .env.example
└── README.md
```

### 基础类

```typescript
// src/base/McpServerBase.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

interface ServerConfig {
  name: string
  version: string
  requiredEnv?: string[]
}

export class McpServerBase {
  protected server: McpServer
  private config: ServerConfig

  constructor(config: ServerConfig) {
    this.config = config
    this.server = new McpServer({
      name: config.name,
      version: config.version,
    })

    this.validateEnv()
  }

  private validateEnv() {
    const missing = (this.config.requiredEnv || [])
      .filter(key => !process.env[key])

    if (missing.length > 0) {
      console.error(`❌ 缺少环境变量: ${missing.join(', ')}`)
      console.error(`请在 .env 或 MCP 配置的 env 中设置`)
      process.exit(1)
    }
  }

  // 统一的 Tool 注册，自动加错误处理和日志
  protected registerTool(
    name: string,
    description: string,
    schema: any,
    handler: (args: any) => Promise<any>,
    options?: { dangerous?: boolean; rateLimit?: number }
  ) {
    this.server.tool(name, description, schema, async (args) => {
      const startTime = Date.now()

      try {
        console.error(`[${this.config.name}] Tool called: ${name}`, JSON.stringify(args))

        const result = await handler(args)
        const duration = Date.now() - startTime

        console.error(`[${this.config.name}] Tool done: ${name} (${duration}ms)`)

        return {
          content: [{
            type: "text" as const,
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          }],
        }
      } catch (error: any) {
        const duration = Date.now() - startTime
        console.error(`[${this.config.name}] Tool error: ${name} (${duration}ms)`, error.message)

        return {
          content: [{
            type: "text" as const,
            text: `错误: ${error.message}\n\n请检查参数是否正确，或联系管理员。`,
          }],
          isError: true,
        }
      }
    })
  }

  async start() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error(`✅ ${this.config.name} v${this.config.version} started`)
  }
}
```

### 使用示例

```typescript
// src/index.ts - GitLab MCP Server
import { McpServerBase } from "./base/McpServerBase"
import { z } from "zod"

class GitLabMcpServer extends McpServerBase {
  private gitlabUrl: string
  private gitlabToken: string

  constructor() {
    super({
      name: "gitlab-mcp",
      version: "1.0.0",
      requiredEnv: ["GITLAB_URL", "GITLAB_TOKEN"],
    })

    this.gitlabUrl = process.env.GITLAB_URL!
    this.gitlabToken = process.env.GITLAB_TOKEN!

    this.registerTools()
  }

  private registerTools() {
    this.registerTool(
      "search_merge_requests",
      "搜索 GitLab Merge Requests。可以按状态、作者、标签过滤。",
      {
        query: z.string().optional().describe("搜索关键词"),
        state: z.enum(["opened", "merged", "closed", "all"]).optional(),
        author: z.string().optional().describe("作者用户名"),
      },
      async ({ query, state, author }) => {
        const params = new URLSearchParams()
        if (query) params.set("search", query)
        if (state) params.set("state", state)
        if (author) params.set("author_username", author)

        const resp = await fetch(
          `${this.gitlabUrl}/api/v4/merge_requests?${params}`,
          { headers: { "PRIVATE-TOKEN": this.gitlabToken } }
        )
        const mrs = await resp.json()

        return mrs.map((mr: any) => ({
          id: mr.iid,
          title: mr.title,
          author: mr.author.username,
          state: mr.state,
          url: mr.web_url,
          created: mr.created_at,
        }))
      }
    )

    this.registerTool(
      "get_pipeline_status",
      "获取项目最新 CI/CD Pipeline 状态",
      {
        project_id: z.string().describe("GitLab 项目 ID 或路径"),
      },
      async ({ project_id }) => {
        const encoded = encodeURIComponent(project_id)
        const resp = await fetch(
          `${this.gitlabUrl}/api/v4/projects/${encoded}/pipelines?per_page=5`,
          { headers: { "PRIVATE-TOKEN": this.gitlabToken } }
        )
        return resp.json()
      }
    )
  }
}

const server = new GitLabMcpServer()
server.start()
```

---

## 测试策略

### 单元测试

```typescript
// tests/tools/search_merge_requests.test.ts
import { describe, it, expect, vi } from 'vitest'

// Mock fetch
vi.stubGlobal('fetch', vi.fn())

describe('search_merge_requests', () => {
  it('应该正确拼接 GitLab API 请求', async () => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue(new Response(JSON.stringify([
      { iid: 1, title: 'feat: add login', author: { username: 'dev1' }, state: 'opened', web_url: '...', created_at: '...' },
    ])))

    // 调用 tool handler
    const result = await searchMergeRequests({ query: 'login', state: 'opened' })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('search=login'),
      expect.any(Object)
    )
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('feat: add login')
  })
})
```

### 集成测试

```typescript
// tests/integration/server.test.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

describe('GitLab MCP Server Integration', () => {
  let client: Client

  beforeAll(async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: ["dist/index.js"],
      env: { GITLAB_URL: "https://gitlab.test.com", GITLAB_TOKEN: "test-token" },
    })
    client = new Client({ name: "test-client", version: "1.0.0" })
    await client.connect(transport)
  })

  it('应该列出所有可用的 tools', async () => {
    const tools = await client.listTools()
    expect(tools.tools.map(t => t.name)).toContain('search_merge_requests')
    expect(tools.tools.map(t => t.name)).toContain('get_pipeline_status')
  })

  afterAll(async () => {
    await client.close()
  })
})
```

### AI 端到端测试

用真实 AI 测试 Tool 描述是否够清晰：

```typescript
it('AI 应该能正确理解何时调用 search_merge_requests', async () => {
  const tools = await client.listTools()

  // 把 tools schema 发给 AI，看它会不会在正确的问题上选择正确的工具
  const response = await callAI({
    messages: [{ role: 'user', content: '帮我看看最近有什么新的 MR' }],
    tools: tools.tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    })),
  })

  expect(response.choices[0].finish_reason).toBe('tool_calls')
  expect(response.choices[0].message.tool_calls[0].function.name).toBe('search_merge_requests')
})
```

---

## 权限和审计

### 权限分级

```typescript
interface McpServerManifest {
  name: string
  version: string
  tools: {
    name: string
    riskLevel: 'read' | 'write' | 'admin'
    description: string
    requiresApproval?: boolean
  }[]
  requiredPermissions: string[]
}

// gitlab-mcp manifest
const manifest: McpServerManifest = {
  name: "gitlab-mcp",
  version: "1.0.0",
  tools: [
    { name: "search_merge_requests", riskLevel: "read", description: "搜索 MR" },
    { name: "get_pipeline_status", riskLevel: "read", description: "查看 Pipeline" },
    { name: "create_merge_request", riskLevel: "write", description: "创建 MR", requiresApproval: true },
    { name: "merge_merge_request", riskLevel: "admin", description: "合并 MR", requiresApproval: true },
  ],
  requiredPermissions: ["gitlab:read", "gitlab:write"],
}
```

### 审计日志

```typescript
// 基础类自动记录
console.error(JSON.stringify({
  event: "mcp_tool_call",
  server: "gitlab-mcp",
  tool: "search_merge_requests",
  args: { query: "login", state: "opened" },
  user: process.env.MCP_USER || "unknown",
  timestamp: new Date().toISOString(),
  duration_ms: 234,
  status: "success",
}))
```

---

## 发布流程

### npm scope 组织

```
@company/gitlab-mcp-server
@company/ci-mcp-server
@company/db-mcp-server
@company/mcp-server-base      ← 基础类
@company/mcp-server-template   ← 脚手架
```

### CI/CD

```yaml
# .github/workflows/publish.yml
name: Publish MCP Server
on:
  push:
    tags: ['v*']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test

  publish:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: 'https://npm.pkg.github.com'
      - run: npm ci && npm run build && npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 团队 MCP 注册表

```json
{
  "registry": {
    "gitlab-mcp": {
      "package": "@company/gitlab-mcp-server",
      "version": "1.2.0",
      "owner": "platform-team",
      "riskLevel": "read+write",
      "docs": "https://wiki.internal.com/mcp/gitlab"
    },
    "db-mcp": {
      "package": "@company/db-mcp-server",
      "version": "2.0.1",
      "owner": "data-team",
      "riskLevel": "read-only",
      "docs": "https://wiki.internal.com/mcp/db"
    }
  }
}
```

---

## 总结

1. **单一职责**——一个 MCP Server 对应一个领域，而不是把所有功能塞到一个 Server。
2. **基础类统一**——`McpServerBase` 封装错误处理、日志、环境变量校验，团队统一继承。
3. **三层测试**——单元测试（mock API）、集成测试（MCP Client 连接）、AI 端到端测试（验证 Tool 描述质量）。
4. **权限和审计**——Tool 分级（read/write/admin），危险操作需审批，所有调用记录日志。
5. **npm scope 发布**——`@company/` 统一命名，CI/CD 自动化，团队注册表管理。

第三阶段"AI 平台与基础设施"到这里结束。下一篇进入 AI 可观测性。

---

> **下一篇预告**：[12 | AI 应用的可观测性：你的 AI 系统在生产上到底表现怎么样](/series/senior/12-observability)

---

**架构讨论**：你们团队有几个 MCP Server？怎么管理和发布的？评论区聊聊。
