---
title: "Dify / Coze 低代码 AI 平台：不写代码也能搭 AI 应用"
description: "对比 Dify、Coze、FastGPT，10 分钟搭建客服机器人实战"
order: 26
cover: "./cover.png"
publishDate: "2025-11-21"
tags: ["Dify", "Coze", "低代码", "AI平台", "RAG"]
---

# Dify / Coze 低代码 AI 平台：不写代码也能搭 AI 应用

> 本文是【前端转 AI 全栈实战】系列第 26 篇。
> 上一篇：[AI 应用部署实战：Docker + CI/CD + 监控](/series/junior/25-deployment) | 下一篇：[AI 产品思维：前端转 AI 的真正护城河](/series/junior/27-ai-product-thinking)

---

## 这篇文章你会得到什么

前 25 篇你从零写了 AI 应用的每一行代码。但有时候你不需要这么重——

- 老板说"下周要个客服机器人"
- 产品说"做个内部知识库问答"
- 你自己想快速验证一个 AI 产品 idea

写代码要一周，用平台**10 分钟**搞定。

Dify、Coze、FastGPT——这些 AI 低代码平台让你拖拖拽拽就能搭 AI 应用。但什么时候用平台、什么时候写代码？这一篇帮你想清楚。

---

## 主流平台对比

| 平台 | 开源 | 特点 | 适合 |
|------|------|------|------|
| **Dify** | ✅ 开源 | 工作流编排强、RAG 内置、可私有部署 | 企业内部 AI 应用 |
| **Coze（扣子）** | ❌ 闭源 | 字节系、集成飞书/抖音、插件生态 | C 端 Bot、飞书集成 |
| **FastGPT** | ✅ 开源 | 纯知识库问答、简洁轻量 | 纯 RAG 场景 |

### Dify 优势

- **开源可私有部署**——数据不出公司
- **工作流编排**——可视化拖拽 AI Pipeline
- **内置 RAG**——上传文档自动切片、Embedding、检索
- **API 导出**——搭好的应用一键变成 REST API
- **支持多模型**——OpenAI、Claude、DeepSeek、本地模型全支持

---

## 实战：10 分钟搭一个客服机器人

### Step 1：部署 Dify

```bash
git clone https://github.com/langgenius/dify.git
cd dify/docker
docker compose up -d
```

打开 `http://localhost/install`，设置管理员账号。

### Step 2：创建应用

1. 点击"创建应用" → 选择"聊天助手"
2. 设置模型（DeepSeek / GPT-4o-mini）
3. 写 System Prompt：

```
你是 XXX 公司的客服助手。请基于知识库中的信息回答用户的问题。

## 规则
- 只基于知识库回答，不要编造
- 回答简洁，不超过 200 字
- 如果不确定，引导用户联系人工客服：400-xxx-xxxx
- 用友好的语气
```

### Step 3：上传知识库

1. 左侧菜单 → "知识库" → "创建知识库"
2. 上传文档（支持 PDF、Markdown、Word、网页链接）
3. Dify 自动完成：文档切片 → Embedding → 存入向量库
4. 回到应用，关联这个知识库

### Step 4：获取 API

应用发布后，Dify 提供标准的 REST API：

```bash
curl -X POST 'http://localhost/v1/chat-messages' \
  -H 'Authorization: Bearer app-xxxxx' \
  -H 'Content-Type: application/json' \
  -d '{
    "inputs": {},
    "query": "你们的退货政策是什么？",
    "response_mode": "streaming",
    "user": "user-123"
  }'
```

### Step 5：前端嵌入

```html
<!-- 方式一：iframe 嵌入 Dify 自带聊天 UI -->
<iframe
  src="http://localhost/chatbot/xxx"
  style="width: 400px; height: 600px; border: none;"
></iframe>
```

```javascript
// 方式二：调用 API 自己做 UI
async function askDify(question) {
  const resp = await fetch("http://localhost/v1/chat-messages", {
    method: "POST",
    headers: {
      Authorization: "Bearer app-xxxxx",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: question,
      response_mode: "blocking",
      user: "user-123",
    }),
  });

  const data = await resp.json();
  return data.answer;
}
```

---

## 工作流编排：AI Pipeline

Dify 的工作流可以把多个 AI 步骤串联起来。

### 示例：智能客服工作流

```
用户输入
   ↓
① 意图识别（AI）→ 判断是退货/咨询/投诉
   ↓
② 分支
   ├─ 退货 → 知识库检索退货政策 → AI 生成回答
   ├─ 咨询 → 知识库检索产品信息 → AI 生成回答
   └─ 投诉 → AI 生成安抚话术 + 转人工通知
   ↓
③ 输出回答
```

在 Dify 的可视化编辑器里，这个流程拖拽 5 分钟就能搭好。

### 示例：内容审核工作流

```
用户提交内容
   ↓
① AI 审核（是否违规）
   ↓
② 条件判断
   ├─ 通过 → 直接发布
   ├─ 可疑 → 人工审核队列
   └─ 违规 → 拒绝 + 告知原因
```

---

## Coze 的差异化场景

Coze（扣子）适合做 **C 端 Bot**，特别是和飞书/抖音生态集成。

### 特色能力

- **飞书 Bot**——一键发布到飞书群，员工直接用
- **抖音评论 Bot**——自动回复抖音评论（电商场景）
- **插件市场**——现成的天气、搜索、计算等插件
- **定时任务**——每天早上推送行业新闻摘要

### 适合的场景

```
产品经理："帮我做个飞书里的日报助手"
→ Coze：创建 Bot → 设置 Prompt → 加日报模板插件 → 发布到飞书
→ 30 分钟搞定
```

---

## 什么时候用平台，什么时候写代码

### 用平台

- 快速验证 idea（MVP）
- 内部工具（不追求极致体验）
- 纯知识库问答
- 标准的聊天 Bot
- 非技术人员也要能维护

### 写代码

- 需要自定义 UI 和交互
- 性能/延迟有严格要求
- 需要和现有系统深度集成
- 复杂的业务逻辑
- 数据安全要求高（某些平台数据经过第三方）

### 混合方案（推荐）

**后端用平台，前端自己写。**

```
Dify 提供 AI 能力（RAG + 对话 + 工作流）
         ↓ REST API
你的前端（Vue / React，自定义 UI）
```

这样你享受了平台的 RAG/工作流能力，又保持了前端的灵活性。

---

## 平台的天花板

### 局限性

| 问题 | 说明 |
|------|------|
| **自定义受限** | 平台提供的组件有限，特殊需求做不了 |
| **性能瓶颈** | 多了一层平台转发，延迟 +100-500ms |
| **厂商锁定** | 迁移成本高，换平台要重搭 |
| **成本递增** | 免费额度用完后，企业版价格不低 |
| **调试困难** | 工作流出了 bug，黑盒难排查 |

### 什么时候该"毕业"

当你发现：
1. 平台的功能满足不了需求
2. 需要频繁绕过平台的限制
3. 用户量增长后成本失控
4. 需要更深度的自定义和集成

就该用前 25 篇学的技能，自己搭建了。

---

## 总结

1. **Dify 适合企业**——开源、可私有部署、工作流编排、内置 RAG。
2. **Coze 适合 C 端**——飞书/抖音集成、插件生态、快速发布。
3. **10 分钟搭客服机器人**——上传文档 → 设置 Prompt → 获取 API → 前端嵌入。
4. **混合方案最佳**——平台做 AI 后端，自己做前端 UI。
5. **知道天花板**——平台适合 MVP 和简单场景，复杂需求还得自己写。
6. **会写代码的人用平台更高效**——你理解底层原理，能更好地配置和排错。

---

> **下一篇预告**：[27 | AI 产品思维：前端转 AI 的真正护城河](/series/junior/27-ai-product-thinking)

---

**讨论话题**：你用过 Dify / Coze / FastGPT 吗？觉得和自己写代码比，最大的优缺点是什么？评论区聊聊。
