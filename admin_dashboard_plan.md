# 📋 智能刷题系统 - 管理员端设计与接口集成方案

本方案旨在为“离散数学在线智能刷题系统”扩展一个功能完备的**管理员端后台面板 (Admin Dashboard)**。管理员可直接通过该面板对系统用户、动态题库、Workers AI 模型和全局云端参数进行全方位的管理。

---

## 🏗️ 1. 架构与认证流设计

### 1.1 JWT 角色扩展
1.  **用户账户结构** (`user:account:${username}`) 新增可选属性 `role`: `"admin" | "user"`（默认为 `"user"`）。
2.  **默认管理员**：
    *   在登录或注册时，如果用户名为 `admin`，则系统自动将其 `role` 赋予 `"admin"`。
    *   管理员可通过管理面板提升其他普通用户为 `"admin"`。
3.  **JWT Payload 载荷**：在用户成功登录后，签发的 JWT 签名载荷中将包含 `role` 字段（例如：`{ userId, username, role }`），以便前端路由及菜单渲染进行权限控制。

### 1.2 后端接口中间件鉴权
在所有的管理员特权接口中，增加管理员角色验证拦截：
```javascript
const user = context.data.user;
if (!user || user.role !== "admin") {
  return new Response(JSON.stringify({ error: "未授权的操作，仅管理员可访问！" }), {
    status: 403,
    headers: { "Content-Type": "application/json" }
  });
}
```

---

## 📡 2. 后端管理员 API 接口集定义

为了接入全部所需管理能力，我们需要新建及更新以下接口文件：

### 2.1 用户管理接口 (`functions/api/admin/users.js`)
*   `GET /api/admin/users`：获取全站注册用户的画像列表。
    *   *实现细节*：使用 KV/R2 的 `list({ prefix: "user:profile:" })` 检索所有用户 Profile 键，并批量并行抓取填充为用户列表。
*   `POST /api/admin/users/role`：修改用户角色。
    *   *Body 参数*：`{ targetUsername, newRole }`
*   `POST /api/admin/users/delete`：强制删除用户账号及数据。
    *   *Body 参数*：`{ targetUserId, targetUsername }`

### 2.2 动态题库管理接口 (`functions/api/questions.js` & `functions/api/admin/questions.js`)
为了让题库可被编辑，系统将由“只读静态 questions.js”升级为“云端动态缓存库优先 + 本地 questions.js 静态兜底”的设计。
*   `GET /api/questions`（公开接口）：
    *   优先读取 KV/R2 键 `questions:custom`。如果不存在，则返回空，前端自适应兜底使用本地 `QUESTIONS`。
*   `POST /api/admin/questions/save`（管理接口）：
    *   添加或修改单条题目。
    *   *Body 参数*：`{ isNew, questionId, category, topic, question, answer, analysis, options }`
*   `POST /api/admin/questions/delete`（管理接口）：
    *   删除单条题目。
    *   *Body 参数*：`{ questionId }`

### 2.3 系统与 AI 设置接口 (`functions/api/admin/system.js`)
*   `GET /api/admin/system`：获取全站 AI 助教配置信息（如当前默认大语言模型型号、默认思考链开关状态等）。
*   `POST /api/admin/system`：修改这些参数。
    *   *Body 参数*：`{ defaultModel, defaultIntensity, forceShowThinking }`

---

## 🎨 3. 前端管理员后台 UI 设计 (SPA Views)

管理后台采用极简扁平化卡片网格设计，支持深浅双色主题，可通过侧边栏 Tab快速切换：

### 3.1 用户管理卡片 (User Manager Tab)
*   **用户统计卡片**：展示全站注册人数。
*   **搜索与过滤**：支持通过用户名模糊搜索用户。
*   **数据表格**：列出每个用户的：
    *   `头像/用户名`、`角色标签 (管理员/普通用户)`、`答题量/正确率`、`模考最高分`。
*   **交互操作**：
    *   **提升/降级角色**：一键切换 Admin/User。
    *   **删除账号**：二次警示确认后，永久擦除该用户数据。

### 3.2 题库管理卡片 (Question Manager Tab)
*   **题目看板**：展示当前云端已修改/新增的题量，并提供“添加新题”按钮。
*   **按分类/科目搜索**：按题型和知识点筛选题目列表。
*   **可视化编辑器**：
    *   左侧表单输入题干（支持 Markdown/LaTeX 实时编辑）。
    *   **右侧 LaTeX 即时公式渲染预览**（使用 KaTeX），方便管理员核对排版。
    *   动态选项列表：可随意添加/删除选择题选项。

### 3.3 系统与 AI 配置卡片 (System & AI Config Tab)
*   **AI 助教参数控制**：
    *   **模型下拉框**：选择 AI 助教使用的核心大模型（例如：`@cf/meta/llama-3.3-70b-instruct-fp8-fast`，`@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`）。
    *   **深度调试**：提供一个快速对话输入框，让管理员直接测试 AI 助教的 Socratic 启发式对话反应。
*   **云端统计总览**：集成 Workers 请求配额图表，方便直观调控限额。

---

## 📅 4. 实施阶段计划

*   **阶段一**：扩展 JWT 载荷、注册与登录逻辑，增加管理员角色标记；创建管理 API 并实现 KV/R2 列表解析。
*   **阶段二**：编写动态题库加载和保存的后端逻辑（`questions:custom`）并提供数据同步合并策略。
*   **阶段三**：在前端 `app.js` 构建全新的管理员控制台界面，实现用户数据展示、修改角色、删除用户与系统级 AI 模型设置功能。
*   **阶段四**：创建富文本题目编辑器，内嵌 KaTeX 实时预览公式，完成接口接入与全面测试。
