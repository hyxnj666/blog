---
title: "我是怎么做 ai-review-pipeline 的（从 v1 到 v3 的架构演进）"
description: "拆解真实开源项目 ai-review-pipeline，从 v1 到 v3 的架构演进复盘"
order: 9
cover: "./cover.png"
publishDate: "2025-07-25"
tags: ["AI", "CLI", "Code Review", "Node.js", "开源"]
---

# 我是怎么做 ai-review-pipeline 的（从 v1 到 v3 的架构演进）

> 本文是【前端转 AI 全栈实战】系列第 09 篇。
> 上一篇：[从脚本到 CLI 工具：用 Node.js 打造你的第一个 AI 命令行工具](/series/junior/08-cli-tool) | 下一篇：[npm 发包全流程：让你的 AI 工具被全世界 npx 到](/series/junior/10-npm-publish)

---

## 这篇文章你会得到什么

前面我们学了 CLI 工具开发的方法论。今天换一个角度——**直接拆解一个真实的开源项目**，看它从第一行代码到 v3.0.0 经历了什么。

这个项目叫 [ai-review-pipeline](https://www.npmjs.com/package/ai-review-pipeline)，是我自己做的 AI 代码质量流水线 CLI 工具。功能一句话概括：

```bash
npx ai-review-pipeline
```

一行命令，AI Code Review → 自动修复 → 测试用例生成 → HTML 报告，全自动。

它不是一个 Demo——已经发布到 npm，有真实用户在用，我自己的团队每天都在 Git Hook 里跑它。

这篇文章不是工具介绍，而是**架构复盘**：从 v1 的 200 行脚本到 v3 的统一流水线，每个版本为什么这么设计，踩了哪些坑，哪些决策对了，哪些走了弯路。

---

## 起点：为什么要做这个工具

2025 年，Cursor、Copilot 让写代码的效率翻了好几倍。但我在团队里发现了一个严重问题：

**AI 写得快，但没人 Review。**

你让 Cursor 写了一个 Vue 组件，它跑起来了，但：

- 有没有 XSS 风险？
- 边界值处理了吗？空值呢？
- 类型是不是全用的 `any`？
- 错误处理有没有吞掉异常？

一个人的项目没人帮你看代码，团队项目大家也在赶进度。人工 Review 的成本太高了。

既然 AI 能写代码，那 **AI 审查 AI 写的代码**，不是更合理吗？

---

## v1：200 行脚本，能用就行

### 最初的形态

v1 只是一个单文件脚本，做一件事——把 `git diff` 的内容发给 AI，让它做 Code Review。

```javascript
#!/usr/bin/env node
import { execSync } from 'node:child_process';

// 拿到 git diff
const diff = execSync('git diff HEAD~1', { encoding: 'utf-8' });

// 构建 prompt
const prompt = `你是一个代码审查员。请审查以下代码变更，找出问题。

${diff}`;

// 调 AI
const response = await fetch('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
  },
  body: JSON.stringify({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
  }),
});

const result = await response.json();
console.log(result.choices[0].message.content);
```

就这么多。`git diff` → 拼 prompt → 调 API → 输出结果。

### v1 的问题

用了几天就发现不行：

1. **输出格式不稳定**——有时候给评分有时候不给，有时候列问题有时候只是泛泛而谈
2. **只支持一家 AI**——硬编码 DeepSeek
3. **没有错误处理**——Key 过期直接崩
4. **只能看 diff**——新文件没有 diff 历史就跳过了
5. **结果不能存档**——看完就没了，不能给同事看

但 v1 验证了一个关键假设：**AI 审查代码是可行的，而且比想象的好用**。DeepSeek 审查出了好几个我没注意到的边界值问题。

---

## v2：拆命令、加配置——过度设计的教训

### 膨胀期

有了 v1 的验证，我开始兴奋地加功能：

- `review` 命令：AI 审查
- `fix` 命令：AI 自动修复
- `test` 命令：AI 生成测试用例
- 支持 6 家 AI 厂商（OpenAI / DeepSeek / Claude / 通义千问 / Gemini / Ollama）
- 配置文件 `.ai-pipeline.json`
- HTML 报告
- i18n 中英文支持
- `--dry-run` 模式

### 架构

```
bin/cli.mjs              # 入口，命令路由
src/commands/
  review.mjs             # review 命令
  fix.mjs                # fix 命令
  test.mjs               # test 命令
  init.mjs               # 配置初始化
src/core/
  ai-client.mjs          # 多 Provider 统一调用
  config.mjs             # 配置加载
  diff.mjs               # git diff 解析
  env.mjs                # .env.local 加载
  report.mjs             # HTML 报告
  logger.mjs             # 日志 + i18n
```

### 核心模块拆解

**多 Provider 统一调用（ai-client.mjs）**

这是 v2 最有价值的设计。我在[第 4 篇](/series/junior/04-multi-model-client)讲过多模型适配，这里是实际应用：

```javascript
// 除了 Claude，其他厂商都兼容 OpenAI 格式
// 所以只需要两个调用函数
callOpenAICompatible({ baseUrl, apiKey, model, prompt })
callClaude({ baseUrl, apiKey, model, prompt })
```

Provider 自动识别的逻辑很简单：

```javascript
// 基于环境变量自动识别用的哪家
// DEEPSEEK_API_KEY → DeepSeek
// ANTHROPIC_API_KEY → Claude  
// OPENAI_API_KEY → OpenAI
// 用户也可以通过 AI_REVIEW_PROVIDER 显式指定
```

用户只需要配一个 Key，工具自动识别厂商、自动选默认模型。零配置上手。

**结构化 Review Prompt（review.mjs）**

这是[第 6 篇 Prompt 工程](/series/junior/06-prompt-engineering)的实战应用。Review prompt 按严重程度分三级：

| 等级 | 含义 | CI 行为 |
|------|------|---------|
| 🔴 Red | 必修：逻辑错误、安全漏洞、数据风险 | 阻断提交 |
| 🟡 Yellow | 建议：边界未处理、类型问题、错误处理缺失 | 警告 |
| 🟢 Green | 优化：代码重复、命名不清、性能隐患 | 仅提示 |

AI 输出结构化 JSON，包含评分 + 问题列表 + 每个问题的修复建议。用 `response_format: json_object` 加容错解析确保稳定。

**安全修复机制（pipeline.mjs）**

自动修复最怕 AI "修"出一个删了大半代码的结果。所以加了一个安全阀：

```javascript
// 修复后的文件不能低于原文件的 50%
if (fixed.trim().length < source.trim().length * safetyMinRatio) {
  log('⚠️', `跳过修复：结果小于原文件 ${Math.round(safetyMinRatio * 100)}%`);
  return false;
}
```

这个阈值是可配置的，默认 0.5。实际使用中这个机制拦截了好几次 AI 的"暴力删除"。

### v2 的问题

v2 功能齐全了，但用了一段时间发现一个核心问题：

> **90% 的场景是"帮我看一遍 + 出测试 + 出报告"，每次要敲三遍命令太蠢了。**

```bash
# 典型使用场景——敲三个命令做一件事
npx ai-rp review --file src/views/Home.vue --full
npx ai-rp test --file src/views/Home.vue
npx ai-rp report  # 这个其实不存在，报告是 review 附带的
```

三个命令分开跑，中间结果还没法传递。这不是好的设计。

另外 `--dry-run` 也是过度设计——实际上用户要的不是"假装跑一遍"，而是"只审查不修改"，这本身就是默认行为。

---

## v3：统一流水线——Less is More

### 核心改变

v3 的核心思想是**一个命令搞定一切**：

```bash
# 默认模式：review + 测试 + 报告（不改代码）
npx ai-rp

# 修复模式：review + 修复 + 再审查 + 测试 + 报告
npx ai-rp --fix
```

| 操作 | v2 | v3 |
|------|----|----|
| 审查 + 测试 + 报告 | 敲 2-3 个命令 | `ai-rp` 一个命令 |
| 审查 + 修复 + 测试 | 敲 3 个命令 | `ai-rp --fix` |
| 只生成测试 | `ai-rp test` | `ai-rp test`（保留） |

`review` 和 `fix` 作为子命令保留为别名，向下兼容。但实际上 `ai-rp` 就等于 `ai-rp review`，`ai-rp --fix` 就等于 `ai-rp fix`。

### 统一流水线的执行流程

```
ai-rp（默认）                    ai-rp --fix
─────────────                    ───────────
① Review（评分+问题列表）        ① Review
       ↓                               ↓
② 测试用例生成                   ② AI 自动修复
       ↓                               ↓
③ HTML 报告                      ③ Re-Review → 还有问题？
       ↓                               ↓           ↓
④ exit code                      ④ 继续修    ⑤ 全部修好
                                       ↓           ↓
                                 （最多 N 轮） ⑥ 测试 + 报告
                                       ↓           ↓
                                 ⑦ 照样出报告  ⑧ auto commit
                                       ↓
                                 exit(1) 告诉 CI
```

关键设计：**即使 --fix 没修好，测试和报告也会生成**。报告是给人看的诊断结果，不是放行的理由。

### v3 的实际代码结构

```
bin/cli.mjs              # CLI 入口，命令路由
src/commands/
  pipeline.mjs           # 统一流水线（核心）
  review.mjs             # review prompt + 结果解析
  test.mjs               # 独立测试生成
  init.mjs               # 配置初始化
src/core/
  ai-client.mjs          # 多 Provider 统一调用
  config.mjs             # 配置加载与合并
  diff.mjs               # git diff / 文件读取
  env.mjs                # .env.local 加载
  report.mjs             # HTML 报告生成
  logger.mjs             # 日志 + i18n
src/i18n/
  zh.mjs / en.mjs        # 中英文消息
templates/
  ai-pipeline.json       # 默认配置模板
```

和 v2 的目录几乎一样，最大的变化是 `pipeline.mjs` 成为核心——它把 review、fix、test、report 串联成一个连贯的流水线。

### CLI 入口的路由逻辑

```javascript
#!/usr/bin/env node

const command = args[0];
const isFlag = !command || command.startsWith('-');

if (isFlag) {
  // ai-rp / ai-rp --fix / ai-rp --file src/a.vue
  // → 全部走 pipeline
  const { run } = await import('../src/commands/pipeline.mjs');
  await run(args);
} else if (command === 'review') {
  // ai-rp review → pipeline 的别名
  const { run } = await import('../src/commands/pipeline.mjs');
  await run(args.slice(1));
} else if (command === 'fix') {
  // ai-rp fix → pipeline --fix 的别名
  const subArgs = args.slice(1);
  if (!subArgs.includes('--fix')) subArgs.unshift('--fix');
  const { run } = await import('../src/commands/pipeline.mjs');
  await run(subArgs);
} else if (command === 'test') {
  // ai-rp test → 独立的测试生成
  const { run } = await import('../src/commands/test.mjs');
  await run(args.slice(1));
} else if (command === 'init') {
  // ai-rp init → 生成配置文件
  const { run } = await import('../src/commands/init.mjs');
  await run();
}
```

注意 `review` 和 `fix` 都指向 `pipeline.mjs`——它们只是 pipeline 的不同模式。

### Exit Code 的精心设计

这个工具的核心场景是 **Git Hook + CI 门禁**，所以 exit code 必须精确：

| 场景 | Exit Code | 含义 |
|------|-----------|------|
| Review 通过 | `0` | 放行 |
| 有 🔴 问题 | `1` | 阻断提交/合并 |
| `--fix` 修好了 | `0` | 放行 + auto commit |
| `--fix` 没修好 | `1` | 阻断，但报告照出 |

```javascript
// pipeline.mjs 末尾
if (!passed) process.exit(1);
// 如果走到这里（没 exit），默认 exit(0)
```

### 零依赖策略

整个项目 **0 个 required dependency**。

```json
{
  "dependencies": {},
  "peerDependencies": {
    "https-proxy-agent": ">=6"
  },
  "peerDependenciesMeta": {
    "https-proxy-agent": { "optional": true }
  }
}
```

为什么？

1. **Node.js 18+ 自带 `fetch`**——不需要 axios、node-fetch
2. **`child_process` 跑 git 命令**——不需要 simple-git
3. **`fs` 读写文件**——不需要 fs-extra
4. **参数解析用原生 `process.argv`**——不需要 Commander
5. **颜色输出用 ANSI 转义码**——不需要 chalk

唯一的 optional peer dependency 是 `https-proxy-agent`，只有在国内需要代理时才装。

零依赖的好处：

- `npx` 即跑，不需要 `npm install`
- 没有供应链安全风险
- 包体积极小
- 升级没有兼容性问题

---

## 关键设计决策复盘

### 决策 1：默认审查 diff 还是全文件？

**结论：默认审查 git diff，`--full` 切全文件。**

原因：

- diff 聚焦变更，Token 消耗少，审查精准
- 全文件适合新文件或遗留代码排查
- CI 场景基本都是 diff

```bash
# 默认：只审查 git diff 的变更
ai-rp

# 全文件模式
ai-rp --file src/views/Home.vue --full
```

### 决策 2：Review 结果用什么格式？

**结论：JSON + Markdown 双输出。**

```javascript
// parseReview 返回两种格式
{
  score: 72,
  red: 2,
  yellow: 3,
  green: 1,
  summary: '存在安全隐患和边界处理缺失',
  issues: [...],     // 结构化 JSON → 给机器消费（CI/JSON 模式）
  markdown: '...',   // Markdown → 给人看（终端输出/报告）
}
```

JSON 用于 CI 的 `--json` 模式（输出纯 JSON，方便其他工具解析），Markdown 用于终端和 HTML 报告。

### 决策 3：修复循环上限

**结论：默认最多 5 轮，可配置。**

```javascript
const effectiveMaxRounds = fixMode ? maxRounds : 1;

while (round < effectiveMaxRounds) {
  // review → fix → re-review → ...
  // 直到通过或达到上限
}
```

为什么不是"修到好为止"？因为 AI 修复有不确定性——有时候修一个问题引入另一个问题，无限循环。5 轮已经足够解决绝大多数问题，修不好的大概率是需要人工介入的复杂问题。

### 决策 4：配置文件设计

```json
{
  "review": {
    "threshold": 95,
    "maxRounds": 5,
    "customRules": [
      "禁止使用 any 类型",
      "API Key / Secret 不得硬编码",
      "所有 API 请求必须有错误处理"
    ]
  },
  "test": {
    "stack": "auto",
    "maxCases": 8
  },
  "report": {
    "outputDir": ".ai-reports",
    "open": true
  }
}
```

`customRules` 是最有用的配置——把团队的代码规范写进去，AI 每次审查都会强制检查。相当于给 AI 一份"团队编码规范"。

---

## 踩过的坑

### 坑 1：AI 输出格式不稳定

**表现**：同一个 prompt，10 次审查有 3 次 JSON 解析失败。

**解决**：三重保障。

1. Prompt 里明确要求 JSON 格式，给出完整 Schema
2. 用 `response_format: { type: 'json_object' }`（支持的厂商）
3. 解析时做多层容错（直接解析 → 去代码块 → 正则提取）

这就是[第 6 篇](/series/junior/06-prompt-engineering)讲的 `parseAIJson` 的实战版。

### 坑 2：大文件 diff 超出 Token 限制

**表现**：一次 commit 改了 20 个文件，diff 有几万行，AI 直接报 400 错误。

**解决**：自动截断 + 提示。

```javascript
const maxDiffLines = config.review.maxDiffLines || 3000;
const truncated = totalLines > maxDiffLines
  ? diff.split('\n').slice(0, maxDiffLines).join('\n') + '\n... (truncated)'
  : diff;
```

超过 3000 行的 diff 自动截断，在日志里提示用户。实际体验比想象的好——因为 AI 更倾向于"精读少量代码"而不是"泛读大量代码"。

### 坑 3：修复引入新问题

**表现**：AI 修了一个 XSS 问题，但把相关的事件处理逻辑也改了。

**解决**：

1. 安全阀机制（修复后不能低于原文件 50%）
2. 修复 prompt 明确约束："只修复 Review 指出的问题，不要做额外改动，不要改变业务逻辑"
3. Fix 后自动 re-review，验证修复效果

### 坑 4：不同 AI 厂商的响应格式差异

**表现**：同一个 prompt，DeepSeek 输出正常，Claude 的 JSON 多了一层包裹。

**解决**：在 `ai-client.mjs` 里统一抽象，对不同厂商的响应做标准化处理。

```javascript
// OpenAI 兼容格式
response.choices[0].message.content

// Claude 格式
response.content[0].text
```

---

## 版本演进总结

| 维度 | v1 | v2 | v3 |
|------|----|----|-----|
| 代码量 | ~200 行 | ~1200 行 | ~1000 行 |
| 命令 | 无（脚本） | review/fix/test 分散 | 统一 pipeline |
| AI 厂商 | 1 家 | 6 家 | 6 家 |
| 输出 | 终端文本 | 终端 + JSON | 终端 + JSON + HTML |
| CI 集成 | 不支持 | 基本支持 | 完整支持（exit code + --json） |
| 配置 | 硬编码 | .ai-pipeline.json | .ai-pipeline.json + 更多选项 |
| 依赖 | 0 | 0 | 0 |

v1 → v2：从"能用"到"功能完善"。
v2 → v3：从"功能多"到"用起来爽"。

**代码量反而减少了**——v3 删掉了 `--dry-run`、简化了命令路由，减少了 200 行冗余代码。Less is more。

---

## 开源策略简述

这个工具从一开始就打算开源。几个关键点：

1. **README 即产品**——README 写得像产品文档而不是技术文档，30 秒上手、功能一图流、命令速查表
2. **零配置上手**——`npx ai-rp` 就能跑，不需要看文档
3. **双语支持**——README 中英文，工具本身 i18n（`--lang en`）
4. **MIT License**——最大限度降低使用门槛

npm 发包的具体流程下一篇详细讲。

---

## 你可以从中学到什么

如果你也想做一个 AI CLI 工具，从这个项目可以提炼出几个通用的设计原则：

### 原则 1：先做最小可用版本

v1 只有 200 行，但验证了核心假设。不要一开始就设计完美架构——先证明这事儿值得做。

### 原则 2：统一入口 > 分散命令

用户不想记 5 个命令。一个命令解决 90% 的场景，用 flag 区分模式。

### 原则 3：零依赖是竞争力

`npx` 即跑是杀手级体验。每多一个依赖，就多一份安装时间和供应链风险。Node.js 18+ 的内置 API 已经足够强大。

### 原则 4：Exit Code 是 CLI 的 API

CLI 工具的调用者（Git Hook、CI）不看你的终端输出，只看 exit code。`0` 是通过，非 `0` 是失败，这是铁律。

### 原则 5：AI 的输出永远不可信

结构化输出要多层容错，自动修复要有安全阀，Token 消耗要有上限。对 AI 的态度应该是"有用但不可靠"。

---

## 总结

1. **v1 验证想法**——200 行脚本证明 AI 审查代码是可行的。
2. **v2 补齐功能**——多模型、配置、报告，但过度设计导致使用体验差。
3. **v3 回归简单**——统一流水线，一个命令搞定 90% 的场景，代码量反而减少。
4. **零依赖是核心优势**——Node.js 18+ 自带 fetch，不需要外部依赖。
5. **Exit Code 精确设计**——CLI 工具的 CI 友好性取决于 exit code。
6. **AI 输出不可信**——容错解析 + 安全阀 + 截断是必备机制。

**下一篇**，我们讲 npm 发包全流程——怎么把你的 AI CLI 工具发布到 npm，让全世界的开发者一行 `npx` 就能用上。

---

> **下一篇预告**：[10 | npm 发包全流程：让你的 AI 工具被全世界 npx 到](/series/junior/10-npm-publish)

---

**讨论话题**：你有没有做过 AI 工具？从 v1 到 v2 到 v3 的过程中，哪些设计决策是你最纠结的？评论区聊聊你的经验。
