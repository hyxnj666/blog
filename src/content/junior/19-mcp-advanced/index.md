---
title: "MCP 进阶：做一个有实用价值的 MCP Server 并发布"
description: "实战开发掘金文章管理 MCP Server，掌握多 Tool 设计原则与 npm 发布流程"
order: 19
cover: "./cover.png"
publishDate: "2025-10-03"
tags: ["MCP", "Node.js", "npm", "AI工具", "实战项目"]
---

# MCP 进阶：做一个有实用价值的 MCP Server 并发布

> 本文是【前端转 AI 全栈实战】系列第 19 篇。
> 上一篇：[MCP 入门：AI 世界的"USB 接口"，前端写 Server 天然适配](/series/junior/18-mcp-intro) | 下一篇：[AI + Chrome 扩展：做一个 AI 驱动的浏览器插件](/series/junior/20-ai-chrome-extension)

---

## 这篇文章你会得到什么

上一篇你写了第一个 MCP Server。但说实话，"获取当前时间"这种 Tool 没什么实际价值。

这一篇我们做一个**真正有用的 MCP Server**——"掘金文章管理"，让 AI 能帮你搜文章、看数据、生成摘要。然后把它发布到 npm，让别人也能用。

---

## 实战：掘金文章管理 MCP Server

### 功能规划

| Tool | 功能 | 类型 |
|------|------|------|
| `search_articles` | 搜索掘金文章 | 只读 |
| `get_article_detail` | 获取文章详情 | 只读 |
| `get_user_stats` | 获取作者数据统计 | 只读 |
| `generate_summary` | 给文章生成摘要 | 只读 |
| `suggest_tags` | 给文章推荐标签 | 只读 |

### 项目结构

```
juejin-mcp-server/
├── package.json
├── README.md
├── src/
│   ├── index.mjs          # 入口
│   ├── tools/
│   │   ├── articles.mjs   # 文章相关 Tool
│   │   └── stats.mjs      # 统计相关 Tool
│   ├── resources/
│   │   └── templates.mjs  # Prompt 模板
│   └── utils/
│       └── api.mjs        # API 封装
```

### API 封装

```javascript
// src/utils/api.mjs
const BASE_URL = "https://api.juejin.cn";

export async function juejinFetch(path, options = {}) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "POST",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!resp.ok) {
    throw new Error(`掘金 API 错误: ${resp.status}`);
  }

  const data = await resp.json();
  if (data.err_no !== 0) {
    throw new Error(`掘金业务错误: ${data.err_msg}`);
  }

  return data.data;
}

export async function searchArticles(keyword, limit = 10) {
  return juejinFetch("/search_api/v1/search", {
    body: {
      search_type: 2,
      key_word: keyword,
      limit,
      search_id: "",
    },
  });
}

export async function getArticleDetail(articleId) {
  return juejinFetch("/content_api/v1/article/detail", {
    body: { article_id: articleId },
  });
}

export async function getUserStats(userId) {
  return juejinFetch("/user_api/v1/user/get", {
    body: { user_id: userId },
  });
}
```

### 文章 Tools

```javascript
// src/tools/articles.mjs
import { z } from "zod";
import { searchArticles, getArticleDetail } from "../utils/api.mjs";

export function registerArticleTools(server) {
  server.tool(
    "search_articles",
    "在掘金上搜索技术文章。返回文章标题、作者、点赞数等信息。适合查找特定技术话题的文章。",
    {
      keyword: z.string().describe("搜索关键词，如 'Vue3 性能优化'"),
      limit: z.number().min(1).max(20).optional().describe("返回数量，默认 10"),
    },
    async ({ keyword, limit }) => {
      try {
        const results = await searchArticles(keyword, limit || 10);

        const articles = results.map((item, i) => {
          const info = item.result_model;
          return `${i + 1}. 【${info.article_info.title}】
   作者: ${info.author_info?.user_name || "未知"}
   点赞: ${info.article_info.digg_count} | 阅读: ${info.article_info.view_count}
   链接: https://juejin.cn/post/${info.article_info.article_id}`;
        });

        return {
          content: [{
            type: "text",
            text: `搜索 "${keyword}" 找到以下文章：\n\n${articles.join("\n\n")}`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `搜索失败：${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_article_detail",
    "获取掘金文章的详细信息，包括完整内容、标签、评论数等。可用于分析文章结构或生成摘要。",
    {
      article_id: z.string().describe("文章 ID，从文章 URL 中获取"),
    },
    async ({ article_id }) => {
      try {
        const detail = await getArticleDetail(article_id);
        const info = detail.article_info;
        const author = detail.author_user_info;

        const text = `# ${info.title}

作者: ${author.user_name}
发布时间: ${new Date(Number(info.ctime) * 1000).toLocaleDateString("zh-CN")}
点赞: ${info.digg_count} | 阅读: ${info.view_count} | 评论: ${info.comment_count} | 收藏: ${info.collect_count}
标签: ${(detail.tags || []).map(t => t.tag_name).join(", ")}

---

${info.mark_content || "（无 Markdown 内容）"}`;

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `获取文章详情失败：${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
```

### 统计 Tools

```javascript
// src/tools/stats.mjs
import { z } from "zod";
import { getUserStats } from "../utils/api.mjs";

export function registerStatsTools(server) {
  server.tool(
    "get_user_stats",
    "获取掘金作者的统计数据，包括文章数、总阅读量、关注者数等。",
    {
      user_id: z.string().describe("掘金用户 ID"),
    },
    async ({ user_id }) => {
      try {
        const data = await getUserStats(user_id);

        const text = `## ${data.user_name} 的掘金数据

- 文章数: ${data.post_article_count}
- 关注者: ${data.follower_count}
- 获赞数: ${data.got_digg_count}
- 总阅读: ${data.got_view_count}
- 等级: Lv${data.level}
- 简介: ${data.description || "暂无"}`;

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `获取用户数据失败：${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
```

### Prompt 模板

```javascript
// src/resources/templates.mjs
import { z } from "zod";

export function registerPrompts(server) {
  server.prompt(
    "article-summary",
    "生成技术文章摘要的 Prompt 模板",
    {
      content: z.string().describe("文章内容"),
      max_length: z.string().optional().describe("摘要最大字数，默认 100"),
    },
    ({ content, max_length }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `请为以下技术文章生成中文摘要，要求：
1. 字数不超过 ${max_length || "100"} 字
2. 包含核心技术点
3. 吸引读者点击
4. 不要用"本文介绍了"开头

文章内容：
${content}`,
        },
      }],
    })
  );

  server.prompt(
    "tag-suggestion",
    "为技术文章推荐标签",
    {
      title: z.string().describe("文章标题"),
      content: z.string().describe("文章内容（可以只传前 500 字）"),
    },
    ({ title, content }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `根据以下文章的标题和内容，推荐 3-5 个掘金平台的技术标签。
          
要求：
- 标签要精准，避免过于宽泛
- 优先使用掘金已有的热门标签（如 Vue.js、React、TypeScript、Node.js、AI、Python）
- 输出格式：标签1, 标签2, 标签3

标题：${title}
内容：${content.slice(0, 500)}`,
        },
      }],
    })
  );
}
```

### 入口整合

```javascript
// src/index.mjs
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerArticleTools } from "./tools/articles.mjs";
import { registerStatsTools } from "./tools/stats.mjs";
import { registerPrompts } from "./resources/templates.mjs";

const server = new McpServer({
  name: "juejin-mcp-server",
  version: "1.0.0",
});

registerArticleTools(server);
registerStatsTools(server);
registerPrompts(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("掘金 MCP Server 已启动");
```

---

## 多 Tool 设计原则

当你的 MCP Server 有多个 Tool 时，遵循这些原则：

### 1. 单一职责

```javascript
// ❌ 一个 Tool 做太多事
server.tool("manage_articles", "管理文章", ...)
// 搜索？查看？删除？AI 不知道什么时候该调

// ✅ 拆分成独立的 Tool
server.tool("search_articles", ...)
server.tool("get_article_detail", ...)
server.tool("delete_article", ...)
```

### 2. 渐进式信息获取

先概览，再详情——和前端的列表→详情页逻辑一样。

```javascript
// Step 1: 搜索，返回简要列表
server.tool("search_articles", ...) // → ID + 标题 + 简介

// Step 2: 查看详情
server.tool("get_article_detail", ...) // → 完整内容
```

AI 会自动先搜索，再根据需要查看具体文章的详情。

### 3. 返回结构化数据

```javascript
// ❌ 返回纯文本，AI 难以进一步处理
return { content: [{ type: "text", text: "文章很多" }] };

// ✅ 返回结构化文本，AI 可以提取信息
return {
  content: [{
    type: "text",
    text: `文章数: 42\n总阅读: 128000\n平均点赞: 35`,
  }],
};
```

---

## 权限和安全

### 区分读写操作

```javascript
// 只读工具——安全，随意调用
server.tool("search_articles", ...);
server.tool("get_article_detail", ...);

// 写操作——需要额外保护
server.tool(
  "delete_article",
  "删除指定文章。⚠️ 此操作不可逆，请确认后再执行。",
  { article_id: z.string() },
  async ({ article_id }) => {
    // 可以加一层确认逻辑
    return {
      content: [{
        type: "text",
        text: `确认要删除文章 ${article_id} 吗？请再次确认。`,
      }],
    };
  }
);
```

### 环境变量管理 API Key

```javascript
const API_TOKEN = process.env.JUEJIN_TOKEN;
if (!API_TOKEN) {
  console.error("❌ 请设置 JUEJIN_TOKEN 环境变量");
  process.exit(1);
}
```

配置时通过环境变量传入：

```json
{
  "mcpServers": {
    "juejin": {
      "command": "node",
      "args": ["D:/work/juejin-mcp-server/src/index.mjs"],
      "env": {
        "JUEJIN_TOKEN": "your-token-here"
      }
    }
  }
}
```

### 速率限制

```javascript
const callCounts = new Map();
const RATE_LIMIT = 10; // 每分钟最多 10 次
const WINDOW_MS = 60000;

function checkRateLimit(toolName) {
  const now = Date.now();
  const key = toolName;
  const record = callCounts.get(key) || { count: 0, resetAt: now + WINDOW_MS };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + WINDOW_MS;
  }

  record.count++;
  callCounts.set(key, record);

  if (record.count > RATE_LIMIT) {
    throw new Error(`调用频率过高，请 ${Math.ceil((record.resetAt - now) / 1000)} 秒后重试`);
  }
}
```

---

## 发布到 npm

### package.json

```json
{
  "name": "juejin-mcp-server",
  "version": "1.0.0",
  "description": "掘金文章管理 MCP Server - 让 AI 助手搜索和分析掘金文章",
  "type": "module",
  "bin": {
    "juejin-mcp-server": "src/index.mjs"
  },
  "files": ["src/", "README.md"],
  "keywords": ["mcp", "juejin", "ai", "claude", "cursor"],
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  }
}
```

别忘了在 `src/index.mjs` 开头加 Shebang：

```javascript
#!/usr/bin/env node
```

### README 必备内容

对 MCP Server 来说，README 要包含：

1. **做什么**——一句话说明
2. **有哪些 Tools**——列出所有工具名称和功能
3. **安装方式**——`npm install -g` 或 `npx`
4. **配置方式**——Cursor 和 Claude Desktop 的配置示例
5. **需要的环境变量**——API Key 等

```markdown
# juejin-mcp-server

让 AI 助手（Cursor / Claude）搜索和分析掘金文章。

## Tools

| 工具名 | 功能 |
|--------|------|
| search_articles | 搜索掘金文章 |
| get_article_detail | 获取文章详情和完整内容 |
| get_user_stats | 获取作者数据统计 |

## 安装

\```bash
npm install -g juejin-mcp-server
\```

## 配置

### Cursor (.cursor/mcp.json)

\```json
{
  "mcpServers": {
    "juejin": {
      "command": "juejin-mcp-server"
    }
  }
}
\```
```

### 发布

```bash
npm login
npm publish
```

用户安装后，只需在 Cursor 配置里写 `"command": "juejin-mcp-server"` 就能用。

---

## MCP 生态现状和机会

### 已经有的

- 数据库查询（PostgreSQL、MySQL、SQLite）
- 文件系统操作
- Git 操作
- Slack / Discord 消息
- GitHub Issues / PR

### 还有空白的（你的机会）

| 方向 | 为什么有价值 |
|------|------------|
| **国内平台集成** | 掘金、语雀、飞书文档、钉钉——老外不做，你来做 |
| **内部系统适配** | 公司 OA、项目管理、运维面板——每个公司都需要 |
| **行业垂直工具** | 电商数据分析、设计稿解析、法律文书——垂直场景价值高 |
| **开发者工具链** | CI/CD 状态查询、日志搜索、性能监控——开发者刚需 |

**重点：国内生态几乎空白。** 会写 MCP Server 的人本来就少，针对国内平台做的更少。现在做，先发优势巨大。

---

## 总结

1. **实战项目**：做了一个掘金文章管理 MCP Server，包含搜索、详情、统计、摘要生成。
2. **多 Tool 设计**：单一职责、渐进式获取、结构化返回。
3. **安全实践**：区分读写操作、环境变量管理 Key、速率限制。
4. **发布到 npm**——`package.json` 配好 `bin` 和 `files`，README 写清配置方式。
5. **MCP 生态机会**——国内平台集成、内部系统适配几乎空白，先做先赢。

第五阶段 MCP 到这里结束。你已经能写 MCP Server、对接真实 API、发布到 npm——这是一个稀缺且高价值的技能。

**下一篇**，我们进入第六阶段——AI + 前端扩展开发，先做一个 AI 驱动的 Chrome 扩展。

---

> **下一篇预告**：[20 | AI + Chrome 扩展：做一个 AI 驱动的浏览器插件](/series/junior/20-ai-chrome-extension)

---

**讨论话题**：你觉得什么场景最适合做成 MCP Server？有没有你想做但还没人做的 MCP 工具？评论区聊聊。
