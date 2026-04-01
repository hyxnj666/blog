---
title: "AI + 低代码：用自然语言生成页面 / 表单 / 图表"
description: "用 AI 生成 JSON Schema 表单、ECharts 图表和 Vue 组件代码"
order: 17
cover: "./cover.png"
publishDate: "2025-09-19"
tags: ["AI", "低代码", "ECharts", "Vue", "前端"]
---

# AI + 低代码：用自然语言生成页面 / 表单 / 图表

> 本文是【前端转 AI 全栈实战】系列第 17 篇。
> 上一篇：[AI Agent 模式：让 AI 不只是回答问题，还能执行任务](/series/junior/16-ai-agent) | 下一篇：[MCP 入门：AI 世界的"USB 接口"，前端写 Server 天然适配](/series/junior/18-mcp-intro)

---

## 这篇文章你会得到什么

前面你做了 RAG 和 Agent。今天换一个更贴近前端本行的方向——**用 AI 生成 UI**。

想象一下：

- 产品说"给我做一个用户注册表单"，你让 AI 生成 JSON Schema → 动态渲染
- 老板说"做一个本月销售趋势图"，你让 AI 生成 ECharts 配置 → 直接出图
- 设计师说"参考这个风格做一个卡片列表"，AI 直接输出 Vue 组件代码

这就是 **AI + 低代码**——前端最能发挥优势的 AI 应用方向。因为你懂组件、懂 Schema、懂渲染——AI 只需要生成"数据"，你负责把数据变成 UI。

---

## 核心思路：AI 生成数据，前端渲染

传统低代码平台：用户拖拽组件 → 生成 JSON 配置 → 渲染器解析渲染。

AI 低代码：用户说一句话 → AI 生成 JSON 配置 → **同一个渲染器**解析渲染。

```
传统: 用户拖拽 → JSON Schema → 渲染器 → UI
AI:   自然语言 → AI → JSON Schema → 渲染器 → UI
```

关键洞察：**渲染器不需要改**。你只需要把"用户拖拽"的输入换成"AI 生成"的输入。

---

## 场景一：AI 生成表单

### Prompt 设计

```python
FORM_SYSTEM_PROMPT = """你是一个表单设计专家。根据用户的描述生成 JSON Schema 表单配置。

## 输出格式
严格输出以下 JSON 格式：
{
  "title": "表单标题",
  "fields": [
    {
      "key": "字段名（英文）",
      "label": "显示名称（中文）",
      "type": "text | number | email | select | date | textarea | checkbox | radio",
      "required": true/false,
      "placeholder": "占位提示",
      "options": [{"label": "选项名", "value": "值"}],  // 仅 select/radio
      "rules": [{"type": "min|max|pattern", "value": "值", "message": "提示"}]
    }
  ]
}

## 规则
- key 用 camelCase
- 必填字段 required 设 true
- 合理推断字段类型（邮箱用 email，手机号用 text+pattern）
- 只输出 JSON，不要任何解释"""
```

### 后端 API

```python
@router.post("/api/ai/form")
async def generate_form(req: dict):
    description = req["description"]

    response = await client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": FORM_SYSTEM_PROMPT},
            {"role": "user", "content": description},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )

    schema = json.loads(response.choices[0].message.content)
    return schema
```

### 前端渲染器

```vue
<!-- components/DynamicForm.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue'

interface FormField {
  key: string
  label: string
  type: string
  required?: boolean
  placeholder?: string
  options?: { label: string; value: string }[]
}

const props = defineProps<{
  schema: { title: string; fields: FormField[] }
}>()

const formData = ref<Record<string, any>>({})

function handleSubmit() {
  console.log('表单数据:', formData.value)
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="dynamic-form">
    <h3>{{ schema.title }}</h3>

    <div v-for="field in schema.fields" :key="field.key" class="form-field">
      <label>
        {{ field.label }}
        <span v-if="field.required" class="required">*</span>
      </label>

      <input
        v-if="['text', 'email', 'number', 'date'].includes(field.type)"
        v-model="formData[field.key]"
        :type="field.type"
        :placeholder="field.placeholder"
        :required="field.required"
      />

      <textarea
        v-else-if="field.type === 'textarea'"
        v-model="formData[field.key]"
        :placeholder="field.placeholder"
        rows="3"
      />

      <select
        v-else-if="field.type === 'select'"
        v-model="formData[field.key]"
      >
        <option value="">请选择</option>
        <option
          v-for="opt in field.options"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </select>

      <div v-else-if="field.type === 'radio'" class="radio-group">
        <label v-for="opt in field.options" :key="opt.value">
          <input
            type="radio"
            v-model="formData[field.key]"
            :value="opt.value"
          />
          {{ opt.label }}
        </label>
      </div>
    </div>

    <button type="submit">提交</button>
  </form>
</template>
```

### 效果

```
用户输入："做一个员工请假申请表单，包含姓名、部门（下拉选：技术部/产品部/设计部/运营部）、
         请假类型（年假/事假/病假）、开始日期、结束日期、请假原因"

AI 生成 → 渲染器 → 一个完整的请假表单，字段类型、选项、必填校验全部自动生成
```

---

## 场景二：AI 生成图表

### Prompt 设计

```python
CHART_SYSTEM_PROMPT = """你是一个数据可视化专家。根据用户的描述生成 ECharts 配置。

## 输出格式
严格输出 ECharts option 的 JSON 配置，可直接传给 echarts.setOption()。

## 规则
- 如果用户提供了数据，使用真实数据
- 如果没有数据，生成合理的示例数据
- 图表类型根据数据特点自动选择（趋势用折线图，对比用柱状图，占比用饼图）
- 添加 tooltip、legend 等交互功能
- 使用美观的配色方案
- 只输出 JSON，不要解释"""
```

### 前端渲染

```vue
<!-- components/AIChart.vue -->
<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps<{ option: any }>()
const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

onMounted(() => {
  if (chartRef.value) {
    chart = echarts.init(chartRef.value)
    chart.setOption(props.option)
  }
})

watch(() => props.option, (newOption) => {
  chart?.setOption(newOption, true)
})
</script>

<template>
  <div ref="chartRef" style="width: 100%; height: 400px" />
</template>
```

### 效果

```
用户输入："帮我画一个最近 6 个月的销售趋势图，数据大概是 1月120万 2月98万 
         3月145万 4月132万 5月168万 6月189万"

AI 生成 ECharts 配置 → 一个带折线图、tooltip、数据标签的销售趋势图
```

```
用户输入："做一个部门人数占比的饼图，技术部 45 人，产品部 12 人，
         设计部 8 人，运营部 15 人，行政部 6 人"

AI 生成 → 一个带 legend、百分比标签的饼图
```

---

## 场景三：AI 生成组件代码

更进一步——直接让 AI 生成 Vue/React 组件代码，在线预览。

### Prompt

```python
COMPONENT_SYSTEM_PROMPT = """你是一个前端组件开发专家。根据用户描述生成 Vue 3 单文件组件代码。

## 规则
- 使用 Vue 3 Composition API + <script setup>
- 使用内联 scoped 样式
- 代码完整可运行
- 设计美观，使用现代 CSS（flexbox/grid、圆角、阴影）
- 配色使用深色主题
- 只输出组件代码，用 ```vue 包裹"""
```

### 动态渲染

```typescript
// 简化方案：用 iframe + srcdoc 在线预览
function renderComponent(code: string) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="https://unpkg.com/vue@3/dist/vue.global.js"><\/script>
    </head>
    <body>
      <div id="app"></div>
      <script>
        const { createApp, ref, computed, onMounted } = Vue
        // 从 AI 生成的代码中提取逻辑
        ${extractSetup(code)}
        createApp(App).mount('#app')
      <\/script>
    </body>
    </html>
  `
  return html
}
```

生产环境可以用 `@vue/compiler-sfc` 做真正的运行时编译，或者用 StackBlitz SDK 在线编辑运行。

---

## 完整的 AI 低代码平台

把三个场景组合起来，做一个"说话就能出 UI"的平台。

### 架构

```
用户输入自然语言
       ↓
AI 路由（判断用户想要什么）
       ↓
    ┌─────────┬──────────┬──────────┐
    │ 表单生成  │ 图表生成   │ 组件生成   │
    │ JSON     │ ECharts  │ Vue SFC  │
    └─────────┴──────────┴──────────┘
       ↓
对应的渲染器
       ↓
实时预览
```

### AI 路由

```python
ROUTER_PROMPT = """判断用户想要生成什么类型的内容。只输出一个单词：
- form：表单
- chart：图表/数据可视化
- component：UI 组件/页面
- unknown：无法判断"""

async def route_request(description: str) -> str:
    response = await client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": ROUTER_PROMPT},
            {"role": "user", "content": description},
        ],
        temperature=0,
        max_tokens=10,
    )
    return response.choices[0].message.content.strip().lower()
```

```python
@router.post("/api/ai/generate")
async def generate(req: dict):
    description = req["description"]
    route = await route_request(description)

    if route == "form":
        return await generate_form(description)
    elif route == "chart":
        return await generate_chart(description)
    elif route == "component":
        return await generate_component(description)
    else:
        return {"error": "无法理解你的需求，请描述得更具体"}
```

---

## Prompt 设计的关键技巧

### 1. 约束输出格式

AI 生成的数据要被代码解析——格式不能有任何偏差。

```
❌ "请生成一个表单"
✅ "严格输出 JSON 格式，不要输出 JSON 之外的任何内容"
```

### 2. 给出完整 Schema

```
❌ "生成 ECharts 配置"
✅ "生成可直接传给 echarts.setOption() 的 JSON 配置，
    包含 title、tooltip、legend、xAxis、yAxis、series"
```

### 3. 用 `response_format` 强制 JSON

```python
response = await client.chat.completions.create(
    model="deepseek-chat",
    response_format={"type": "json_object"},
    # ...
)
```

### 4. 容错解析

即使做了以上所有措施，AI 偶尔还是会输出格式不对的内容。永远做容错——[第 6 篇](/series/junior/06-prompt-engineering)的 `parseAIJson` 函数这里又用上了。

---

## 前端开发者的独特优势

做 AI + 低代码，前端的优势是碾压级的：

| 能力 | 前端优势 |
|------|---------|
| **理解 UI Schema** | 你知道什么样的 JSON 能渲染成什么 UI |
| **组件系统** | 你有现成的组件库（Element Plus / Ant Design） |
| **渲染引擎** | 你懂 Virtual DOM、动态组件、运行时编译 |
| **数据可视化** | 你用过 ECharts / D3 / Chart.js |
| **交互设计** | 你知道什么样的 UI 用户体验好 |

后端工程师做 AI 低代码？他们还得先学前端。
AI 工程师做 AI 低代码？他们的 UI 审美堪忧。
**前端 + AI = 这个方向的最佳人选。**

---

## 总结

1. **AI 低代码的核心**：AI 生成数据（JSON/配置/代码），前端渲染器不变。
2. **三个实用场景**：表单生成（JSON Schema）、图表生成（ECharts 配置）、组件生成（Vue/React 代码）。
3. **Prompt 是关键**——约束输出格式、给完整 Schema、用 `response_format`、做容错。
4. **AI 路由**：一个路由层判断用户意图，分发到不同的生成器。
5. **前端做这个有天然优势**——理解 UI Schema、组件系统、渲染引擎都是现有技能。

第四阶段"AI 全栈应用开发"到这里结束。你已经会了 Python 后端、全栈聊天应用、RAG、Agent、AI 低代码——这是一个 AI 全栈工程师的核心技能包。

**下一篇**，我们进入第五阶段——MCP 协议，AI 世界的"USB 接口"，前端写 MCP Server 天然适配。

---

> **下一篇预告**：[18 | MCP 入门：AI 世界的"USB 接口"，前端写 Server 天然适配](/series/junior/18-mcp-intro)

---

**讨论话题**：你觉得 AI + 低代码最有价值的场景是什么？表单？图表？还是直接生成页面代码？评论区聊聊。
