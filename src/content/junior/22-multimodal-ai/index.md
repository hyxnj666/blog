---
title: "多模态 AI API：不只是文本，图片和语音也能玩"
description: "打通 Vision、TTS、STT 多模态 AI API，实战截图转代码"
order: 22
cover: "./cover.png"
publishDate: "2025-10-24"
tags: ["多模态AI", "Vision API", "语音识别", "TTS", "前端开发"]
---

# 多模态 AI API：不只是文本，图片和语音也能玩

> 本文是【前端转 AI 全栈实战】系列第 22 篇。
> 上一篇：[AI + VS Code 插件：给你的编辑器加上 AI 超能力](/series/junior/21-ai-vscode-plugin) | 下一篇：[AI 应用的成本优化：从月花 $100 到 $5](/series/junior/23-cost-optimization)

---

## 这篇文章你会得到什么

之前的所有文章，AI 的输入和输出都是**文本**。但现在的 AI 不止能处理文字——它能**看图片**、**听语音**、**生成图片**、**合成语音**。

对前端来说，这意味着一批全新的产品可能：

- 上传 UI 截图 → AI 生成页面代码
- 拍照商品 → AI 识别并生成描述
- 用户说一句话 → AI 语音回答
- 上传设计稿 → AI 标注尺寸和颜色

这一篇带你把多模态 AI API 全部打通。

---

## Vision API：让 AI 看图片

### 原理

Vision API 接受图片（URL 或 Base64）+ 文字指令，返回文本回答。

```
输入：[图片] + "这张图里有什么？"
输出："这是一个电商首页设计稿，顶部是导航栏..."
```

### 支持的模型

| 模型 | 厂商 | 特点 |
|------|------|------|
| GPT-4o | OpenAI | 综合能力最强 |
| Claude 3.5 Sonnet | Anthropic | 细节识别优秀 |
| Gemini 1.5 Pro | Google | 超长上下文 |
| 通义千问 VL | 阿里 | 中文场景好 |
| DeepSeek VL | DeepSeek | 性价比高 |

### JavaScript 调用

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

async function analyzeImage(imageUrl, question) {
  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: imageUrl },
          },
          {
            type: "text",
            text: question,
          },
        ],
      },
    ],
    max_tokens: 2000,
  });

  return response.choices[0].message.content;
}

// URL 方式
const result = await analyzeImage(
  "https://example.com/screenshot.png",
  "描述这个页面的布局和设计风格"
);

// Base64 方式（本地图片）
import fs from "fs";
const imageBase64 = fs.readFileSync("screenshot.png", "base64");
const result2 = await analyzeImage(
  `data:image/png;base64,${imageBase64}`,
  "这个 UI 有什么可以改进的地方？"
);
```

### Python 调用

```python
from openai import OpenAI
import base64

client = OpenAI(
    base_url="https://api.deepseek.com",
    api_key="sk-xxx",
)

def analyze_image(image_path: str, question: str) -> str:
    with open(image_path, "rb") as f:
        image_base64 = base64.b64encode(f.read()).decode()

    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{image_base64}",
                        },
                    },
                    {"type": "text", "text": question},
                ],
            }
        ],
        max_tokens=2000,
    )
    return response.choices[0].message.content
```

---

## 实战：截图转代码

前端最实用的多模态场景——上传 UI 截图，AI 生成对应的 HTML/CSS 代码。

### Prompt 设计

```javascript
const SCREENSHOT_TO_CODE_PROMPT = `你是一个前端开发专家。根据 UI 截图生成对应的 HTML + CSS 代码。

## 要求
- 使用语义化 HTML 标签
- CSS 使用 Flexbox/Grid 布局
- 响应式设计
- 颜色尽量从截图中提取
- 字体使用系统默认字体栈
- 输出完整的、可直接运行的 HTML 文件（内联 CSS）
- 用中文注释关键布局决策`;
```

### 后端 API

```python
# FastAPI
from fastapi import APIRouter, UploadFile, File
import base64

router = APIRouter(prefix="/api/vision")

@router.post("/screenshot-to-code")
async def screenshot_to_code(file: UploadFile = File(...)):
    content = await file.read()
    image_base64 = base64.b64encode(content).decode()

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/{file.content_type.split('/')[-1]};base64,{image_base64}",
                        },
                    },
                    {
                        "type": "text",
                        "text": SCREENSHOT_TO_CODE_PROMPT,
                    },
                ],
            }
        ],
        max_tokens=4000,
        temperature=0.2,
    )

    code = response.choices[0].message.content
    return {"code": code}
```

### 前端

```vue
<script setup lang="ts">
import { ref } from 'vue'

const preview = ref('')
const loading = ref(false)

async function handleUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  loading.value = true
  const formData = new FormData()
  formData.append('file', file)

  const resp = await fetch('/api/vision/screenshot-to-code', {
    method: 'POST',
    body: formData,
  })

  const { code } = await resp.json()

  // 提取 HTML 代码块
  const htmlMatch = code.match(/```html\n([\s\S]*?)```/)
  preview.value = htmlMatch ? htmlMatch[1] : code

  loading.value = false
}
</script>

<template>
  <div>
    <input type="file" accept="image/*" @change="handleUpload" />
    <div v-if="loading">AI 正在生成代码...</div>
    <iframe
      v-if="preview"
      :srcdoc="preview"
      style="width: 100%; height: 600px; border: 1px solid #333;"
    />
  </div>
</template>
```

---

## 语音 API：TTS 和 STT

### TTS（Text-to-Speech）：文本转语音

让 AI 的回答可以"说"出来。

```javascript
// OpenAI TTS
const response = await fetch("https://api.openai.com/v1/audio/speech", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "tts-1",
    input: "你好，我是 AI 助手，有什么可以帮你的？",
    voice: "alloy", // alloy, echo, fable, onyx, nova, shimmer
    response_format: "mp3",
  }),
});

const audioBlob = await response.blob();
const audioUrl = URL.createObjectURL(audioBlob);
const audio = new Audio(audioUrl);
audio.play();
```

```python
# Python TTS
from openai import OpenAI
from pathlib import Path

client = OpenAI()

response = client.audio.speech.create(
    model="tts-1",
    voice="alloy",
    input="你好，我是 AI 助手",
)

speech_file = Path("output.mp3")
response.stream_to_file(speech_file)
```

### STT（Speech-to-Text）：语音转文本

让用户可以"说"指令给 AI。

```javascript
// 前端录音
async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream);
  const chunks = [];

  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: "audio/webm" });
    const formData = new FormData();
    formData.append("file", blob, "audio.webm");

    const resp = await fetch("/api/audio/transcribe", {
      method: "POST",
      body: formData,
    });

    const { text } = await resp.json();
    console.log("识别结果:", text);
  };

  mediaRecorder.start();

  // 5 秒后停止
  setTimeout(() => mediaRecorder.stop(), 5000);
}
```

```python
# 后端 STT
@router.post("/api/audio/transcribe")
async def transcribe(file: UploadFile = File(...)):
    audio_content = await file.read()

    # 保存临时文件
    with open("/tmp/audio.webm", "wb") as f:
        f.write(audio_content)

    with open("/tmp/audio.webm", "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language="zh",
        )

    return {"text": transcript.text}
```

---

## 图片 Token 怎么算

多模态 API 的成本比纯文本高很多——因为图片会被转换成大量 token。

### OpenAI 的图片 token 计算

| 分辨率 | 模式 | Token 消耗 |
|--------|------|-----------|
| 512x512 以下 | low detail | ~85 tokens |
| 任意大小 | high detail | 按 512x512 块数计算，每块 170 tokens |

**一张 1024x1024 的图 ≈ 765 tokens（high detail）**

### 优化策略

```javascript
// 上传前压缩图片
function compressImage(file, maxWidth = 1024) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const img = new Image();

    img.onload = () => {
      const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(resolve, "image/jpeg", 0.8);
    };

    img.src = URL.createObjectURL(file);
  });
}
```

```javascript
// 使用 low detail 模式（便宜但够用）
{
  type: "image_url",
  image_url: {
    url: imageUrl,
    detail: "low",  // low: 固定 85 tokens，high: 按分辨率计
  },
}
```

---

## 多模态组合：语音对话 + 图片理解

把 TTS、STT、Vision 组合起来，做一个"看图说话"的 AI。

```javascript
async function voiceImageChat(audioBlob, imageFile) {
  // 1. 语音转文字
  const transcription = await transcribe(audioBlob);

  // 2. 图片 + 文字发给 AI
  const imageBase64 = await fileToBase64(imageFile);
  const aiResponse = await analyzeImage(
    `data:image/jpeg;base64,${imageBase64}`,
    transcription
  );

  // 3. AI 回答转语音
  const audioResponse = await textToSpeech(aiResponse);

  return {
    userText: transcription,
    aiText: aiResponse,
    aiAudio: audioResponse,
  };
}
```

用户对着手机说"这个产品多少钱"，同时拍一张照片——AI 识别图片中的商品，语音回答价格。

---

## 前端场景速查

| 场景 | 输入 | 输出 | 用到的 API |
|------|------|------|-----------|
| **截图转代码** | 图片 | HTML/CSS | Vision |
| **图片描述生成** | 图片 | 文本 | Vision |
| **OCR + 理解** | 图片 | 结构化数据 | Vision |
| **语音指令** | 音频 | 文本 | STT |
| **AI 播报** | 文本 | 音频 | TTS |
| **设计稿标注** | 图片 | 标注数据 | Vision |
| **无障碍描述** | 图片 | alt 文本 | Vision |
| **视频字幕** | 视频 → 帧/音频 | 文本 | Vision + STT |

---

## 总结

1. **Vision API**——图片 + 文字 → AI 回答，支持 URL 和 Base64 两种方式。
2. **TTS**——文本 → 语音，`tts-1` 模型 + 6 种声音。
3. **STT**——语音 → 文本，Whisper 模型，支持中文。
4. **图片成本注意**——high detail 按块数计 token，上传前压缩 + 用 low detail 省钱。
5. **截图转代码是前端杀手级应用**——上传 UI 图，AI 直接输出可运行的 HTML。
6. **多模态可以组合**——语音 + 图片 + 文本，构建自然的交互体验。

第六阶段"AI + 前端扩展开发"到这里结束。**下一篇**进入第七阶段——AI 工程化与落地，先从成本优化开始。

---

> **下一篇预告**：[23 | AI 应用的成本优化：从月花 $100 到 $5](/series/junior/23-cost-optimization)

---

**讨论话题**：你试过多模态 AI 吗？觉得哪个场景最有商业价值？截图转代码好用吗？评论区聊聊。
