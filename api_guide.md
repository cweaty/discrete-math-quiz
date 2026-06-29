# 📡 离散数学刷题系统 - 接口 (API) 设计文档

本系统所有的后端 API 均部署在 Cloudflare Pages Functions 边缘端点上。基准路径为 `/api`。
除了公开接口外，受保护的接口需要通过 HTTP 请求头携带 `Authorization: Bearer <JWT_TOKEN>` 凭证通过认证中间件。

---

## 🔒 一、 用户认证接口 (Authentication API)

### 1. 用户注册 (Signup)
*   **接口路径**：`POST /api/auth/register`
*   **请求类型**：公开接口
*   **请求体格式**：`application/json`
*   **请求参数**：
    ```json
    {
      "username": "example_user",
      "password": "example_password"
    }
    ```
*   **返回参数 (201 Created)**：
    ```json
    {
      "message": "注册成功！现在可以进行登录。"
    }
    ```
*   **错误返回 (409 Conflict)**：
    ```json
    {
      "error": "该用户名已被注册！"
    }
    ```

### 2. 用户登录 (Login)
*   **接口路径**：`POST /api/auth/login`
*   **请求类型**：公开接口
*   **请求参数**：
    ```json
    {
      "username": "example_user",
      "password": "example_password"
    }
    ```
*   **返回参数 (200 OK)**：
    ```json
    {
      "message": "登录成功！",
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "profile": {
        "userId": "usr_9f8d1c...",
        "username": "example_user",
        "answeredCount": 12,
        "correctRate": 83,
        "examHighScore": 90,
        "updatedAt": 1782619763
      },
      "data": {
        "bookmarks": ["q1", "q5"],
        "wrongQuestions": ["q3"],
        "answered": {
          "q1": { "isCorrect": true, "userAnswer": "A", "timestamp": 1782619760 },
          "q3": { "isCorrect": false, "userAnswer": "B", "timestamp": 1782619762 }
        }
      }
    }
    ```

### 3. 注销/抹除账号 (Delete Account)
*   **接口路径**：`POST /api/auth/delete`
*   **请求类型**：🔑 **需要授权** (`Authorization: Bearer <TOKEN>`)
*   **请求参数**：无
*   **返回参数 (200 OK)**：
    ```json
    {
      "message": "您的账号及所有云端刷题记录已成功注销并永久抹除！"
    }
    ```

---

## 📈 二、 作答进度同步接口 (Progress API)

### 1. 获取当前用户云端进度 (Get Progress)
*   **接口路径**：`GET /api/progress`
*   **请求类型**：🔑 **需要授权**
*   **返回参数 (200 OK)**：
    ```json
    {
      "profile": {
        "userId": "usr_...",
        "username": "example_user",
        "answeredCount": 12,
        "correctRate": 83,
        "examHighScore": 90,
        "updatedAt": 1782619763
      },
      "data": {
        "bookmarks": ["q1"],
        "wrongQuestions": ["q3"],
        "answered": {
          "q1": { "isCorrect": true, "userAnswer": "A", "timestamp": 1782619760 }
        }
      }
    }
    ```

### 2. 同步与提交进度 (Sync Progress)
*   **接口路径**：`POST /api/progress`
*   **请求类型**：🔑 **需要授权**
*   **请求参数**：
    ```json
    {
      "bookmarks": ["q1", "q2"],
      "wrongQuestions": ["q3"],
      "answered": {
        "q1": { "isCorrect": true, "userAnswer": "A", "timestamp": 1782619760 }
      },
      "examHighScore": 95
    }
    ```
*   **后台逻辑**：写入 R2/KV 数据并重新计算正确率，自动更新全局排行榜名单并排序。
*   **返回参数 (200 OK)**：
    ```json
    {
      "message": "同步成功！",
      "profile": { "answeredCount": 1, "correctRate": 100, "examHighScore": 95, ... },
      "leaderboard": [ ... ]
    }
    ```

---

## 🏆 三、 全球排行榜接口 (Leaderboard API)

### 1. 获取全球排行榜前 50 名 (Get Leaderboard)
*   **接口路径**：`GET /api/leaderboard`
*   **请求类型**：公开接口
*   **返回参数 (200 OK)**：
    ```json
    [
      {
        "userId": "usr_9f8d1c...",
        "username": "Tonyat",
        "answeredCount": 150,
        "examHighScore": 100,
        "correctRate": 98
      },
      {
        "userId": "usr_4a8c1e...",
        "username": "Student_B",
        "answeredCount": 84,
        "examHighScore": 90,
        "correctRate": 85
      }
    ]
    ```

---

## 💬 四、 留言讨论接口 (Comments API)

### 1. 获取单题评论列表 (Get Comments)
*   **接口路径**：`GET /api/comments?q={questionId}` 或 `GET /api/comments?qId={questionId}`
*   **请求类型**：公开接口
*   **URL 参数**：`q` 或 `qId` (例如 `q19`)
*   **返回参数 (200 OK)**：
    ```json
    [
      {
        "username": "Tonyat",
        "content": "这道等价命题化简的第3步好巧妙！",
        "timestamp": 1782619760000
      }
    ]
    ```

### 2. 发表题目留言 (Post Comment)
*   **接口路径**：`POST /api/comments`
*   **请求类型**：🔑 **需要授权**
*   **请求参数**：
    ```json
    {
      "qId": "q19",
      "content": "我卡在第2步了，有人能解答下吗？"
    }
    ```
*   **后端控制**：自动截取最新的 50 条留言保留，剔除历史冗余以保护存储。
*   **返回参数 (200 OK)**：返回该题更新后的完整最新评论列表。
    ```json
    [
      { "username": "Tonyat", "content": "...", "timestamp": 1782619760000 },
      { "username": "Guest_User", "content": "我卡在第2步了，有人能解答下吗？", "timestamp": 1782619780000 }
    ]
    ```

---

## 🔮 五、 AI 智能助教接口 (AI Proxy API)

### 1. 启发式答疑聊天 (Chat Inference)
*   **接口路径**：`POST /api/ai`
*   **请求类型**：公开接口 (支持访客向 AI 提问)
*   **请求体格式**：`application/json`
*   **请求参数**：
    ```json
    {
      "messages": [
        { "role": "system", "content": "你是离散数学助教..." },
        { "role": "user", "content": "请给我提示这道题该怎么化简" }
      ]
    }
    ```
*   **返回格式**：`text/event-stream` (流式打字机 SSE 输出)
*   **数据段格式**：包含深度思考日志（包含在 `<think>...</think>` 中）和正式的 Markdown 公式答复内容。

---

## 📡 六、 Cloudflare 配额指标接口 (Cloudflare Usage API)

### 1. 获取平台资源当日用量 (Get Resource Usage)
*   **接口路径**：`POST /api/cf-usage`
*   **请求类型**：公开接口 (支持本地凭据覆盖)
*   **请求参数**（可选，留空则默认走后端 Base64 代理配置）：
    ```json
    {
      "accountId": "可选：覆盖云端 Account ID",
      "apiToken": "可选：覆盖云端 API Token"
    }
    ```
*   **接口核心逻辑**：并发请求 Cloudflare GraphQL API 数据集：
    *   `workersOverviewRequestsAdaptiveGroups`：计算全账户 Workers/Pages 请求数总和。
    *   `aiInferenceAdaptiveGroups`：计算 Workers AI 已消耗的算力 `totalNeurons`。
*   **返回参数 (200 OK)**：
    ```json
    {
      "workersRequests": 4,
      "pagesRequests": 3265,
      "totalRequests": 3269,
      "quota": 100000,
      "aiNeurons": 1231.49,
      "aiQuota": 10000,
      "secondsRemaining": 52642
    }
    ```
