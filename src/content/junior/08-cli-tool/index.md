---
title: "从脚本到 CLI 工具：用 Node.js 打造你的第一个 AI 命令行工具"
description: "CLI 基础架构、参数解析、终端 UX、实战 AI 翻译 i18n 工具"
order: 8
cover: "./cover.png"
publishDate: "2025-07-18"
tags: ["CLI", "Node.js", "i18n", "翻译", "实战"]
---

# 从脚本到 CLI 工具：用 Node.js 打造你的第一个 AI 命令行工具

> 本文是【前端转 AI 全栈实战】系列第 08 篇。
> 上一篇：[.env 管理、代理配置、错误处理——AI 应用的工程化基础](/series/junior/07-engineering-basics) | 下一篇：[我是怎么做 ai-review-pipeline 的](/series/junior/09-ai-review-pipeline)

---

## 这篇文章你会得到什么

前面七篇你学会了 AI API 调用的全部基础。但问题来了——**你做的东西怎么给别人用？**

写一个 `.js` 文件然后 `node xxx.js` 执行？太原始了。

更好的方式是把它封装成一个 **CLI（命令行）工具**——输入一条命令，自动完成工作。比如：

```bash
# 翻译整个 i18n JSON 文件
ai-translate ./locales/zh.json --to en,ja,ko

# AI 帮你 Review 代码
ai-review ./src/components/UserForm.vue
```

这是前端切入 AI 工具开发的最佳形态——不需要 UI，不需要后端服务，一个 npm 包就搞定。而且前端天然熟悉 Node.js，做 CLI 没有任何额外学习成本。

今天的目标：**从零搭建一个 AI CLI 工具，并实战做一个翻译 i18n JSON 文件的工具**。

---

## 为什么 CLI 是最佳起点

| 对比 | Web 应用 | CLI 工具 |
|------|---------|---------|
| 开发成本 | 前端+后端+部署 | 一个 JS 文件 |
| 使用门槛 | 打开浏览器 | 命令行一条命令 |
| 分发方式 | 部署到服务器 | `npm install -g` |
| 适合场景 | 面向用户 | 面向开发者 |
| 迭代速度 | 改代码→构建→部署 | 改代码→直接用 |

对于 AI 工具来说，CLI 有一个独特优势——**它就跑在你的电脑上，可以直接读写本地文件**。翻译 JSON 文件、Review 本地代码、处理 Git Diff……这些操作用 CLI 做比 Web 应用方便得多。

---

## CLI 工具基础架构

一个 CLI 工具只需要三样东西：

### 1. package.json 的 bin 字段

```json
{
  "name": "ai-translate-cli",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "ai-translate": "./src/cli.js"
  },
  "dependencies": {
    "openai": "^4.0.0",
    "dotenv": "^16.0.0"
  }
}
```

`bin` 字段告诉 npm：安装这个包后，注册一个叫 `ai-translate` 的全局命令，指向 `./src/cli.js`。

### 2. 入口文件的 Shebang

```javascript
#!/usr/bin/env node
// src/cli.js

// 这一行叫 Shebang，告诉系统用 Node.js 执行这个文件
console.log('Hello from AI Translate CLI!');
```

### 3. 本地开发调试

```bash
# 在项目根目录执行，注册为全局命令
npm link

# 现在可以直接用命令名调用
ai-translate --help
```

就这三步，你就有了一个可执行的 CLI。

---

## 参数解析：不需要框架

很多教程上来就教你用 Commander、Yargs。但对于简单的 CLI，原生 `process.argv` 完全够用。

```javascript
#!/usr/bin/env node

// process.argv: ['node', 'cli.js', '--file', 'zh.json', '--to', 'en,ja']
const args = process.argv.slice(2);

function getArg(name) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return null;
  return args[index + 1] || null;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

// 解析参数
const file = getArg('file') || args[0]; // 支持 --file 或位置参数
const targetLangs = getArg('to')?.split(',') || ['en'];
const verbose = hasFlag('verbose');
const help = hasFlag('help') || hasFlag('h');

if (help || !file) {
  console.log(`
  AI Translate CLI - AI 驱动的 i18n 翻译工具

  用法:
    ai-translate <file> [options]

  参数:
    <file>              要翻译的 JSON 文件路径

  选项:
    --to <langs>        目标语言，逗号分隔（默认: en）
    --verbose           显示详细日志
    --help, -h          显示帮助

  示例:
    ai-translate ./locales/zh.json --to en,ja,ko
    ai-translate ./zh.json --to en --verbose
  `);
  process.exit(0);
}
```

当 CLI 复杂到有多个子命令（比如 `ai-tool translate`、`ai-tool review`）时，再上 Commander 也不迟。

---

## 让终端输出好看：颜色和进度

CLI 工具的用户体验就在终端输出上。

### 彩色输出（不用装包）

Node.js 支持 ANSI 转义码，不用安装 chalk 也能输出颜色：

```javascript
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

function log(msg) { console.log(msg); }
function success(msg) { log(`${colors.green}✓${colors.reset} ${msg}`); }
function warn(msg) { log(`${colors.yellow}⚠${colors.reset} ${msg}`); }
function error(msg) { log(`${colors.red}✗${colors.reset} ${msg}`); }
function info(msg) { log(`${colors.cyan}ℹ${colors.reset} ${msg}`); }
function dim(msg) { return `${colors.gray}${msg}${colors.reset}`; }
```

### 进度提示

翻译多个语言时，给用户一个进度感知：

```javascript
function showProgress(current, total, label) {
  const percent = Math.round((current / total) * 100);
  const filled = Math.round(percent / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  process.stdout.write(`\r  ${bar} ${percent}% ${label}`);
  if (current === total) process.stdout.write('\n');
}

// 使用
showProgress(1, 3, '翻译中: en');  // ████████░░░░░░░░░░░░ 33% 翻译中: en
showProgress(2, 3, '翻译中: ja');  // ████████████████░░░░ 67% 翻译中: ja
showProgress(3, 3, '完成');        // ████████████████████ 100% 完成
```

### 交互式确认

翻译前让用户确认，避免误操作：

```javascript
import readline from 'readline';

function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`${question} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

// 使用
const ok = await confirm('将翻译 zh.json 为 en, ja, ko 三个语言文件，继续？');
if (!ok) {
  log('已取消');
  process.exit(0);
}
```

---

## 实战：AI 翻译 CLI

把上面的模块组装起来，做一个完整的 AI i18n 翻译工具。

### 核心翻译逻辑

```javascript
// src/translator.js
import OpenAI from 'openai';
import 'dotenv/config';

const client = new OpenAI({
  baseURL: process.env.AI_BASE_URL || 'https://api.deepseek.com',
  apiKey: process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY,
});

const TRANSLATE_PROMPT = `你是一个专业的 i18n 翻译引擎。

## 任务
将用户提供的 JSON 对象中所有值翻译为目标语言。

## 规则
1. 只翻译 JSON 的值（value），不要修改键（key）
2. 保持 JSON 结构完全不变
3. 保留占位符不翻译，如 {name}、{count}、%s、%d
4. 保留 HTML 标签不翻译
5. 翻译要自然地道，不是机翻味
6. 只输出 JSON，不要任何解释

## 目标语言
{targetLang}`;

export async function translateJson(jsonObj, targetLang) {
  const response = await client.chat.completions.create({
    model: process.env.AI_MODEL || 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: TRANSLATE_PROMPT.replace('{targetLang}', targetLang),
      },
      {
        role: 'user',
        content: JSON.stringify(jsonObj, null, 2),
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const text = response.choices[0].message.content;

  try {
    return JSON.parse(text);
  } catch {
    // 容错：提取 JSON
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('AI 返回了无法解析的内容');
  }
}
```

### 完整 CLI 入口

```javascript
#!/usr/bin/env node
// src/cli.js
import fs from 'fs';
import path from 'path';
import { translateJson } from './translator.js';

const colors = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m', bold: '\x1b[1m',
};

function success(msg) { console.log(`${colors.green}✓${colors.reset} ${msg}`); }
function error(msg) { console.log(`${colors.red}✗${colors.reset} ${msg}`); }
function info(msg) { console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`); }

// 语言代码 → 语言名
const LANG_NAMES = {
  en: 'English', ja: '日本語', ko: '한국어',
  'zh-TW': '繁體中文', fr: 'Français', de: 'Deutsch',
  es: 'Español', pt: 'Português', ru: 'Русский',
  ar: 'العربية', th: 'ภาษาไทย', vi: 'Tiếng Việt',
};

// 解析参数
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const toLangs = (args[args.indexOf('--to') + 1] || 'en').split(',');
const help = args.includes('--help') || args.includes('-h');

if (help || !file) {
  console.log(`
  ${colors.bold}AI Translate${colors.reset} - AI 驱动的 i18n JSON 翻译工具

  ${colors.bold}用法:${colors.reset}
    ai-translate <file> --to <langs>

  ${colors.bold}示例:${colors.reset}
    ai-translate ./zh.json --to en,ja,ko
    ai-translate ./locales/zh-CN.json --to en,zh-TW,ja

  ${colors.bold}支持的语言:${colors.reset}
    ${Object.entries(LANG_NAMES).map(([k, v]) => `${k} (${v})`).join(', ')}
  `);
  process.exit(0);
}

// 主流程
async function main() {
  // 1. 读取源文件
  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    error(`文件不存在: ${filePath}`);
    process.exit(1);
  }

  const sourceJson = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const keyCount = Object.keys(flattenJson(sourceJson)).length;
  const dir = path.dirname(filePath);

  info(`源文件: ${filePath}`);
  info(`共 ${keyCount} 个翻译键`);
  info(`目标语言: ${toLangs.join(', ')}`);
  console.log();

  // 2. 逐语言翻译
  const startTime = Date.now();
  const results = [];

  for (let i = 0; i < toLangs.length; i++) {
    const lang = toLangs[i];
    const langName = LANG_NAMES[lang] || lang;
    process.stdout.write(`  翻译中: ${lang} (${langName})...`);

    try {
      const translated = await translateJson(sourceJson, `${langName} (${lang})`);

      // 写入文件
      const outputFile = path.join(dir, `${lang}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(translated, null, 2) + '\n', 'utf-8');

      process.stdout.write(`\r`);
      success(`${lang} (${langName}) → ${path.relative('.', outputFile)}`);
      results.push({ lang, success: true });
    } catch (err) {
      process.stdout.write(`\r`);
      error(`${lang} 翻译失败: ${err.message}`);
      results.push({ lang, success: false, error: err.message });
    }
  }

  // 3. 汇总
  console.log();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  success(`完成！${successCount} 个语言翻译成功${failCount > 0 ? `，${failCount} 个失败` : ''}，耗时 ${elapsed}s`);
}

function flattenJson(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenJson(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

main().catch(err => {
  error(err.message);
  process.exit(1);
});
```

### 运行效果

```bash
$ ai-translate ./locales/zh.json --to en,ja,ko

ℹ 源文件: /project/locales/zh.json
ℹ 共 42 个翻译键
ℹ 目标语言: en, ja, ko

✓ en (English) → locales/en.json
✓ ja (日本語) → locales/ja.json
✓ ko (한국어) → locales/ko.json

✓ 完成！3 个语言翻译成功，耗时 8.3s
```

42 个翻译键、3 种语言，8 秒搞定。手动翻译这些内容至少要半天。

### 大文件拆分翻译

如果 JSON 文件很大（几百个 key），一次性发给 AI 可能超出 Token 限制。解决方案是分批翻译：

```javascript
function chunkObject(obj, chunkSize = 50) {
  const entries = Object.entries(obj);
  const chunks = [];

  for (let i = 0; i < entries.length; i += chunkSize) {
    chunks.push(Object.fromEntries(entries.slice(i, i + chunkSize)));
  }

  return chunks;
}

async function translateLargeJson(jsonObj, targetLang) {
  const chunks = chunkObject(jsonObj, 50);
  let result = {};

  for (const chunk of chunks) {
    const translated = await translateJson(chunk, targetLang);
    result = { ...result, ...translated };
  }

  return result;
}
```

---

## 发布为 npm 包（预告）

做好的 CLI 工具可以发布到 npm，让其他人一行命令安装使用：

```bash
npm install -g ai-translate-cli
```

具体的 npm 发包流程会在第 10 篇详细讲。

---

## 总结

1. **CLI 是前端做 AI 工具的最佳起点**——不需要 UI，不需要后端，一个 npm 包搞定。
2. **三步搭建 CLI**：`bin` 字段 + Shebang + `npm link`。
3. **参数解析不用框架**，`process.argv` 就够用，简单场景不需要 Commander。
4. **终端 UX 很重要**——彩色输出、进度条、交互确认，让工具看起来专业。
5. **实战做了一个 AI 翻译 CLI**——读取 i18n JSON → AI 翻译 → 写入目标文件，支持多语言和大文件拆分。

**下一篇**，我会分享自己的真实开源项目 ai-review-pipeline——从 v1 到 v3 的架构演进，包括踩了哪些坑、做了哪些设计决策。

---

> **下一篇预告**：[09 | 我是怎么做 ai-review-pipeline 的（从 v1 到 v3 的架构演进）](/series/junior/09-ai-review-pipeline)

---

**讨论话题**：你用 Node.js 做过 CLI 工具吗？你觉得 AI + CLI 还能做哪些有用的工具？评论区聊聊你的想法。
