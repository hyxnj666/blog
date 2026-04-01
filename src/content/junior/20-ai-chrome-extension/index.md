---
title: "AI + Chrome 扩展：做一个 AI 驱动的浏览器插件"
description: "用 Chrome Extension V3 开发 AI 网页摘要和划词翻译扩展"
order: 20
cover: "./cover.png"
publishDate: "2025-10-10"
tags: ["Chrome扩展", "AI应用", "浏览器插件", "JavaScript"]
---

# AI + Chrome 扩展：做一个 AI 驱动的浏览器插件

> 本文是【前端转 AI 全栈实战】系列第 20 篇。
> 上一篇：[MCP 进阶：做一个有实用价值的 MCP Server 并发布](/series/junior/19-mcp-advanced) | 下一篇：[AI + VS Code 插件：给你的编辑器加上 AI 超能力](/series/junior/21-ai-vscode-plugin)

---

## 这篇文章你会得到什么

前端做 Chrome 扩展有**天然优势**——Chrome 扩展就是 HTML + CSS + JS。加上 AI 能力之后，你能做出非常有意思的工具：

- 划词翻译 + AI 润色
- 网页一键摘要
- 智能填表
- 侧边栏 AI 助手

这一篇我们从 Chrome Extension V3 基础开始，实战做一个"AI 网页摘要"扩展。

---

## Chrome Extension V3 基础

### 核心概念

```
manifest.json          → 扩展配置（入口、权限、图标）
service_worker.js      → 后台脚本（事件驱动，无 DOM）
content_script.js      → 注入页面的脚本（可操作 DOM）
popup.html / popup.js  → 点击图标弹出的小窗口
sidepanel.html         → 侧边栏面板（Chrome 114+）
```

### 最小项目结构

```
ai-summarizer/
├── manifest.json
├── service-worker.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── sidepanel/
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js
├── content/
│   └── content.js
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "AI 网页摘要",
  "version": "1.0.0",
  "description": "一键用 AI 总结当前网页内容",
  "permissions": [
    "activeTab",
    "storage",
    "sidePanel",
    "contextMenus"
  ],
  "host_permissions": [
    "https://api.deepseek.com/*"
  ],
  "background": {
    "service_worker": "service-worker.js"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/content.js"]
    }
  ],
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

### 前端技能直接迁移

| Chrome 扩展 | 对应前端技能 |
|-------------|-------------|
| popup.html | 写一个小页面 |
| content_script | DOM 操作 |
| service_worker | 事件监听 |
| chrome.storage | 类似 localStorage |
| Message Passing | 类似 postMessage |

---

## 安全第一：API Key 不能放 content script

**content script 注入到用户访问的网页里——意味着网页里的 JS 可以访问它。**

```javascript
// ❌ 永远不要这样做！
// content/content.js
const API_KEY = "sk-xxxx"; // 任何网页都能看到这个 key
```

正确做法：**API Key 存在 service worker 里，content script 通过 Message Passing 请求。**

```javascript
// ✅ service-worker.js 持有 API Key
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CALL_AI") {
    callAI(msg.content).then(sendResponse);
    return true; // 保持 sendResponse 可用
  }
});

// ✅ content script 只发请求，不碰 Key
chrome.runtime.sendMessage(
  { type: "CALL_AI", content: "..." },
  (response) => { /* 处理结果 */ }
);
```

更好的方案：让用户在 popup 里输入自己的 API Key，存到 `chrome.storage.local`。

```javascript
// popup/popup.js —— 保存 Key
document.getElementById("save-btn").addEventListener("click", () => {
  const key = document.getElementById("api-key-input").value.trim();
  chrome.storage.local.set({ apiKey: key });
});

// service-worker.js —— 读取 Key
async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) throw new Error("请先在扩展设置中配置 API Key");
  return apiKey;
}
```

---

## 实战：AI 网页摘要扩展

### 获取页面内容（content script）

```javascript
// content/content.js
function getPageContent() {
  const article = document.querySelector("article")
    || document.querySelector("[role='main']")
    || document.querySelector(".post-content")
    || document.body;

  // 去除脚本、样式、导航等无关内容
  const clone = article.cloneNode(true);
  clone.querySelectorAll("script, style, nav, header, footer, iframe, .ads")
    .forEach(el => el.remove());

  const text = clone.innerText
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000); // 限制长度，避免 token 过多

  return {
    title: document.title,
    url: window.location.href,
    content: text,
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_PAGE_CONTENT") {
    sendResponse(getPageContent());
  }
});
```

### AI 调用层（service worker）

```javascript
// service-worker.js
async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  return apiKey;
}

async function callAI(content, systemPrompt) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { error: "请先配置 API Key" };
  }

  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });

  const data = await resp.json();

  if (data.error) {
    return { error: data.error.message };
  }

  return { result: data.choices[0].message.content };
}

// 监听来自 popup / sidepanel 的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SUMMARIZE") {
    const systemPrompt = `你是一个网页内容摘要助手。请用中文生成简洁的摘要。

## 要求
- 摘要不超过 200 字
- 提取 3-5 个核心要点，用有序列表
- 最后一行给出内容质量评分（1-10分）
- 格式清晰，使用 Markdown`;

    const userContent = `标题：${msg.title}\n\n内容：${msg.content}`;

    callAI(userContent, systemPrompt).then(sendResponse);
    return true;
  }

  if (msg.type === "TRANSLATE_SELECTION") {
    const systemPrompt = "将以下文本翻译成中文，保持原文的语气和风格。只输出翻译结果。";
    callAI(msg.text, systemPrompt).then(sendResponse);
    return true;
  }
});

// 右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ai-translate",
    title: "AI 翻译选中文本",
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "ai-summarize",
    title: "AI 总结当前页面",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "ai-summarize") {
    // 打开侧边栏
    chrome.sidePanel.open({ tabId: tab.id });
  }
});
```

### 侧边栏 UI（Side Panel）

```html
<!-- sidepanel/sidepanel.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="sidepanel.css">
</head>
<body>
  <div class="container">
    <h2>AI 网页摘要</h2>

    <div id="status" class="status"></div>

    <button id="summarize-btn" class="btn-primary">
      总结当前页面
    </button>

    <div id="result" class="result hidden"></div>

    <div class="settings">
      <h3>设置</h3>
      <input
        id="api-key-input"
        type="password"
        placeholder="输入你的 DeepSeek API Key"
      />
      <button id="save-key-btn" class="btn-secondary">保存</button>
    </div>
  </div>

  <script src="sidepanel.js"></script>
</body>
</html>
```

```css
/* sidepanel/sidepanel.css */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
  min-height: 100vh;
}

.container {
  padding: 16px;
}

h2 {
  color: #00d4aa;
  margin-bottom: 16px;
  font-size: 18px;
}

.btn-primary {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #00d4aa, #00a8cc);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-primary:hover { opacity: 0.9; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  padding: 8px 16px;
  background: #2a2a4a;
  border: 1px solid #3a3a5a;
  border-radius: 6px;
  color: #e0e0e0;
  cursor: pointer;
}

.result {
  margin-top: 16px;
  padding: 16px;
  background: #16213e;
  border-radius: 8px;
  border: 1px solid #2a2a4a;
  line-height: 1.6;
  white-space: pre-wrap;
}

.hidden { display: none; }

.status {
  padding: 8px 0;
  font-size: 13px;
  color: #888;
}

.settings {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #2a2a4a;
}

.settings h3 {
  font-size: 14px;
  margin-bottom: 8px;
  color: #aaa;
}

.settings input {
  width: 100%;
  padding: 8px 12px;
  background: #16213e;
  border: 1px solid #3a3a5a;
  border-radius: 6px;
  color: #e0e0e0;
  margin-bottom: 8px;
  font-size: 13px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.loading { animation: pulse 1.5s infinite; }
```

```javascript
// sidepanel/sidepanel.js
const summarizeBtn = document.getElementById("summarize-btn");
const resultDiv = document.getElementById("result");
const statusDiv = document.getElementById("status");
const apiKeyInput = document.getElementById("api-key-input");
const saveKeyBtn = document.getElementById("save-key-btn");

// 加载已保存的 Key
chrome.storage.local.get("apiKey", ({ apiKey }) => {
  if (apiKey) {
    apiKeyInput.value = apiKey;
    statusDiv.textContent = "✅ API Key 已配置";
  } else {
    statusDiv.textContent = "⚠️ 请先配置 API Key";
  }
});

saveKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  chrome.storage.local.set({ apiKey: key }, () => {
    statusDiv.textContent = "✅ API Key 已保存";
  });
});

summarizeBtn.addEventListener("click", async () => {
  summarizeBtn.disabled = true;
  summarizeBtn.textContent = "正在分析...";
  resultDiv.classList.add("hidden");
  statusDiv.textContent = "📖 正在读取页面内容...";

  try {
    // 1. 获取当前页面内容
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const pageContent = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_PAGE_CONTENT",
    });

    statusDiv.textContent = "🤖 AI 正在生成摘要...";
    statusDiv.classList.add("loading");

    // 2. 调用 AI 生成摘要
    const response = await chrome.runtime.sendMessage({
      type: "SUMMARIZE",
      title: pageContent.title,
      content: pageContent.content,
    });

    // 3. 显示结果
    if (response.error) {
      resultDiv.textContent = `❌ ${response.error}`;
    } else {
      resultDiv.textContent = response.result;
    }

    resultDiv.classList.remove("hidden");
  } catch (err) {
    resultDiv.textContent = `❌ 错误：${err.message}`;
    resultDiv.classList.remove("hidden");
  } finally {
    summarizeBtn.disabled = false;
    summarizeBtn.textContent = "总结当前页面";
    statusDiv.textContent = "";
    statusDiv.classList.remove("loading");
  }
});
```

---

## 进阶功能：划词翻译

在 content script 里监听选中文本，弹出翻译气泡。

```javascript
// content/content.js（追加）
let bubble = null;

document.addEventListener("mouseup", (e) => {
  const selection = window.getSelection().toString().trim();
  if (selection.length < 2 || selection.length > 500) {
    removeBubble();
    return;
  }

  showBubble(e.pageX, e.pageY, selection);
});

function showBubble(x, y, text) {
  removeBubble();

  bubble = document.createElement("div");
  bubble.id = "ai-translate-bubble";
  bubble.innerHTML = `
    <div style="
      position: absolute;
      left: ${x}px;
      top: ${y + 10}px;
      background: #1a1a2e;
      color: #e0e0e0;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      max-width: 400px;
      font-size: 14px;
      line-height: 1.6;
      z-index: 999999;
      border: 1px solid #00d4aa40;
    ">
      <div style="color: #00d4aa; font-size: 12px; margin-bottom: 8px;">AI 翻译</div>
      <div id="ai-translate-result">翻译中...</div>
    </div>
  `;

  document.body.appendChild(bubble);

  chrome.runtime.sendMessage(
    { type: "TRANSLATE_SELECTION", text },
    (response) => {
      const resultEl = document.getElementById("ai-translate-result");
      if (resultEl) {
        resultEl.textContent = response?.result || response?.error || "翻译失败";
      }
    }
  );
}

function removeBubble() {
  if (bubble) {
    bubble.remove();
    bubble = null;
  }
}

document.addEventListener("mousedown", (e) => {
  if (bubble && !bubble.contains(e.target)) {
    removeBubble();
  }
});
```

---

## 本地调试

1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择你的项目目录
5. 修改代码后点"刷新"按钮

**调试技巧**：
- Service Worker 调试：扩展页面点"Service Worker"链接
- Content Script 调试：在网页的 DevTools 中找到扩展的 content script
- Popup 调试：右键扩展图标 → "审查弹出内容"

---

## 发布到 Chrome Web Store

1. 注册开发者账号（一次性 $5）
2. 准备素材：128x128 图标、1280x800 截图、详细描述
3. 打包成 .zip：项目目录压缩
4. 上传到 Chrome Web Store Developer Dashboard
5. 填写信息、提交审核（通常 1-3 天）

**注意**：审核会检查权限合理性。只申请真正需要的权限——不要 `<all_urls>` 如果你只需要访问特定网站。

---

## 总结

1. **Chrome 扩展 = HTML/CSS/JS**——前端做这个零学习成本。
2. **安全第一**——API Key 绝对不能放 content script，只放 service worker 或 `chrome.storage`。
3. **三层架构**：content script（操作页面）→ message passing → service worker（调 AI）→ 返回结果。
4. **Side Panel 是最佳 AI UI**——常驻侧边栏，不遮挡网页内容。
5. **实战做了**：网页摘要 + 划词翻译，两个最实用的 AI 场景。

**下一篇**，做另一个前端最熟悉的平台——VS Code 插件 + AI。

---

> **下一篇预告**：[21 | AI + VS Code 插件：给你的编辑器加上 AI 超能力](/series/junior/21-ai-vscode-plugin)

---

**讨论话题**：你用过哪些 AI 驱动的 Chrome 扩展？最想做一个什么样的 AI 插件？评论区聊聊。
