---
title: "前端团队的 AI 工作流升级：不只是用 Copilot"
description: "将 AI 融入开发全流程：编码、Review、测试、提交到部署"
order: 18
cover: "./cover.png"
publishDate: "2025-11-23"
tags: ["AI工作流", "团队协作", "Code Review", "开发效率"]
---

# 前端团队的 AI 工作流升级：不只是用 Copilot

> 本文是【高级前端的 AI 架构升级之路】系列第 18 篇。
> 上一篇：[作为 TL，怎么带团队从 0 到 1 落地 AI 功能](/series/senior/17-ai-team-lead) | 下一篇：[AI 时代的技术选型方法论：该自建还是用第三方](/series/senior/19-ai-tech-selection)

---

## 引言

团队里 80% 的人用 AI 的方式是"打开 ChatGPT，复制代码"。

这不叫 AI 工作流。这叫手动搬运。

作为 TL，你的目标是让 AI 融入团队的**每个开发环节**——不是每个人自己去聊天，而是 AI 嵌入到 IDE、Git、CI/CD、Code Review 的每一步。

---

## AI 工作流全景

```
需求分析 → 设计 → 编码 → Code Review → 测试 → 部署 → 监控
   ↑         ↑       ↑         ↑           ↑       ↑       ↑
  AI         AI      AI        AI          AI      AI      AI
```

### 每个环节的 AI 增强

| 环节 | AI 增强方式 | 工具/方案 |
|------|-----------|----------|
| **需求分析** | 需求文档 → 技术方案初稿 | Cursor Chat + 自定义 Prompt |
| **设计** | UI 截图 → 代码骨架 | v0.dev / Cursor Vision |
| **编码** | 实时补全 + 生成 | Cursor / Copilot |
| **Code Review** | AI 自动审查 | ai-review-pipeline / GitHub Copilot Review |
| **测试** | 自动生成测试用例 | AI + Vitest |
| **提交** | 自动生成 Commit Message | AI Git Hook |
| **部署** | 变更影响分析 | AI Diff 分析 |
| **监控** | 异常日志分析 | AI 日志解读 |

---

## 编码阶段：超越自动补全

### Cursor Rules 规范化

整个团队共享 `.cursor/rules/` 配置，让 AI 理解你们的代码规范：

```markdown
<!-- .cursor/rules/coding-standards.mdc -->
---
description: 团队编码规范
globs: ["src/**/*.ts", "src/**/*.vue"]
---

## 代码风格
- 使用 Vue 3 Composition API + `<script setup>`
- 组件文件名用 PascalCase
- composables 用 `use` 前缀
- 所有 API 调用封装在 `src/api/` 下

## TypeScript
- 禁止使用 `any`，用 `unknown` + 类型守卫
- 接口命名用 `I` 前缀或描述性名词
- enum 用 const enum

## 目录结构
- 页面组件: `src/views/{module}/{Page}.vue`
- 通用组件: `src/components/{Component}/index.vue`
- API 层: `src/api/{module}.ts`
- 类型定义: `src/types/{module}.ts`
```

### 项目级 Prompt

```markdown
<!-- .cursor/rules/project-context.mdc -->
---
description: 项目上下文
globs: ["**/*"]
---

## 项目概述
这是一个企业级 AI 管理平台，技术栈：
- 前端: Vue 3 + TypeScript + Element Plus + Pinia
- 后端: Python FastAPI
- AI: DeepSeek + OpenAI + 本地 Ollama

## 重要约定
- AI 调用统一走 `/api/ai/` 前缀
- SSE 流式协议使用项目统一格式（见 src/types/sse.ts）
- 所有页面支持暗黑模式
```

团队每个人的 Cursor 都读同一套规则，AI 生成的代码风格统一。

---

## Code Review 阶段：AI 自动审查

### 接入 ai-review-pipeline

```yaml
# .github/workflows/ai-review.yml
name: AI Code Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npx ai-review-pipeline --mode=review --format=json
        env:
          AI_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
          AI_BASE_URL: https://api.deepseek.com/v1
          AI_MODEL: deepseek-chat

      - name: Post review comments
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const review = JSON.parse(fs.readFileSync('ai-review-result.json', 'utf8'));
            
            for (const issue of review.issues) {
              await github.rest.pulls.createReviewComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                pull_number: context.issue.number,
                body: `🤖 AI Review: ${issue.message}`,
                path: issue.file,
                line: issue.line,
              });
            }
```

### Review 分级

```typescript
// AI Review 的严重程度分级
type ReviewSeverity = 'critical' | 'warning' | 'suggestion' | 'nitpick'

// critical: 必须修复（安全漏洞、数据泄露）
// warning: 建议修复（性能问题、潜在 Bug）
// suggestion: 可选优化（代码可读性）
// nitpick: 风格建议（可忽略）
```

---

## Git 阶段：智能 Commit

### AI Commit Message Hook

```javascript
// .husky/prepare-commit-msg
#!/usr/bin/env node
import { execSync } from 'child_process'

const diff = execSync('git diff --cached --stat').toString()
if (!diff.trim()) process.exit(0)

const detailedDiff = execSync('git diff --cached').toString()

const prompt = `根据以下 Git diff 生成 commit message。
规则：
- 使用 conventional commits 格式（feat/fix/refactor/docs/chore）
- 中文描述，不超过 50 字
- 如果涉及多个改动，用 scope 区分

Diff:
${detailedDiff.slice(0, 3000)}`

// 调用 AI 生成 commit message
const message = await callAI(prompt)
writeFileSync(process.argv[2], message)
```

---

## 测试阶段：AI 生成测试

### 自动补全测试用例

```typescript
// scripts/ai-test-gen.ts
async function generateTests(filePath: string) {
  const sourceCode = readFileSync(filePath, 'utf8')

  const prompt = `为以下 TypeScript 代码生成 Vitest 单元测试。
要求：
- 覆盖正常路径和异常路径
- 使用 describe/it 结构
- Mock 外部依赖
- 使用 TypeScript

代码：
${sourceCode}`

  const testCode = await callAI(prompt)

  const testPath = filePath.replace('/src/', '/tests/').replace('.ts', '.test.ts')
  writeFileSync(testPath, testCode)
}
```

### CI 集成

```yaml
# 新代码没有测试时，AI 自动生成
- name: Check test coverage
  run: |
    CHANGED_FILES=$(git diff --name-only HEAD~1 -- 'src/**/*.ts')
    for file in $CHANGED_FILES; do
      TEST_FILE=$(echo $file | sed 's|src/|tests/|' | sed 's|\.ts$|.test.ts|')
      if [ ! -f "$TEST_FILE" ]; then
        echo "Missing test for $file, generating..."
        npx ts-node scripts/ai-test-gen.ts $file
      fi
    done
```

---

## 文档阶段：AI 辅助文档

### API 文档自动生成

```typescript
// 从 TypeScript 接口自动生成 API 文档
async function generateApiDocs(typesFile: string) {
  const types = readFileSync(typesFile, 'utf8')

  const prompt = `根据以下 TypeScript 类型定义，生成中文 API 文档。
包含：接口说明、字段说明、示例请求/响应。
格式：Markdown。

${types}`

  return callAI(prompt)
}
```

### CHANGELOG 自动生成

```bash
# 从 Git log 自动生成 CHANGELOG
git log --oneline v1.2.0..HEAD | npx ai-changelog-gen
```

---

## 团队培训计划

### 第一周：基础

```
Day 1: Cursor 安装 + 基本补全
Day 2: Tab 补全 vs Cmd+K 编辑 vs Chat
Day 3: .cursor/rules 配置
Day 4: 常用 Prompt 模板分享
Day 5: 实战练习
```

### 第二周：进阶

```
Day 1: AI Code Review 工作流
Day 2: AI 生成测试
Day 3: AI Commit Message
Day 4: 自定义 MCP Server
Day 5: 团队 Best Practices 沉淀
```

### 效果度量

```typescript
interface TeamAIMetrics {
  // 效率指标
  avgPRSize: number              // PR 平均大小变化
  avgPRReviewTime: number        // PR Review 时间变化
  avgBugFixTime: number          // Bug 修复时间变化
  testCoverage: number           // 测试覆盖率变化

  // 使用指标
  cursorActiveUsers: number      // Cursor 活跃用户数
  aiReviewPassRate: number       // AI Review 通过率
  aiSuggestionAcceptRate: number // AI 建议采纳率

  // 质量指标
  productionBugs: number         // 线上 Bug 数量变化
  codeQualityScore: number       // 代码质量评分变化
}
```

---

## 总结

1. **编码规范共享**——`.cursor/rules/` 统一团队 AI 生成代码的风格。
2. **Code Review 自动化**——ai-review-pipeline 在 PR 上自动审查，减少人工 Review 负担。
3. **Git 智能化**——AI 生成 Commit Message，保持提交历史清晰。
4. **测试补全**——新代码没有测试时 AI 自动生成，提升覆盖率。
5. **培训 + 度量**——两周培训计划 + 效果度量，确保团队真正用起来。

---

> **下一篇预告**：[19 | AI 时代的技术选型方法论：该自建还是用第三方](/series/senior/19-ai-tech-selection)

---

**工作流讨论**：你们团队用了哪些 AI 工具？工作流有哪些改变？评论区聊聊。
