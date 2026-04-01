---
title: "Git Diff + AI：智能只审查变更代码（而不是全量扫描）"
description: "深入 Git Diff 解析，实现增量/全量两种 AI 代码审查模式"
order: 11
cover: "./cover.png"
publishDate: "2025-08-08"
tags: ["Git", "AI", "Code Review", "Node.js", "CI/CD"]
---

# Git Diff + AI：智能只审查变更代码（而不是全量扫描）

> 本文是【前端转 AI 全栈实战】系列第 11 篇。
> 上一篇：[npm 发包全流程：让你的 AI 工具被全世界 npx 到](/series/junior/10-npm-publish) | 下一篇：[前端为什么要学 Python：AI 全栈的第二条腿](/series/junior/12-why-python)

---

## 这篇文章你会得到什么

前面三篇你做了 AI CLI 工具、拆解了 ai-review-pipeline、学了 npm 发包。但有一个核心问题还没深入——**AI 审查代码时，到底审查什么？**

最简单的做法：把整个文件扔给 AI。

问题：

- 一个 500 行的文件，你只改了 3 行，AI 把 500 行都看了一遍——浪费 Token
- 全量审查会输出大量和你本次修改无关的"历史问题"——噪音太大
- 大项目有几十个文件，全部扔给 AI 直接超出 Token 限制

更好的做法：**只审查变更的代码**——也就是 `git diff`。

今天我们深入 Git Diff 解析——怎么拿到变更内容、怎么设计增量/全量两种模式、以及怎么把它和 CI/CD 串起来。

---

## Git Diff 基础

### 常用的 diff 命令

```bash
# 工作区 vs 暂存区（未 add 的变更）
git diff

# 暂存区 vs 最近提交（已 add 但未 commit）
git diff --cached

# 对比最近一次提交
git diff HEAD

# 对比两个分支
git diff main...feature

# 只看变更的文件名
git diff HEAD --name-only

# 过滤：只看新增/修改的文件（排除删除）
git diff HEAD --name-only --diff-filter=ACMR
```

### Diff 输出格式

```diff
diff --git a/src/utils.ts b/src/utils.ts
index abc1234..def5678 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -10,6 +10,8 @@ export function formatDate(date: Date) {
   const month = date.getMonth() + 1;
   const day = date.getDate();
-  return `${year}-${month}-${day}`;
+  const pad = (n: number) => n.toString().padStart(2, '0');
+  return `${year}-${pad(month)}-${pad(day)}`;
 }
```

这是标准的 unified diff 格式：

- `--- a/file` / `+++ b/file`：变更的文件
- `@@ -10,6 +10,8 @@`：变更的行范围
- `-` 开头：删除的行
- `+` 开头：新增的行
- 无前缀：上下文行

**AI 能直接理解这种格式**——不需要你解析成结构化数据。直接把 diff 输出丢进 prompt，AI 就能读懂。

---

## 用 Node.js 获取 Git Diff

### 基础封装

```javascript
import { execSync } from 'node:child_process';

const MAX_BUFFER = 5 * 1024 * 1024; // 5MB

function exec(cmd) {
  return execSync(cmd, { encoding: 'utf-8', maxBuffer: MAX_BUFFER });
}

function getDiff({ file, branch, staged } = {}) {
  // 指定了文件
  if (file) {
    const paths = file.split(',').map(s => s.trim()).filter(Boolean);
    return exec(`git diff HEAD -- ${paths.join(' ')}`);
  }

  // 指定了分支
  if (branch) {
    return exec(`git diff ${branch}...HEAD`);
  }

  // staged 模式
  if (staged) {
    return exec('git diff --cached');
  }

  // 默认：先看暂存区，没有就看工作区
  const cached = exec('git diff --cached');
  return cached || exec('git diff HEAD');
}
```

### 获取变更文件列表

```javascript
const CODE_EXT = /\.(ts|tsx|vue|js|jsx|py|mjs|cjs|go|rs|java|kt|swift|rb|php|cs)$/;

function getChangedFiles({ file, staged } = {}) {
  let raw;

  if (file) {
    const paths = file.split(',').map(s => s.trim()).filter(Boolean);
    raw = exec(`git diff HEAD --name-only --diff-filter=ACMR -- ${paths.join(' ')}`);
  } else if (staged) {
    raw = exec('git diff --cached --name-only --diff-filter=ACMR');
  } else {
    raw = exec('git diff --cached --name-only --diff-filter=ACMR');
    if (!raw.trim()) {
      raw = exec('git diff HEAD --name-only --diff-filter=ACMR');
    }
  }

  return raw.trim().split('\n')
    .filter(Boolean)
    .filter(f => CODE_EXT.test(f));
}
```

注意 `--diff-filter=ACMR`：

- **A** = Added（新增）
- **C** = Copied（复制）
- **M** = Modified（修改）
- **R** = Renamed（重命名）

不包含 **D**（Deleted）——删除的文件没有内容可以审查。

### 过滤代码文件

`CODE_EXT` 正则只匹配代码文件，过滤掉图片、字体、lock 文件等非代码文件。审查 `package-lock.json` 的变更没有意义——它是自动生成的。

---

## 增量 vs 全量：两种审查模式

### 模式一：增量审查（默认）

```bash
ai-rp
# 或
ai-rp --file src/views/Home.vue
```

只审查 `git diff` 中的变更部分。适合：

- **日常开发**：每次 commit/push 前审查本次修改
- **CI/CD**：PR 的自动审查
- **Git Hook**：pre-commit / pre-push 触发

优点：Token 消耗少、输出精准、噪音低。
缺点：可能漏掉和修改相关的上下文问题。

### 模式二：全量审查

```bash
ai-rp --file src/views/Home.vue --full
```

读取完整文件内容，以 diff 格式（全部标记为新增行）传给 AI。适合：

- **新文件**：刚创建的文件没有 diff 历史
- **遗留代码排查**：接手老项目时全面扫描
- **特定文件深度审查**：对关键文件做完整审查

```javascript
function readFileAsReview(filePath) {
  const full = resolve(process.cwd(), filePath);
  if (!existsSync(full)) return '';

  const stat = statSync(full);
  if (stat.isDirectory()) {
    // 目录：递归读取所有代码文件
    return collectDirFiles(full).map(f => {
      const rel = relative(process.cwd(), f);
      const content = readFileSync(f, 'utf-8');
      return `--- a/${rel}\n+++ b/${rel}\n${content.split('\n').map(l => `+${l}`).join('\n')}`;
    }).join('\n');
  }

  // 单文件：包装成 diff 格式
  const content = readFileSync(full, 'utf-8');
  return `--- a/${filePath}\n+++ b/${filePath}\n${content.split('\n').map(l => `+${l}`).join('\n')}`;
}
```

把全文件内容包装成 diff 格式（每行加 `+` 前缀），这样 AI 用同一套 prompt 就能处理两种模式，不需要区分。

### 智能回退

如果指定了文件但 `git diff` 没有内容（比如文件是新建的、不在 git 仓库里），自动回退到全量模式：

```javascript
function getDiff({ file, branch, staged, full } = {}) {
  if (file) {
    const paths = file.split(',').map(s => s.trim()).filter(Boolean);

    // 全量模式：直接读文件
    if (full) {
      return paths.map(p => readFileAsReview(p)).filter(Boolean).join('\n');
    }

    // 增量模式：先尝试 git diff
    try {
      const diff = exec(`git diff HEAD -- ${paths.join(' ')}`);
      if (diff.trim()) return diff;
    } catch {
      // 不在 git 仓库，或者没有 diff
    }

    // 回退到全量
    return paths.map(p => readFileAsReview(p)).filter(Boolean).join('\n');
  }

  // ... 其他情况
}
```

这个"先尝试 diff → 失败则回退到全量"的策略很实用。用户不需要关心底层逻辑，工具自动选择最合适的方式。

---

## 目录级审查

前面的 `--file` 不只支持单文件，还支持目录：

```bash
# 审查整个 src 目录的变更
ai-rp --file src/

# 全量审查整个目录
ai-rp --file src/ --full

# 多个路径，逗号分隔
ai-rp --file src/views/Home.vue,src/utils/api.ts
```

目录级审查的实现是递归收集所有代码文件：

```javascript
const CODE_EXT = /\.(ts|tsx|vue|js|jsx|py|mjs|cjs|go|rs|java|kt|swift|rb|php|cs|uvue)$/;

function collectDirFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      // 跳过不该审查的目录
      if (!['node_modules', '.git', 'dist', '.next'].includes(entry.name)) {
        results.push(...collectDirFiles(full));
      }
    } else if (CODE_EXT.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}
```

**跳过 `node_modules`、`.git`、`dist`** 是关键——这些目录有成千上万的文件，不审查它们能节省 99% 的 Token。

---

## 大 Diff 的截断策略

当 diff 太大（比如一次 commit 改了 50 个文件），直接扔给 AI 会：

1. 超出 Token 限制 → 400 错误
2. AI 的注意力被分散 → 审查质量下降
3. 浪费钱

### 自动截断

```javascript
const maxDiffLines = config.review.maxDiffLines || 3000;

const totalLines = diff.split('\n').length;
const truncated = totalLines > maxDiffLines
  ? diff.split('\n').slice(0, maxDiffLines).join('\n') + '\n... (truncated)'
  : diff;

if (totalLines > maxDiffLines) {
  log('⚠️', `Diff ${totalLines} 行，已截断至 ${maxDiffLines} 行`);
}
```

默认 3000 行。为什么是 3000？

- DeepSeek 的上下文限制是 64K tokens
- 3000 行代码约 6000-12000 tokens（取决于语言和注释密度）
- 加上 system prompt 和输出预留，大约占 context 的 20-30%——安全范围

### 更聪明的策略

截断不是最优解。更好的方式是**按文件拆分**：

```javascript
// 未来优化方向：按文件分批审查
async function reviewByFile(files) {
  const results = [];
  for (const file of files) {
    const diff = exec(`git diff HEAD -- ${file}`);
    if (!diff.trim()) continue;
    const result = await reviewSingleFile(diff);
    results.push({ file, ...result });
  }
  return mergeResults(results);
}
```

每个文件单独审查，最后合并结果。这样每次审查的 Token 消耗可控，质量也更高。

---

## CI/CD 集成实战

### GitHub Actions

```yaml
name: AI Code Review

on:
  pull_request:
    branches: [main, develop]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # 必须：需要完整的 git 历史来计算 diff

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: AI Review
        run: npx ai-review-pipeline --json
        env:
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}

      - name: Upload Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ai-review-report
          path: .ai-reports/
```

关键点：

- `fetch-depth: 0`：GitHub Actions 默认只 clone 最近一次 commit（shallow clone），没有 diff 历史。设为 0 拉完整历史。
- `--json`：CI 模式输出纯 JSON，方便后续解析。
- `if: always()`：即使 review 失败（exit 1），也上传报告。

### Git Hook（lefthook）

```yaml
# lefthook.yml
pre-push:
  commands:
    ai-review:
      run: npx ai-rp --fix --max-rounds 3
```

每次 `git push` 前自动审查。有 🔴 问题就阻断推送。

也可以用 pre-commit：

```yaml
pre-commit:
  commands:
    ai-review:
      run: npx ai-rp --staged
```

`--staged` 只审查已 `git add` 的文件变更——这是最精准的范围。

### 和 PR 评论集成

更高级的玩法：把审查结果作为 PR 评论发出来。

```yaml
- name: AI Review
  id: review
  run: |
    npx ai-review-pipeline --json > review.json 2>&1 || true
  env:
    DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}

- name: Comment on PR
  uses: actions/github-script@v7
  with:
    script: |
      const fs = require('fs');
      const review = JSON.parse(fs.readFileSync('review.json', 'utf-8'));
      await github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
        body: `## AI Code Review\n\n**Score**: ${review.score}/100\n\n${review.markdown}`,
      });
```

---

## 封装通用 getDiff 模块

把前面的内容整合成一个可复用的模块：

```javascript
// diff.mjs
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const MAX_BUFFER = 5 * 1024 * 1024;
const CODE_EXT = /\.(ts|tsx|vue|js|jsx|py|mjs|cjs|go|rs|java|kt|swift|rb|php|cs)$/;

function exec(cmd) {
  return execSync(cmd, { encoding: 'utf-8', maxBuffer: MAX_BUFFER });
}

function collectDirFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'dist', '.next', '__pycache__'].includes(entry.name)) {
        results.push(...collectDirFiles(full));
      }
    } else if (CODE_EXT.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function readFileAsReview(filePath) {
  const full = resolve(process.cwd(), filePath);
  if (!existsSync(full)) return '';
  const stat = statSync(full);

  if (stat.isDirectory()) {
    return collectDirFiles(full).map(f => {
      const rel = relative(process.cwd(), f);
      const content = readFileSync(f, 'utf-8');
      return `--- a/${rel}\n+++ b/${rel}\n${content.split('\n').map(l => `+${l}`).join('\n')}`;
    }).join('\n');
  }

  const content = readFileSync(full, 'utf-8');
  return `--- a/${filePath}\n+++ b/${filePath}\n${content.split('\n').map(l => `+${l}`).join('\n')}`;
}

export function getDiff({ file, branch, staged, full } = {}) {
  if (file) {
    const paths = file.split(',').map(s => s.trim()).filter(Boolean);
    if (full) return paths.map(p => readFileAsReview(p)).filter(Boolean).join('\n');
    try {
      const diff = exec(`git diff HEAD -- ${paths.join(' ')}`);
      if (diff.trim()) return diff;
    } catch {}
    return paths.map(p => readFileAsReview(p)).filter(Boolean).join('\n');
  }
  if (branch) return exec(`git diff ${branch}...HEAD`);
  if (staged) return exec('git diff --cached');
  const cached = exec('git diff --cached');
  return cached || exec('git diff HEAD');
}

export function getChangedFiles({ file, staged, full } = {}) {
  if (file) {
    const paths = file.split(',').map(s => s.trim()).filter(Boolean);
    if (full) {
      const result = [];
      for (const p of paths) {
        const fullPath = resolve(process.cwd(), p);
        if (!existsSync(fullPath)) continue;
        if (statSync(fullPath).isDirectory()) {
          result.push(...collectDirFiles(fullPath).map(f => relative(process.cwd(), f)));
        } else if (CODE_EXT.test(p)) {
          result.push(p);
        }
      }
      return result;
    }
    try {
      const files = exec(`git diff HEAD --name-only --diff-filter=ACMR -- ${paths.join(' ')}`)
        .trim().split('\n').filter(Boolean).filter(f => CODE_EXT.test(f));
      if (files.length) return files;
    } catch {}
    return paths;
  }
  if (staged) {
    return exec('git diff --cached --name-only --diff-filter=ACMR')
      .trim().split('\n').filter(Boolean).filter(f => CODE_EXT.test(f));
  }
  try {
    const files = exec('git diff --cached --name-only --diff-filter=ACMR')
      .trim().split('\n').filter(Boolean).filter(f => CODE_EXT.test(f));
    if (files.length) return files;
  } catch {}
  return exec('git diff HEAD --name-only --diff-filter=ACMR')
    .trim().split('\n').filter(Boolean).filter(f => CODE_EXT.test(f));
}
```

这个模块可以直接复用到任何需要"获取 Git 变更"的 AI 工具中——不只是 Code Review，翻译工具、文档生成工具等都用得上。

---

## 总结

1. **AI 审查代码应该审查 diff 而不是全文件**——Token 更省、输出更精准、噪音更低。
2. **`git diff` 的输出格式 AI 能直接理解**——不需要你做额外解析。
3. **增量 + 全量两种模式**：默认增量（diff），`--full` 切全量。
4. **智能回退**：没有 diff 时自动回退到读文件。
5. **大 diff 需要截断**——3000 行是安全阈值，更好的方案是按文件拆分审查。
6. **CI 集成需要 `fetch-depth: 0`**——不然拿不到 diff 历史。
7. **`--staged` 是最精准的 Git Hook 模式**——只审查已暂存的变更。

这三篇（09-11）完整展示了一个真实 AI CLI 工具的全生命周期：架构设计 → 发布 → 核心模块实现。接下来我们进入第四阶段——**AI 全栈应用开发**，开始用 Python + FastAPI 搭建 AI 后端。

---

> **下一篇预告**：[12 | 前端为什么要学 Python：AI 全栈的第二条腿](/series/junior/12-why-python)

---

**讨论话题**：你的 AI 工具是审查 diff 还是全文件？有没有更好的"智能选择审查范围"的方案？评论区聊聊。
