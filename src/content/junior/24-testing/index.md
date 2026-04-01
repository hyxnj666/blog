---
title: "AI 应用的测试和质量保障"
description: "AI 应用的四层测试方案：结构校验、Prompt Eval、E2E 测试与监控"
order: 24
cover: "./cover.png"
publishDate: "2025-11-07"
tags: ["测试", "质量保障", "AI工程化", "Vitest", "Prompt Eval"]
---

# AI 应用的测试和质量保障

> 本文是【前端转 AI 全栈实战】系列第 24 篇。
> 上一篇：[AI 应用的成本优化：从月花 $100 到 $5](/series/junior/23-cost-optimization) | 下一篇：[AI 应用部署实战：Docker + CI/CD + 监控](/series/junior/25-deployment)

---

## 这篇文章你会得到什么

传统应用的测试很确定——输入 A，期望输出 B，断言通过。

但 AI 应用不一样——**同样的输入，每次输出都可能不同**。你让 AI 翻译 "Hello"，它可能返回 "你好"、"哈喽"、"您好"——都是对的，但不一样。

怎么测？这一篇给你一套完整的 AI 应用测试方案。

---

## AI 输出的三大测试难题

1. **非确定性**——同一输入，多次输出不同
2. **评判标准模糊**——"好的翻译"怎么定义？
3. **依赖外部服务**——API 可能超时、限流、变更

所以 AI 应用的测试不能简单地 `expect(output).toBe("你好")`，需要换一套思路。

---

## 层级一：结构化输出校验

AI 最常见的 bug 不是"回答不好"，而是**格式不对**——你期望 JSON，它给你 Markdown；你期望数组，它给你字符串。

### Zod 校验

```typescript
import { z } from "zod";

const AIReviewSchema = z.object({
  score: z.number().min(1).max(10),
  issues: z.array(z.object({
    line: z.number(),
    severity: z.enum(["error", "warning", "info"]),
    message: z.string(),
    suggestion: z.string().optional(),
  })),
  summary: z.string().max(500),
});

type AIReview = z.infer<typeof AIReviewSchema>;

function validateAIOutput(raw: string): AIReview {
  const parsed = JSON.parse(raw);
  return AIReviewSchema.parse(parsed);
  // 如果格式不对，会抛出详细的错误信息
}
```

### 测试用例

```typescript
import { describe, it, expect } from "vitest";

describe("AI Review Output Validation", () => {
  it("应该通过合法的 AI 输出", () => {
    const valid = {
      score: 7,
      issues: [
        { line: 10, severity: "warning", message: "变量未使用" },
      ],
      summary: "代码整体质量不错，有一个未使用变量",
    };
    expect(() => AIReviewSchema.parse(valid)).not.toThrow();
  });

  it("应该拒绝缺少必填字段的输出", () => {
    const invalid = { score: 7 }; // 缺少 issues 和 summary
    expect(() => AIReviewSchema.parse(invalid)).toThrow();
  });

  it("应该拒绝超出范围的 score", () => {
    const invalid = { score: 11, issues: [], summary: "ok" };
    expect(() => AIReviewSchema.parse(invalid)).toThrow();
  });
});
```

---

## 层级二：Prompt 回归测试（Eval）

Prompt 改了一个字，输出质量可能大变。需要一套评估机制来确保 Prompt 的修改不会"越改越差"。

### 测试集设计

```typescript
// eval/test-cases.ts
interface EvalCase {
  id: string;
  input: string;
  expectedTraits: string[];  // 期望输出包含的特征
  forbiddenTraits?: string[]; // 期望输出不包含的内容
}

const translateCases: EvalCase[] = [
  {
    id: "simple-greeting",
    input: "Hello, how are you?",
    expectedTraits: ["你好", "怎么样"],
    forbiddenTraits: ["error", "sorry"],
  },
  {
    id: "technical-term",
    input: "The API returns a JSON response with pagination.",
    expectedTraits: ["API", "JSON", "分页"],
  },
  {
    id: "code-block",
    input: "Use `fetch()` to call the API.",
    expectedTraits: ["fetch()"],
  },
];
```

### 自动化评估

```typescript
async function runEval(cases: EvalCase[], prompt: string) {
  const results = [];

  for (const testCase of cases) {
    const output = await callAI(prompt, testCase.input);

    const passed = testCase.expectedTraits.every(
      (trait) => output.includes(trait)
    );

    const forbidden = testCase.forbiddenTraits?.some(
      (trait) => output.includes(trait)
    ) ?? false;

    results.push({
      id: testCase.id,
      passed: passed && !forbidden,
      output: output.slice(0, 200),
      missingTraits: testCase.expectedTraits.filter(t => !output.includes(t)),
    });
  }

  const passRate = results.filter((r) => r.passed).length / results.length;

  return {
    passRate,
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed),
  };
}
```

### AI-as-Judge（用 AI 评判 AI）

对于无法用规则判断的场景（比如"翻译是否自然"），可以用另一个 AI 来评分。

```typescript
async function aiJudge(input: string, output: string, criteria: string): Promise<number> {
  const judgePrompt = `你是一个翻译质量评估专家。请对以下翻译进行评分。

## 评分标准
${criteria}

## 评分范围
1-10 分，只输出数字。

## 原文
${input}

## 译文
${output}`;

  const score = await callAI(judgePrompt, "", { model: "gpt-4o", temperature: 0 });
  return parseInt(score) || 0;
}
```

---

## 层级三：E2E 测试策略

### Mock AI API

单元测试和 CI 中不该真调 AI API——又慢又花钱又不确定。

```typescript
// __mocks__/ai.ts
export async function callAI(prompt: string): Promise<string> {
  // 根据 prompt 关键词返回固定响应
  if (prompt.includes("翻译")) {
    return "你好，世界";
  }
  if (prompt.includes("JSON")) {
    return JSON.stringify({ score: 8, issues: [], summary: "LGTM" });
  }
  return "Mock AI Response";
}
```

```typescript
// vitest.config.ts
export default {
  test: {
    alias: {
      "@/services/ai": "./__mocks__/ai.ts",
    },
  },
};
```

### 快照测试（Snapshot）

对于 Prompt 不变的场景，用快照记录 AI 输出，后续比对差异。

```typescript
it("代码审查 prompt 应该生成稳定的输出格式", async () => {
  const result = await callAIReview(sampleCode);

  // 不比较具体内容，只验证结构
  expect(result).toHaveProperty("score");
  expect(result).toHaveProperty("issues");
  expect(result).toHaveProperty("summary");
  expect(typeof result.score).toBe("number");
  expect(Array.isArray(result.issues)).toBe(true);
});
```

### 真实调用测试（可选）

标记为慢测试，只在发布前或定时任务中运行。

```typescript
describe.skipIf(process.env.CI)("Real AI API Tests", () => {
  it("should translate correctly", async () => {
    const result = await callRealAI("Translate to Chinese: Hello world");
    expect(result).toContain("你好");
  }, 30000); // 30s 超时
});
```

---

## 层级四：监控和告警

上线后的运行时质量保障。

### 异常回复检测

```python
def check_ai_response(response: str, expected_format: str = "text") -> dict:
    alerts = []

    # 空回复
    if not response or not response.strip():
        alerts.append({"level": "critical", "msg": "AI 返回空内容"})

    # 拒绝回答
    refusal_patterns = ["I cannot", "I'm sorry", "作为 AI", "我无法"]
    if any(p in response for p in refusal_patterns):
        alerts.append({"level": "warning", "msg": "AI 可能拒绝了请求"})

    # JSON 格式检查
    if expected_format == "json":
        try:
            json.loads(response)
        except json.JSONDecodeError:
            alerts.append({"level": "error", "msg": "期望 JSON 但解析失败"})

    # 长度异常
    if len(response) < 10:
        alerts.append({"level": "warning", "msg": "回复异常短"})
    if len(response) > 10000:
        alerts.append({"level": "warning", "msg": "回复异常长"})

    return {"ok": len(alerts) == 0, "alerts": alerts}
```

### 成本异常预警

```python
async def check_cost_anomaly():
    today_cost = cost_tracker.get_daily_cost()
    avg_cost = cost_tracker.get_avg_daily_cost(days=7)

    if today_cost > avg_cost * 3:
        await send_alert(
            f"⚠️ 今日 AI 成本异常！当前 ${today_cost:.2f}，"
            f"近 7 日均值 ${avg_cost:.2f}"
        )
```

---

## 测试策略总结

| 层级 | 测什么 | 工具 | 运行频率 |
|------|--------|------|---------|
| **结构校验** | AI 输出格式是否正确 | Zod / JSON Schema | 每次调用 |
| **Prompt Eval** | Prompt 修改后效果是否变差 | 自写 Eval 框架 | 每次改 Prompt |
| **E2E Mock** | 业务流程是否正常 | Vitest + Mock | 每次提交 |
| **E2E Real** | 真实 AI 效果 | Vitest + 真实 API | 发布前 / 每周 |
| **运行时监控** | 线上质量和成本 | 日志 + 告警 | 实时 |

---

## 总结

1. **AI 测试的核心挑战**——输出非确定性，不能用精确匹配。
2. **结构校验**——用 Zod 验证 AI 输出的格式，这是最基础也最重要的。
3. **Prompt Eval**——建测试集，跑评分，确保 Prompt 改了不会变差。
4. **AI-as-Judge**——用 AI 评判 AI，适合"翻译质量"等模糊标准。
5. **Mock AI**——CI 中 Mock 掉 AI 调用，测试稳定且免费。
6. **运行时监控**——检测空回复、拒绝回答、成本异常。

---

> **下一篇预告**：[25 | AI 应用部署实战：Docker + CI/CD + 监控](/series/junior/25-deployment)

---

**讨论话题**：你怎么测试 AI 应用？遇到过 AI 输出"抽风"的情况吗？评论区聊聊。
