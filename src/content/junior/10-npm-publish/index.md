---
title: "npm 发包全流程：让你的 AI 工具被全世界 npx 到"
description: "从 package.json 配置到 npm publish，走完 npm 发包的全流程"
order: 10
cover: "./cover.png"
publishDate: "2025-08-01"
tags: ["npm", "Node.js", "CLI", "开源", "工程化"]
---

# npm 发包全流程：让你的 AI 工具被全世界 npx 到

> 本文是【前端转 AI 全栈实战】系列第 10 篇。
> 上一篇：[我是怎么做 ai-review-pipeline 的（从 v1 到 v3 的架构演进）](/series/junior/09-ai-review-pipeline) | 下一篇：[Git Diff + AI：智能只审查变更代码](/series/junior/11-git-diff-ai)

---

## 这篇文章你会得到什么

上一篇你看到了 ai-review-pipeline 的架构演进。但一个 CLI 工具光写完不够——**你需要让别人用上它**。

在 Node.js 生态里，"发布"等于"npm publish"。一行命令就能让全世界的开发者通过 `npx` 直接使用你的工具：

```bash
npx ai-review-pipeline --file src/ --full
```

今天我们走完 npm 发包的**全流程**——从 package.json 配置到 npm publish 到版本管理策略，每一步都有真实踩坑经验。

---

## 发包前的 package.json 配置

### bin 字段：注册全局命令

```json
{
  "name": "ai-review-pipeline",
  "version": "3.0.0",
  "type": "module",
  "bin": {
    "ai-review-pipeline": "bin/cli.mjs",
    "ai-rp": "bin/cli.mjs"
  }
}
```

`bin` 定义了两个命令名——`ai-review-pipeline`（完整名）和 `ai-rp`（缩写）。安装后两个命令都能用。

**注意**：`bin` 指向的文件第一行必须有 Shebang：

```javascript
#!/usr/bin/env node
```

没有这行，Linux/Mac 上会报 `Permission denied`。

### files 字段：控制发布内容

```json
{
  "files": [
    "bin",
    "src",
    "templates"
  ]
}
```

`files` 是白名单——只有列出的目录会被打包上传。不写 `files` 的话，npm 会把整个项目都发上去（除了 `.gitignore` 里的）。

**必须排除的**：

- `.env` / `.env.local`（API Key！）
- `node_modules/`（npm 自动排除）
- `.git/`（npm 自动排除）
- 测试文件、文档草稿

**建议**：用 `files` 白名单而不是 `.npmignore` 黑名单。白名单更安全——忘加的文件不会发上去；黑名单忘排除的文件会泄露。

### engines 字段：声明 Node.js 版本

```json
{
  "engines": {
    "node": ">=18"
  }
}
```

ai-review-pipeline 用了 Node.js 18 的原生 `fetch`，所以声明 `>=18`。这样低版本 Node.js 的用户在安装时会收到警告。

### 其他重要字段

```json
{
  "description": "AI-powered code quality pipeline — review, fix, test, report in one command",
  "keywords": ["ai", "code-review", "cli", "pipeline", "testing"],
  "repository": {
    "type": "git",
    "url": "https://github.com/hyxnj666-creator/ai-review-pipeline"
  },
  "homepage": "https://github.com/hyxnj666-creator/ai-review-pipeline#readme",
  "license": "MIT",
  "author": "Feng Liu"
}
```

- `description`：npm 搜索结果里展示的那一行
- `keywords`：影响搜索排名
- `repository` / `homepage`：npm 页面上的链接
- `license`：MIT 是最宽松的选择

---

## ESM vs CJS：2025 年了，用 ESM

### 为什么选 ESM

```json
{
  "type": "module"
}
```

2025 年发新包，没有理由用 CJS（CommonJS）。ESM 的优势：

- **Tree-shaking 友好**——打包工具可以剔除未使用的代码
- **顶层 await**——不用套 async IIFE
- **原生浏览器兼容**——虽然 CLI 不需要，但统一生态有价值
- **Node.js 20+ 默认推荐**——趋势明确

### 实际注意事项

1. **文件扩展名**：用 `.mjs` 或者在 `package.json` 里设 `"type": "module"` 后用 `.js`
2. **import 路径必须带扩展名**：`import { foo } from './utils.mjs'`（不能省略 `.mjs`）
3. **没有 `__dirname`**：用 `import.meta.url` 替代

```javascript
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
```

4. **没有 `require`**：用 `createRequire` 或者 `JSON.parse(readFileSync(...))`

```javascript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));
```

---

## npm 发布全流程

### 1. 注册 npm 账号

去 [npmjs.com](https://www.npmjs.com/) 注册。2025 年强制 2FA（两步验证），建议用 Authenticator App。

### 2. 命令行登录

```bash
npm login
# 输入用户名、密码、邮箱、OTP 验证码
```

登录成功后可以用 `npm whoami` 验证。

### 3. 检查包名

```bash
npm search ai-review-pipeline
# 或者直接访问 https://www.npmjs.com/package/ai-review-pipeline
```

包名先到先得。好名字很稀缺——如果你想要的名字被占了，可以考虑加前缀（`@yourname/tool-name`）。

### 4. 发布前检查

```bash
# 看看实际会发布哪些文件
npm pack --dry-run
```

**一定要执行这一步**！曾经有人把 `.env` 文件发到 npm 上，API Key 全泄露了。

`npm pack --dry-run` 会列出所有将被打包的文件，检查有没有不该发的东西。

### 5. 发布

```bash
npm publish
```

第一次发布就这么简单。如果包名有 `@scope/`（比如 `@myname/ai-tool`），需要加 `--access public`：

```bash
npm publish --access public
```

### 6. 验证

```bash
# 全局安装试试
npm install -g ai-review-pipeline
ai-rp --version

# 或者 npx 直接跑
npx ai-review-pipeline --help
```

---

## 版本管理：什么时候 bump

### Semver 规则

npm 用 [Semantic Versioning](https://semver.org/)——`MAJOR.MINOR.PATCH`：

| 类型 | 什么时候 bump | 示例 |
|------|--------------|------|
| PATCH（x.x.**1**） | 修 Bug，不改 API | 修了一个 JSON 解析的边界错误 |
| MINOR（x.**1**.0） | 加新功能，向下兼容 | 新增 `--staged` flag |
| MAJOR（**2**.0.0） | 破坏性变更 | 删掉 `--dry-run`、改变默认行为 |

### 实际操作

```bash
# 修 Bug
npm version patch  # 3.0.0 → 3.0.1
npm publish

# 新功能
npm version minor  # 3.0.1 → 3.1.0
npm publish

# 破坏性变更
npm version major  # 3.1.0 → 4.0.0
npm publish
```

`npm version` 会自动修改 `package.json` 的 version 字段并创建 git tag。

### ai-review-pipeline 的版本决策

| 版本 | 变更 | 为什么这样选 |
|------|------|-------------|
| v1.x | 初始版本，基础功能 | 快速迭代，小版本频繁 |
| v2.0 | 多模型支持 | 新增大量功能，API 变化 |
| v3.0 | 统一流水线，删掉 `--dry-run` | 破坏性变更（删功能 + 改默认行为） |

v3 之所以是 major bump，是因为删掉了 `--dry-run`，改变了默认命令的行为（从"什么都不做"变成"review + test + report"）。依赖 v2 行为的脚本升级后会出问题。

---

## README：你的包的"首页"

npm 包页面的主要内容就是 README。好的 README 能让下载量翻倍。

### README 的结构

```markdown
# 包名

> 一句话介绍

## 30 秒上手
（最快的使用路径，复制粘贴就能跑）

## 功能特性
（用列表或表格展示）

## 安装 / 使用
（详细的命令和参数）

## 配置
（配置文件说明）

## CI/CD 集成
（GitHub Actions / Git Hook 的示例）

## 常见问题

## License
```

### 几个关键原则

1. **30 秒上手放最前面**——用户没耐心看完整文档，先给他一个能跑的命令
2. **有截图或 GIF**——终端效果图、HTML 报告截图，直观展示效果
3. **有对比表格**——和同类工具对比，突出差异化
4. **中英文双语**——如果你的目标用户包含国际开发者
5. **badge 不用太多**——npm version + license + downloads 就够了

---

## 发布后的维护

### 处理 Issue

开源后会收到 Issue。分类处理：

- **Bug**：确认复现 → 修复 → patch 版本
- **Feature Request**：评估合理性 → 排期或标记 `wontfix`
- **使用问题**：回复 + 更新 README/FAQ

### 安全更新

如果发现安全问题（比如 `npm audit` 报警），尽快发补丁版本。

### 弃用声明

如果某天不维护了，别直接删包（会影响别人）。用 `npm deprecate`：

```bash
npm deprecate ai-review-pipeline "This package is no longer maintained. Use xxx instead."
```

---

## 推广策略

发了包不代表有人用。推广很重要：

### 1. 掘金/知乎/微信公众号发文

写一篇"我做了 xxx，解决了 xxx 问题"的文章。重点不是介绍功能，而是讲**为什么做、解决什么痛点、怎么用**。

### 2. GitHub README SEO

- 仓库名要有关键词（`ai-review-pipeline` 比 `my-tool` 好找）
- Description 写清楚
- Topics 加上 `ai`、`code-review`、`cli`

### 3. 社区互动

- 在 V2EX、Reddit、Hacker News 发帖介绍
- 在相关项目的 Discussion 里提及（但别 spam）
- Twitter/X 发技术向内容

### 4. 产品化思维

把开源项目当产品运营：

- **用户反馈 → 迭代**——Issue 里高频出现的问题就是下一版的 feature
- **数据驱动**——关注 npm 下载量、GitHub star 趋势
- **文档即产品**——README 的质量直接决定转化率

---

## npm 发包常见踩坑

### 坑 1：忘记 build

如果你的项目需要构建（TypeScript → JavaScript），发布前一定要 build。可以在 `package.json` 里加 `prepublishOnly` 钩子：

```json
{
  "scripts": {
    "prepublishOnly": "npm run build"
  }
}
```

ai-review-pipeline 用纯 JS（`.mjs`），不需要构建步骤——这也是零依赖策略的好处。

### 坑 2：发布了敏感文件

检查方法：

```bash
npm pack --dry-run 2>&1 | head -50
```

应该只看到 `bin/`、`src/`、`package.json`、`README.md`、`LICENSE` 这些文件。

### 坑 3：包名被占

如果 `my-tool` 被占了，可以：

- 加描述性前缀：`ai-my-tool`
- 用 scope：`@yourname/my-tool`
- 换个更好的名字（这通常是最好的选择）

### 坑 4：版本号发错

`npm publish` 是不可撤销的——同一个版本号不能重复发布。如果发错了：

```bash
# 72 小时内可以撤回
npm unpublish ai-review-pipeline@3.0.1

# 超过 72 小时只能发新版本
npm version patch
npm publish
```

建议：先 `npm publish --dry-run` 确认没问题再正式发布。

### 坑 5：2FA 验证问题

npm 强制 2FA 后，CI 里自动发包需要配置 npm token：

```bash
# 生成 automation token（CI 用）
npm token create --cidr=0.0.0.0/0

# 在 CI 环境变量里设置
NPM_TOKEN=npm_xxx
```

GitHub Actions 示例：

```yaml
- name: Publish to npm
  run: npm publish
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## 完整发包 Checklist

发布前过一遍这个清单：

- [ ] `package.json` 的 `name`、`version`、`description` 正确
- [ ] `bin` 字段指向正确的入口文件，入口文件有 Shebang
- [ ] `files` 字段只包含需要发布的目录
- [ ] `engines` 声明了 Node.js 最低版本
- [ ] `repository` 和 `homepage` 指向 GitHub
- [ ] `license` 字段和 LICENSE 文件一致
- [ ] `npm pack --dry-run` 检查过，没有敏感文件
- [ ] README 有 30 秒上手、功能介绍、使用示例
- [ ] 本地 `npm link` 测试过，命令能正常执行
- [ ] `npx` 测试过（`npx .` 在项目目录下测试）
- [ ] `npm login` 已登录
- [ ] `npm publish` 发布

---

## 总结

1. **`bin` + Shebang + `files`** 是 npm CLI 包的三个核心配置。
2. **2025 年用 ESM**——`"type": "module"`，注意 `import.meta.url` 替代 `__dirname`。
3. **`npm pack --dry-run` 是安全网**——发布前必查，避免泄露 `.env`。
4. **Semver 要严格遵守**——破坏性变更必须 major bump。
5. **README 即产品**——30 秒上手放最前面，有截图有对比。
6. **发了才是开始**——推广、维护、迭代比发包本身更重要。

**下一篇**，我们深入 Git Diff 解析——如何只让 AI 审查变更代码而不是全量扫描，以及增量 Review 的设计思路。

---

> **下一篇预告**：[11 | Git Diff + AI：智能只审查变更代码（而不是全量扫描）](/series/junior/11-git-diff-ai)

---

**讨论话题**：你发过 npm 包吗？第一次发布时踩过什么坑？评论区聊聊。
