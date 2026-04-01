---
title: "AI 应用部署实战：Docker + CI/CD + 监控"
description: "AI 应用的完整部署方案：Docker Compose、GitHub Actions 与日志监控"
order: 25
cover: "./cover.png"
publishDate: "2025-11-14"
tags: ["Docker", "CI/CD", "部署", "监控", "DevOps"]
---

# AI 应用部署实战：Docker + CI/CD + 监控

> 本文是【前端转 AI 全栈实战】系列第 25 篇。
> 上一篇：[AI 应用的测试和质量保障](/series/junior/24-testing) | 下一篇：[Dify / Coze 低代码 AI 平台：不写代码也能搭 AI 应用](/series/junior/26-ai-platforms)

---

## 这篇文章你会得到什么

代码写好了、测试过了——怎么部署上线？

AI 应用的部署和传统 Web 应用差不多，但有几个特殊点：
- **API Key 管理**——多环境隔离，不能泄露
- **流式响应**——Nginx 配置要特殊处理
- **监控维度**——除了常规指标，还要监控 token 消耗和 AI 调用成功率

这一篇给你一个可直接复用的部署方案。

---

## Dockerfile 编写

### Python 后端（FastAPI）

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```
# requirements.txt
fastapi==0.109.0
uvicorn[standard]==0.27.0
openai==1.12.0
pydantic==2.6.0
python-dotenv==1.0.0
redis==5.0.1
```

### Node.js 前端（Vite + Vue）

```dockerfile
# frontend/Dockerfile
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### Docker Compose 一键启动

```yaml
# docker-compose.yml
version: "3.8"

services:
  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file:
      - .env.production
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

```bash
docker-compose up -d --build
```

---

## 环境变量管理

### 多环境 API Key 隔离

```bash
# .env.development
AI_API_KEY=sk-dev-xxx
AI_MODEL=deepseek-chat
AI_BASE_URL=https://api.deepseek.com
LOG_LEVEL=debug

# .env.production
AI_API_KEY=sk-prod-xxx
AI_MODEL=gpt-4o-mini
AI_BASE_URL=https://api.openai.com/v1
LOG_LEVEL=warning
```

```python
# config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    ai_api_key: str
    ai_model: str = "gpt-4o-mini"
    ai_base_url: str = "https://api.openai.com/v1"
    redis_url: str = "redis://localhost:6379"
    log_level: str = "info"

    class Config:
        env_file = ".env"

settings = Settings()
```

### .gitignore 必须包含

```
.env
.env.*
!.env.example
```

提供一个 `.env.example` 作为模板：

```bash
# .env.example — 复制为 .env 并填入真实值
AI_API_KEY=your-api-key-here
AI_MODEL=gpt-4o-mini
AI_BASE_URL=https://api.openai.com/v1
REDIS_URL=redis://localhost:6379
```

---

## Nginx 配置（SSE 关键）

AI 应用的流式响应（SSE）需要特殊的 Nginx 配置：

```nginx
# nginx.conf
server {
    listen 80;
    server_name localhost;

    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # SSE 关键配置
        proxy_buffering off;          # 关闭缓冲，实时推送
        proxy_cache off;              # 关闭缓存
        proxy_read_timeout 300s;      # AI 调用可能比较慢
        proxy_send_timeout 300s;

        # 禁用 gzip（SSE 不需要）
        gzip off;

        # 支持 chunked transfer
        chunked_transfer_encoding on;
    }
}
```

**最常见的坑**：部署后流式输出变成一次性返回——99% 是因为没关 `proxy_buffering`。

---

## GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy AI App

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Test Frontend
        working-directory: ./frontend
        run: |
          npm ci
          npm run test

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Test Backend
        working-directory: ./backend
        run: |
          pip install -r requirements.txt
          pytest tests/ -v

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and Push Backend
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}-backend:latest

      - name: Build and Push Frontend
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}-frontend:latest

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            cd /opt/ai-app
            docker-compose pull
            docker-compose up -d --remove-orphans
```

---

## 日志和监控

### 结构化日志

```python
import logging
import json
import time

class AICallLogger:
    def __init__(self):
        self.logger = logging.getLogger("ai_calls")

    def log_call(self, model, input_tokens, output_tokens, latency_ms, status, task_type):
        self.logger.info(json.dumps({
            "event": "ai_call",
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "latency_ms": latency_ms,
            "status": status,
            "task_type": task_type,
            "timestamp": time.time(),
        }))
```

### FastAPI 中间件

```python
from fastapi import Request
import time

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = (time.time() - start) * 1000

    if request.url.path.startswith("/api/"):
        logger.info(json.dumps({
            "event": "http_request",
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round(duration, 2),
        }))

    return response
```

### 关键监控指标

| 指标 | 告警阈值 | 说明 |
|------|---------|------|
| AI 调用成功率 | < 95% | 可能是 API Key 过期或额度用完 |
| 平均响应时间 | > 10s | 可能需要换模型或加缓存 |
| 日 Token 消耗 | > 日均 3 倍 | 可能有异常流量或 Prompt 变长 |
| 日成本 | > $10 | 需要检查是否有滥用 |
| 错误率 | > 5% | 检查 API 状态和网络 |

---

## 灰度发布

AI 应用的输出质量不确定——新 Prompt 上线前，先灰度验证。

```python
import random

def get_ai_config(user_id: str) -> dict:
    # 10% 的用户走新配置
    if hash(user_id) % 100 < 10:
        return {
            "model": "gpt-4o",
            "prompt_version": "v2",
            "group": "experiment",
        }

    return {
        "model": "gpt-4o-mini",
        "prompt_version": "v1",
        "group": "control",
    }
```

对比两组的用户满意度、回复质量、成本——数据说话，再决定是否全量。

---

## 总结

1. **Docker Compose**——前端 + 后端 + Redis 一键部署。
2. **环境变量隔离**——`.env.production` 管理 API Key，绝对不进 Git。
3. **Nginx SSE 配置**——`proxy_buffering off` 是流式输出的命门。
4. **GitHub Actions**——测试 → 构建镜像 → 推送 → SSH 部署，全自动。
5. **结构化日志**——记录每次 AI 调用的 model、tokens、延迟、状态。
6. **灰度发布**——新 Prompt / 新模型先跑 10% 流量验证。

---

> **下一篇预告**：[26 | Dify / Coze 低代码 AI 平台：不写代码也能搭 AI 应用](/series/junior/26-ai-platforms)

---

**讨论话题**：你的 AI 应用部署在哪里？用什么监控方案？评论区聊聊。
