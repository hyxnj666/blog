---
title: "搭建公司内部的 AI 平台（上）：架构设计与核心模块"
description: "设计企业内部统一 AI 平台的整体架构与四大核心模块"
order: 8
cover: "./cover.png"
publishDate: "2025-09-14"
tags: ["架构", "AI平台", "后端", "企业级"]
---

# 搭建公司内部的 AI 平台（上）：架构设计与核心模块

> 本文是【高级前端的 AI 架构升级之路】系列第 08 篇。
> 上一篇：[AI 应用的安全架构：Prompt 注入、数据泄露、权限边界](/series/senior/07-ai-security) | 下一篇：[搭建公司内部的 AI 平台（下）：前端控制台开发](/series/senior/09-ai-platform-frontend)

---

## 引言

公司里 A 团队用 GPT-4o，B 团队用 DeepSeek，C 团队用 Claude——每个团队自己管 Key、自己写调用代码、自己算成本。混乱、重复、失控。

作为技术架构师，你需要搭一个**统一的 AI 平台**：所有团队通过平台调用 AI，平台统一管理模型、Prompt、知识库、成本和权限。

这就是内部 AI 平台——不是做一个 ChatGPT 竞品，而是给公司的 AI 能力建一个**基础设施层**。

---

## 为什么需要统一 AI 平台

| 没有平台 | 有平台 |
|---------|--------|
| 每个团队自己管 API Key | 平台统一管理，按需分配 |
| Prompt 散落在代码里 | Prompt 版本化、可测试、可回滚 |
| 没人知道公司每月花多少钱 | 实时成本看板，按团队分账 |
| 出了安全问题排查困难 | 统一审计日志 |
| 换模型要改代码 | 平台路由，业务无感切换 |
| 知识库各搞各的 | 统一知识库管理，跨团队复用 |

---

## 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                    AI Platform Console                     │
│  (模型管理 | Prompt 市场 | 知识库 | 用量分析 | 权限管理)      │
└────────────────────────┬─────────────────────────────────┘
                         │ REST API
┌────────────────────────┴─────────────────────────────────┐
│                      Platform API                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ AI Gateway│ │ Prompt   │ │ Knowledge│ │ Usage &     │ │
│  │ 多模型路由 │ │ Manager  │ │ Base     │ │ Billing     │ │
│  │ 降级/限流  │ │ 版本管理  │ │ RAG 检索  │ │ 用量计费     │ │
│  └─────┬────┘ └─────┬────┘ └─────┬────┘ └──────┬──────┘ │
│        │            │            │              │         │
│  ┌─────┴────────────┴────────────┴──────────────┴──────┐ │
│  │                   Core Services                      │ │
│  │  Auth | Rate Limiter | Audit Logger | Cost Tracker   │ │
│  └──────────────────────┬──────────────────────────────┘ │
└─────────────────────────┼────────────────────────────────┘
                          │
    ┌─────────────────────┼─────────────────────┐
    │                     │                     │
    ▼                     ▼                     ▼
┌────────┐         ┌────────────┐        ┌──────────┐
│ LLM APIs│         │ Vector DB  │        │ Redis    │
│ (多厂商) │         │ (pgvector) │        │ (缓存/限流)│
└────────┘         └────────────┘        └──────────┘
```

---

## 核心模块拆解

### 模块一：AI Gateway

[第 03 篇](/series/senior/03-ai-gateway)已经详细设计过——多模型路由、降级、限流、成本控制。平台化后增加：

- **按团队/应用分配模型权限**——A 团队只能用 DeepSeek，B 团队可以用 GPT-4o
- **配额管理**——每个团队每月 Token 预算
- **统一鉴权**——通过 Platform API Key 调用，不暴露 LLM API Key

```python
# 平台统一调用接口
@router.post("/v1/chat/completions")
async def platform_chat(req: ChatRequest, api_key: str = Depends(verify_platform_key)):
    # 1. 鉴权：验证 api_key，获取团队信息和权限
    team = await get_team_by_key(api_key)

    # 2. 权限检查：该团队能否使用请求的模型
    if req.model not in team.allowed_models:
        raise HTTPException(403, f"团队 {team.name} 无权使用模型 {req.model}")

    # 3. 配额检查
    usage = await get_monthly_usage(team.id)
    if usage.tokens > team.monthly_token_limit:
        raise HTTPException(429, "本月 Token 配额已用完")

    # 4. 路由到实际模型
    response = await ai_gateway.call(req)

    # 5. 记录用量
    await record_usage(team.id, req.model, response.usage)

    return response
```

### 模块二：Prompt Manager

```python
# 数据模型
class PromptTemplate(BaseModel):
    id: str
    name: str                    # "客服回复模板"
    category: str                # "customer_service"
    template: str                # "你是{{company}}的客服..."
    variables: list[str]         # ["company", "product"]
    model_recommendation: str    # "gpt-4o-mini"
    version: int
    created_by: str
    created_at: datetime
    is_published: bool
    eval_score: float | None     # 评估分数

class PromptVersion(BaseModel):
    prompt_id: str
    version: int
    template: str
    changelog: str               # "优化了拒绝回答的措辞"
    eval_results: dict | None    # 评估结果
```

核心功能：
- **CRUD**——创建、编辑、删除 Prompt 模板
- **版本管理**——每次修改自动生成新版本，支持 diff 查看和回滚
- **变量模板**——`{{variable}}` 语法，运行时动态注入
- **在线测试**——填入变量，直接调 AI 看效果
- **评估集成**——修改 Prompt 后自动跑 Eval，对比新旧版本分数

### 模块三：Knowledge Base（知识库）

```python
class KnowledgeBase(BaseModel):
    id: str
    name: str                    # "产品文档库"
    description: str
    team_id: str
    documents: list[Document]
    embedding_model: str         # "text-embedding-3-small"
    chunk_config: ChunkConfig
    status: str                  # "ready" | "indexing" | "error"

class Document(BaseModel):
    id: str
    filename: str
    file_type: str               # "pdf" | "md" | "docx"
    chunk_count: int
    token_count: int
    uploaded_at: datetime
    status: str                  # "indexed" | "processing" | "failed"

class ChunkConfig(BaseModel):
    chunk_size: int = 500
    chunk_overlap: int = 100
    splitter: str = "recursive"  # "recursive" | "sentence" | "token"
```

文档处理流水线：

```
上传文档 → 文本提取(PDF/Word/HTML) → 切片 → Embedding → 存入向量库
                                                        ↓
                                          用户提问 → 检索 → 拼接上下文 → AI 回答
```

### 模块四：Usage & Billing

```python
class UsageRecord(BaseModel):
    id: str
    team_id: str
    app_id: str | None
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: int
    status: str            # "success" | "error"
    timestamp: datetime

class TeamBilling(BaseModel):
    team_id: str
    monthly_token_limit: int
    used_tokens: int
    cost_usd: float
    billing_period: str    # "2026-03"
```

核心功能：
- **实时用量追踪**——每次调用记录 model、tokens、cost、latency
- **按维度聚合**——按团队、按应用、按模型、按天/周/月
- **预算告警**——用量达到 80% / 100% 时通知团队负责人
- **账单导出**——月度账单 CSV 下载

---

## 数据库设计

```sql
-- 团队
CREATE TABLE teams (
    id UUID PRIMARY KEY,
    name VARCHAR(100),
    allowed_models TEXT[],
    monthly_token_limit BIGINT DEFAULT 1000000,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 平台 API Key
CREATE TABLE api_keys (
    id UUID PRIMARY KEY,
    team_id UUID REFERENCES teams(id),
    key_hash VARCHAR(64),
    name VARCHAR(100),
    permissions JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Prompt 模板
CREATE TABLE prompts (
    id UUID PRIMARY KEY,
    team_id UUID REFERENCES teams(id),
    name VARCHAR(200),
    category VARCHAR(50),
    current_version INT DEFAULT 1,
    is_published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE prompt_versions (
    id UUID PRIMARY KEY,
    prompt_id UUID REFERENCES prompts(id),
    version INT,
    template TEXT,
    variables TEXT[],
    changelog TEXT,
    eval_score FLOAT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 知识库
CREATE TABLE knowledge_bases (
    id UUID PRIMARY KEY,
    team_id UUID REFERENCES teams(id),
    name VARCHAR(200),
    embedding_model VARCHAR(100),
    chunk_config JSONB,
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE documents (
    id UUID PRIMARY KEY,
    kb_id UUID REFERENCES knowledge_bases(id),
    filename VARCHAR(500),
    file_type VARCHAR(20),
    chunk_count INT,
    status VARCHAR(20),
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- 用量记录
CREATE TABLE usage_records (
    id UUID PRIMARY KEY,
    team_id UUID REFERENCES teams(id),
    api_key_id UUID REFERENCES api_keys(id),
    model VARCHAR(100),
    input_tokens INT,
    output_tokens INT,
    cost_usd DECIMAL(10, 6),
    latency_ms INT,
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 用量按天聚合（定时任务生成）
CREATE TABLE usage_daily (
    team_id UUID,
    model VARCHAR(100),
    date DATE,
    total_calls INT,
    total_input_tokens BIGINT,
    total_output_tokens BIGINT,
    total_cost DECIMAL(10, 4),
    avg_latency_ms INT,
    error_count INT,
    PRIMARY KEY (team_id, model, date)
);
```

---

## 技术选型决策

### 自建 vs 基于 Dify 二次开发

| 维度 | 自建 | Dify 二开 |
|------|------|----------|
| **开发周期** | 2-3 个月 | 2-4 周 |
| **灵活度** | 完全自定义 | 受 Dify 架构限制 |
| **维护成本** | 高（全自己维护） | 中（跟随社区更新） |
| **适合场景** | 需求和 Dify 差异大 | 80% 需求和 Dify 一致 |
| **团队要求** | 全栈团队 3+ 人 | 1-2 人即可 |

**我的建议**：如果你的需求是"统一管理 + RAG + Prompt 管理"，先基于 Dify 二开。如果发现 Dify 满足不了（比如自定义计费、复杂权限），再逐步自建替换模块。

### 多租户设计

```python
# 中间件：从 API Key 解析团队信息
@app.middleware("http")
async def tenant_middleware(request: Request, call_next):
    api_key = request.headers.get("Authorization", "").replace("Bearer ", "")

    if not api_key:
        return JSONResponse(status_code=401, content={"error": "Missing API Key"})

    team = await verify_and_get_team(api_key)
    if not team:
        return JSONResponse(status_code=403, content={"error": "Invalid API Key"})

    # 注入团队上下文
    request.state.team = team
    request.state.team_id = team.id

    response = await call_next(request)
    return response
```

所有数据查询自动带 `team_id` 过滤——团队之间数据完全隔离。

---

## 总结

1. **为什么需要统一 AI 平台**——解决多团队重复建设、成本失控、安全无保障的问题。
2. **四大核心模块**：AI Gateway（路由/限流）、Prompt Manager（版本管理）、Knowledge Base（RAG）、Usage & Billing（计费）。
3. **数据库设计**——teams → api_keys → prompts/versions → knowledge_bases/documents → usage_records，层次清晰。
4. **技术选型**——需求和 Dify 匹配度高就二开，差异大就自建，可以渐进式迁移。
5. **多租户**——API Key 绑定团队，所有数据按 team_id 隔离。

**下一篇**我们做前端控制台——模型管理、Prompt 编辑器、知识库管理、监控大盘。

---

> **下一篇预告**：[09 | 搭建公司内部的 AI 平台（下）：前端控制台开发](/series/senior/09-ai-platform-frontend)

---

**架构讨论**：你们公司有统一的 AI 平台吗？是自建还是用开源方案？最大的痛点是什么？评论区聊聊。
