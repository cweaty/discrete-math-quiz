# 📚 离散数学在线智能刷题系统 (Discrete Math Quiz)

[![Built with Cloudflare](https://img.shields.io/badge/Hosted_on-Cloudflare_Pages-F38020?logo=cloudflare&logoColor=white)](https://pages.cloudflare.com)
[![Tech Stack](https://img.shields.io/badge/Stack-HTML5%20%7C%20CSS3%20%7C%20Vanilla_JS-blue?logo=javascript&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Math Rendering](https://img.shields.io/badge/Math_Engine-KaTeX-1A73E8?logo=latex&logoColor=white)](https://katex.org)
[![Animation Engine](https://img.shields.io/badge/Animation-GSAP-88CE02?logo=greensock&logoColor=white)](https://gsap.com)
[![AI Powered](https://img.shields.io/badge/AI_Tutor-Llama_3.3_Cloudflare_Workers_AI-FF6F00?logo=meta&logoColor=white)](https://developers.cloudflare.com/workers-ai/)

一个专为离散数学学习设计的**模块化、轻量级边缘计算刷题系统**。前端采用原生 HTML/CSS/JS 开发，引入强大的 KaTeX 与 GSAP 引擎以获得极佳的公式渲染与交互动效；后端依托 **Cloudflare Pages / Functions (Workers)** 边缘无服务器环境运行，并通过 **Cloudflare Workers AI (Llama 3.3)** 实现启发式的苏格拉底式 AI 助教答疑。

---

## ✨ 核心特性

### 1. 🧭 练习大厅 & 数据看板 (Lobby View)
*   **多维数据看板**：直观展示已答题数、总体正确率、错题本归档数量、收藏夹数量。
*   **科目掌握度分析**：以可视化的五大核心分类进度条（命题逻辑、谓词逻辑、集合论、二元关系、图论）展现用户掌握水平。
*   **自动保存与云端同步**：自动/手动多端同步本地做题进度、收藏夹与错题本数据，并提供注销账户的防误触安全校验。
*   **灵活练习开关**：支持“自动下一题（停留 1.5s 展示解析后自动跳转）”、“随机乱序”、“隐藏已做对题（专注攻克薄弱项）”等实用配置。

### 2. ✍️ 专业公式渲染与多题型作答 (Interactive Practice)
*   **LaTeX 完美渲染**：基于高性能 **KaTeX** 引擎，完美解析和渲染复杂的离散数学公式（支持行内与独行公式）。
*   **多题型完美适配**：支持判断题、单选题、填空题，以及需要书写推理过程的主观题。
*   **实时互动反馈**：作答后显示正确性状态、标准答案与详尽推导定理，错题自动收录至本地及云端错题本。

### 3. 🔮 启发式苏格拉底式 AI 助教 (Floating AI Tutor Drawer)
*   **苏格拉底教学法**：AI 助教拒绝直接提供答案，优先提供解题线索、相关概念拆解及思路引导，鼓励自主推导。
*   **显示思维链 (Chain of Thought)**：支持一键开关展示 Llama 3.3 模型的 `<think>` 思考推理日志。
*   **多维交互手势**：AI 悬浮窗支持在屏幕内自由拖拽、缩放尺寸，并可一键最小化为悬浮小球，移动端则自动适配为优雅的底部半屏抽屉。
*   **一键快捷提问**：预设“提供一步步提示”、“讲解涉及定理原理”等一键提问快捷键。

### 4. 📝 模拟考试模式 (Exam Session)
*   **智能随机组卷**：随机从五大分类题库中抽取 20 道题目混合组卷，全面考察掌握情况。
*   **沉浸式考场体验**：限制 60 分钟作答，顶部配有倒计时提醒（最后 5 分钟红色闪烁），底栏提供答题卡抽屉可随时查看整体进度。
*   **成绩分析报告**：交卷后立即展示环形正确率图表、答题耗时、得分及错题对照，并可一键将成绩同步至云端排行榜。

### 5. 🏆 全球排行榜与留言板 (Leaderboard & Discussions)
*   **实时学术排行榜**：拉取全服前 50 名高分用户，按“模拟考试最高分 -> 已答题数 -> 平均正确率”的优先级进行金银铜牌动态排序。
*   **双层级讨论空间**：提供“大厅全局留言板”与“题目专属讨论区”两个层级的学术讨论板，支持留言流实时同步。

### 6. 📡 边缘资源配额看板 (Cloud Resources Quota)
*   **资源透明公开**：自动监测和展示绑定的 Cloudflare 账户额度，包括今日 Workers/Pages 请求数、Workers AI Neurons 消耗，以及每日 UTC 午夜（北京时间早 8:00）的重置倒计时。
*   **高度自定义配置**：支持配置免费版账户、付费版账户以及自定义请求数限制。系统将根据您的设定自适应调整全局进度条展示。

---

## 🛠️ 技术栈

*   **前端核心**：HTML5, CSS3 (CSS Variables, Flexbox/Grid 响应式布局), Vanilla JS (ES6+)
*   **数学引擎**：[KaTeX](https://katex.org/) (超快速 LaTeX 渲染)
*   **动画库**：[GSAP (GreenSock Animation Platform)](https://gsap.com/) (极佳的交互与微动效过渡)
*   **Markdown 解析**：[marked.js](https://github.com/markedjs/marked)
*   **边缘托管 & 运行环境**：[Cloudflare Pages](https://pages.cloudflare.com)
*   **边缘计算后端**：[Cloudflare Pages Functions](https://developers.cloudflare.com/pages/platform/functions/) (基于 V8 Isolate 的边缘 Workers)
*   **数据库 & 存储**：Cloudflare KV (用户会话与留言流存储) / D1 SQL Database / GraphQL Analytics API

---

## 📂 项目目录结构

```text
├── .agents/                    # 智能体工作目录及技能规范
├── functions/                  # Cloudflare Pages Functions 后端接口目录
│   └── api/
│       ├── auth/               # 注册、登录、修改密码、注销等接口
│       ├── cf-usage.js         # 云端资源配额（Workers/Pages/AI）查询代理接口
│       └── comments.js         # 留言板与题目讨论接口
├── libs/                       # 本地第三方库（如 KaTeX, GSAP 等）
├── index.html                  # 系统的唯一单页面入口（SPA）
├── app.js                      # 前端应用核心状态与交互逻辑（含 SPA 路由）
├── animations.js               # 基于 GSAP 的页面和抽屉动画切换逻辑
├── questions.js                # 离散数学题库静态数据（内含命题逻辑、谓词逻辑等分类题目）
├── style.css                   # 全局样式系统与深浅双色主题设计
├── package.json                # 后端及本地开发脚手架依赖
└── README.md                   # 本说明文档
```

---

## 🚀 本地开发与调试

本系统依托 Cloudflare 开发环境构建，您可以使用 `wrangler` 工具在本地进行全栈级别的模拟开发。

### 1. 克隆与依赖安装
确保您已安装 [Node.js](https://nodejs.org/)。在根目录下运行：
```bash
npm install
```

### 2. 启动本地开发服务
使用 Wrangler 在本地模拟运行 Pages Functions 后端环境：
```bash
npx wrangler pages dev ./
```
运行后，可以在浏览器中打开 `http://localhost:8788` 进行前端与后端接口的联调与测试。

---

## ☁️ 部署至 Cloudflare Pages

离散数学智能刷题系统非常适合零成本部署到 Cloudflare Pages 上。

### 1. 在 Cloudflare 控制台新建项目
1.  登录您的 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2.  进入 **Workers & Pages** -> **Create application** -> **Pages**。
3.  连接您的 GitHub 仓库并选择该项目仓库 `discrete-math-quiz`。

### 2. 配置构建参数
在 Pages 部署设置中，填写以下参数：
*   **Project name**：自定义项目名称（如 `discrete-math-quiz`）
*   **Production branch**：`main`
*   **Framework preset**：选择 `None` (或者保持默认不填)
*   **Build command**：不填 (项目为原生 SPA，无需编译步骤)
*   **Build output directory**：`./` (即根目录)

### 3. 配置绑定关系 (Bindings)
为了让留言板和登录功能正常运转，您需要在 Cloudflare Pages 项目设置中绑定 **KV 命名空间**：
1.  在项目设置中，进入 **Settings** -> **Functions**。
2.  在 **KV namespace bindings** 下，分别在 **Production** 和 **Preview** 环境下点击 **Add binding**：
    *   **Variable name**：`KV`
    *   **KV namespace**：选择或新建一个您的 Cloudflare KV 空间。

### 4. 自动集成构建与上线
保存并部署。此后每次您将代码推送（`git push`）到 GitHub 仓库，Cloudflare 都会自动拉取并重构，几秒内即可同步上线。
