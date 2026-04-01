---
title: "RAG 入门：让 AI 基于你的文档回答问题"
description: "从零实现 RAG：文档切片、向量搜索、ChromaDB 和 FastAPI 集成"
order: 15
cover: "./cover.png"
publishDate: "2025-09-05"
tags: ["RAG", "AI", "向量数据库", "Python", "ChromaDB"]
---

# RAG 入门：让 AI 基于你的文档回答问题

> 本文是【前端转 AI 全栈实战】系列第 15 篇。
> 上一篇：[AI 聊天应用全栈实战（下）：前端 UI + 流式渲染](/series/junior/14-chat-app-frontend) | 下一篇：[AI Agent 模式：让 AI 不只是回答问题，还能执行任务](/series/junior/16-ai-agent)

---

## 这篇文章你会得到什么

前两篇你做了一个完整的 AI 聊天应用。但你有没有发现一个问题——**AI 只知道它训练数据里有的东西**。

你问它："我们公司的请假流程是什么？"它不知道。
你问它："这个项目的 API 文档在哪？"它不知道。
你问它："上季度的销售数据怎么样？"它更不知道。

**AI 不知道你的私有数据。**

怎么办？两种方案：

1. **微调（Fine-tuning）**：把你的数据喂给模型重新训练——成本高、周期长、需要 GPU
2. **RAG（Retrieval-Augmented Generation）**：把相关文档检索出来塞进 Prompt——成本低、实时更新、不需要训练

对于 90% 的企业场景，**RAG 是正确答案**。

---

## RAG 是什么

RAG = **检索增强生成**（Retrieval-Augmented Generation）。

一句话解释：**先从你的文档库里搜出相关内容，再把搜到的内容连同用户的问题一起发给 AI**。

```
用户提问："请假流程是什么？"
       ↓
① 检索：从文档库中搜索"请假"相关的文档片段
       ↓
② 找到：《员工手册》第3章 - 请假需提前3天在OA系统提交...
       ↓
③ 拼接 Prompt：
   System: 请基于以下参考资料回答用户的问题。
   Context: 《员工手册》第3章 - 请假需提前3天...
   User: 请假流程是什么？
       ↓
④ AI 回答：根据公司规定，请假流程如下：1. 提前3天在OA系统提交...
```

本质上就是**给 AI 开卷考试**——先帮它翻到正确的那一页，再让它回答。

### 为什么不直接把所有文档塞进 Prompt？

因为 AI 有上下文长度限制。即使是 128K 上下文的模型，也装不下一个公司几百页的文档。而且文档越长，AI 的"注意力"越分散，回答质量越差。

RAG 的核心价值：**只检索最相关的几段文档**，精准投喂。

---

## 向量搜索：RAG 的核心技术

传统搜索用关键词匹配——搜"请假"只能匹配包含"请假"两个字的文档。

但用户可能问的是"我想休息几天怎么办"——没有"请假"这个词，传统搜索就失灵了。

**向量搜索解决这个问题——它搜的是"语义"而不是"关键词"。**

### Embedding：把文字变成向量

```
"请假流程" → [0.12, -0.35, 0.78, ..., 0.21]  (1536维向量)
"休息几天" → [0.14, -0.33, 0.76, ..., 0.19]  (1536维向量)
"天气预报" → [-0.45, 0.62, -0.11, ..., 0.88] (1536维向量)
```

"请假流程"和"休息几天"的向量很接近（语义相似），"天气预报"的向量离它们很远。

通过计算向量之间的距离（余弦相似度），就能找到语义最相关的文档。

### Embedding API 调用

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://api.deepseek.com",
    api_key="sk-xxx",
)

def get_embedding(text: str) -> list[float]:
    # 注意：不是所有厂商都提供 Embedding API
    # OpenAI: text-embedding-3-small
    # 也可以用本地模型（sentence-transformers）
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return response.data[0].embedding
```

---

## 文档切片：把长文档拆成小块

一份 50 页的 PDF 不能整个做 Embedding——太长了，而且用户的问题通常只和其中一小段相关。

需要把文档切成小块（chunks），每块单独做 Embedding。

### 切片策略

| 策略 | 做法 | 适合 |
|------|------|------|
| 按段落 | 以空行分隔 | 结构化文档（Markdown、手册） |
| 按固定 Token | 每 500 token 一块 | 通用 |
| 递归切分 | 先按标题 → 段落 → 句子逐级拆分 | 长文档 |
| 按语义 | 用 AI 判断语义边界 | 高质量但贵 |

**推荐：递归切分 + 重叠（overlap）。**

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,       # 每块最多 500 字符
    chunk_overlap=100,    # 相邻块重叠 100 字符
    separators=["\n\n", "\n", "。", ".", " "],
)

chunks = splitter.split_text(document_text)
```

为什么要重叠？因为切片可能把一段完整的论述切断。重叠 100 字符能保证上下文不丢失。

---

## 用 ChromaDB 搭建向量数据库

ChromaDB 是最简单的向量数据库——纯 Python，不需要额外服务，SQLite 存储。

```bash
pip install chromadb
```

### 完整 RAG 流程

```python
# rag_service.py
import chromadb
from openai import OpenAI
import os

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
)

# 初始化 ChromaDB
chroma = chromadb.PersistentClient(path="./chroma_db")
collection = chroma.get_or_create_collection(
    name="documents",
    metadata={"hnsw:space": "cosine"},
)


def get_embedding(text: str) -> list[float]:
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return response.data[0].embedding


def add_document(doc_id: str, text: str, metadata: dict = None):
    """添加文档到向量库"""
    from langchain.text_splitter import RecursiveCharacterTextSplitter

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=100,
    )
    chunks = splitter.split_text(text)

    for i, chunk in enumerate(chunks):
        chunk_id = f"{doc_id}_chunk_{i}"
        embedding = get_embedding(chunk)
        collection.add(
            ids=[chunk_id],
            embeddings=[embedding],
            documents=[chunk],
            metadatas=[{**(metadata or {}), "doc_id": doc_id, "chunk_index": i}],
        )

    return len(chunks)


def search(query: str, top_k: int = 5) -> list[dict]:
    """语义搜索：返回最相关的文档片段"""
    query_embedding = get_embedding(query)

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
    )

    return [
        {
            "content": doc,
            "metadata": meta,
            "distance": dist,
        }
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        )
    ]


def rag_chat(question: str) -> str:
    """RAG 问答：检索 + 生成"""
    # 1. 检索相关文档
    docs = search(question, top_k=3)

    if not docs:
        context = "没有找到相关文档。"
    else:
        context = "\n\n---\n\n".join(
            f"[来源: {d['metadata'].get('doc_id', '未知')}]\n{d['content']}"
            for d in docs
        )

    # 2. 拼接 Prompt
    messages = [
        {
            "role": "system",
            "content": f"""你是一个知识库问答助手。请基于以下参考资料回答用户的问题。

## 规则
- 只基于参考资料回答，不要编造内容
- 如果参考资料中没有相关信息，诚实说"根据现有资料无法回答"
- 引用时标注来源
- 用中文回答

## 参考资料
{context}""",
        },
        {"role": "user", "content": question},
    ]

    # 3. 调 AI 生成回答
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        temperature=0.3,
    )

    return response.choices[0].message.content
```

### 使用

```python
# 导入文档
add_document("employee_handbook", open("员工手册.md").read(), {"type": "handbook"})
add_document("api_docs", open("API文档.md").read(), {"type": "api"})

# 提问
answer = rag_chat("请假流程是什么？")
print(answer)
# → 根据《员工手册》，请假流程如下：1. 提前3天在OA系统提交申请...
```

---

## 集成到 FastAPI

把 RAG 能力接入[第 13 篇](/series/junior/13-chat-app-backend)的聊天后端：

```python
# routers/rag.py
from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel
from services.rag_service import add_document, rag_chat, search

router = APIRouter(prefix="/api/rag", tags=["rag"])


class QuestionRequest(BaseModel):
    question: str


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """上传文档到知识库"""
    content = (await file.read()).decode("utf-8")
    doc_id = file.filename or "unknown"
    chunk_count = add_document(doc_id, content, {"filename": doc_id})
    return {"doc_id": doc_id, "chunks": chunk_count}


@router.post("/ask")
async def ask_question(req: QuestionRequest):
    """RAG 问答"""
    answer = rag_chat(req.question)
    return {"answer": answer}


@router.post("/search")
async def search_docs(req: QuestionRequest):
    """纯检索（不生成回答）"""
    results = search(req.question, top_k=5)
    return {"results": results}
```

前端只需要：

1. 一个上传文档的接口
2. 一个提问的接口

后端搞定检索 + 生成的全部逻辑。

---

## RAG 的常见问题和优化

### 问题 1：检索不准

**症状**：用户问 A，检索出来的是 B 的内容。

**优化**：
- 调小 `chunk_size`（500 → 300），让每块更聚焦
- 增加 `top_k`（3 → 5），多检索几块
- 使用更好的 Embedding 模型（`text-embedding-3-large`）
- 加入关键词搜索混合排序（Hybrid Search）

### 问题 2：AI 回答时编造内容

**症状**：参考资料没提到的东西，AI 自己编了。

**优化**：
- Prompt 里明确："只基于参考资料回答，不要编造"
- 降低 `temperature`（0.1-0.3）
- 在 Prompt 里让 AI 标注引用来源

### 问题 3：文档更新后搜索结果过时

**解决**：删除旧文档的 chunks，重新导入。

```python
def update_document(doc_id: str, new_text: str):
    # 删除旧 chunks
    old_ids = collection.get(where={"doc_id": doc_id})["ids"]
    if old_ids:
        collection.delete(ids=old_ids)
    # 重新导入
    add_document(doc_id, new_text, {"doc_id": doc_id})
```

---

## 适用场景

| 场景 | 文档类型 | 价值 |
|------|---------|------|
| **企业知识库** | 员工手册、制度文件、FAQ | 新人入职不用问人 |
| **产品文档问答** | API 文档、使用指南 | 减少技术支持工作量 |
| **客服机器人** | 产品介绍、常见问题 | 7x24 自动回答 |
| **代码库问答** | 代码注释、README、设计文档 | 理解老项目 |
| **法律/医疗** | 法规、医学文献 | 专业知识检索 |

---

## 技术选型速查

| 组件 | 推荐方案 | 备选 |
|------|---------|------|
| **向量数据库** | ChromaDB（简单场景） | pgvector（PostgreSQL）、Pinecone（SaaS） |
| **Embedding 模型** | text-embedding-3-small | sentence-transformers（本地） |
| **文档切片** | LangChain RecursiveCharacterTextSplitter | 自己写 |
| **AI 生成** | DeepSeek / GPT-4o-mini | Claude |
| **框架** | LangChain | LlamaIndex、自己写 |

小项目用 ChromaDB（纯 Python，零运维）；生产环境用 pgvector（PostgreSQL 插件，已有数据库就直接加）。

---

## 总结

1. **RAG = 检索 + 生成**——先搜相关文档，再让 AI 基于文档回答，不需要微调模型。
2. **向量搜索是核心**——Embedding 把文字变成向量，余弦相似度找语义最近的文档。
3. **文档切片很重要**——递归切分 + 重叠 100 字符，保证上下文完整。
4. **ChromaDB 最简单**——纯 Python，SQLite 存储，适合入门和小项目。
5. **Prompt 要约束 AI**——"只基于参考资料回答"，防止编造。
6. **三个 API 搞定**：上传文档、搜索、问答。

**下一篇**，我们进入 AI Agent——让 AI 不只是回答问题，还能调用工具、执行任务。

---

> **下一篇预告**：[16 | AI Agent 模式：让 AI 不只是回答问题，还能执行任务](/series/junior/16-ai-agent)

---

**讨论话题**：你做过 RAG 项目吗？用的什么向量数据库？检索准确率怎么样？评论区聊聊。
