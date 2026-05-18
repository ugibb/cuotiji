# Task List：AI 错题集 MVP

> 版本：v2.0
> 日期：2026-05-01
> 对应 PRD：010-prd.md
> 决策记录：WebSocket 实现批改进度推送（@fastify/websocket）；家长端推迟至下一迭代

---

## 进度总览（2026-05-01）

| Sprint | 任务 | 优先级 | 状态 |
|--------|------|--------|------|
| Sprint 0 | T-001 ~ T-003 | P0 基础 | 已完成 |
| Sprint 1 | T-101 ~ T-104 | P0 核心 | 已完成 |
| Sprint 2 | T-201 ~ T-203 | P0 核心 | 已完成 |
| Sprint 3 | T-301 ~ T-304 | P1 | 已完成（T-304 订阅消息待上线后申请模板） |
| Sprint 4 | T-401 ~ T-402 | P1 | **进行中（批次1）** |
| Sprint 4 | T-403 导出 | P2 | 下一迭代 |
| Sprint 5 | T-501 ~ T-503 家长端 | P2 | 推迟至下一迭代 |
| Sprint 6 | T-601 ~ T-603 | P1 上线 | **进行中（批次3）** |
| Sprint 6 | T-604 提审 | P1 上线 | 待完成 |

---

## 批次 1：P0 核心接口补全（当前执行中）

### T-WS：WebSocket 批改进度推送

**背景**：用户决策选择 A——用 WebSocket 替代 loading 页轮询，提升实时性与体验。

- 安装并注册 `@fastify/websocket`
- 新增 `GET /api/ws/assignment/:id` WebSocket 端点
  - 连接后鉴权（query param `token`）
  - 订阅该 assignment 的状态变化
  - 服务端 processAssignment 流水线每个阶段完成时，向订阅该 assignmentId 的客户端推送：
    ```json
    { "type": "progress", "status": "ocr_done", "progress": 45, "detail": "OCR 完成，AI 批改中..." }
    ```
  - 批改完成时推送 `graded` 消息，连接可关闭
- 小程序 loading 页：改用 `wx.connectSocket` 接入 WebSocket，保留轮询作为降级兜底
- **完成标准**：上传图片后 loading 页通过 WebSocket 实时收到进度，不再依赖定时轮询；WebSocket 连接断开时自动降级到轮询

### T-401：冲刺计划创建 API

- 新增数据表 `sprint_plans`（字段：id, studentId, subject, examDate, createdAt）
- `POST /api/sprint-plans`：创建冲刺计划，返回倒计时天数
- `GET /api/sprint-plans/active?studentId=X`：获取当前有效冲刺计划（examDate >= today）
- **完成标准**：接口可正常 CRUD，返回格式符合 ApiResponse 标准；首页可展示倒计时卡片所需数据

### T-402：冲刺复习页面数据接口

- `GET /api/sprint-plans/:id/problems?studentId=X`：返回与冲刺相关的全部未掌握错题（masteredAt IS NULL）
- `POST /api/sprint-plans/:id/progress`：记录冲刺复习进度（已复习题目 ids）
- 小程序：新增 `pages/sprint/index` 页面，接入冲刺 API，展示卡片翻转复习流程与进度条
- **完成标准**：冲刺复习流程可完整跑通，进度记录准确

---

## 批次 2：小程序剩余页面完善

### T-MP-REVIEW：review 页面增强

- 现状：review/index.ts 已接入 `/review/daily`、`/review/problems/:id/mark`、`/review/checkin`
- 补充：接入 `/review/streak` 获取连击天数，首次进入页面展示当前连击
- **完成标准**：review 页面展示连击天数，打卡后实时更新

### T-MP-ANALYSIS：analysis 页面增强

- 现状：analysis/index.ts 已接入 `/analytics/weakpoints`
- 补充：支持点击薄弱知识点跳转 problem-list，传入 `chapterId` 参数（已有 onChapterTap handler，确认路由正确）
- 确认 `/analytics/chapter-problems` 路由在 problem-list 页中被正确调用
- **完成标准**：薄弱点点击后跳转到对应错题列表，数据展示正确

### T-MP-MINE：mine 页面增强

- 现状：mine/index.ts 已接入 studentsApi，展示学生信息和通知设置
- 补充：展示连击天数（调用 `/review/streak`）；展示本月打卡率（调用 `/review/daily` 结合本月日历数据）
- **完成标准**：mine 页面展示连击天数和本月打卡统计

---

## 批次 3：边界处理 + 合规 + 全链路测试

### T-601：错误处理与边界情况

- 网络失败时的友好 Toast 提示和重试按钮（camera/loading/summary 页）
- 识别失败时（status = error）跳转手动输入兜底流程
- 数据为空时的引导页（新用户首次进入 home 页无训练计划时，展示「开始第一次练习」引导）
- assignments list 接入真正分页：`GET /api/assignments?page=1&limit=20`
- **完成标准**：所有边界情况有友好处理，无白屏崩溃

### T-602：性能优化

- 图片加载懒加载（problem-list 页缩略图）
- assignments 列表分页（每次加载 20 条，上拉加载更多）
- **完成标准**：分页逻辑正确，不重复加载

### T-603：合规处理

- 新增 `pages/privacy/index` 页面（隐私政策 + 用户协议 + 未成年人声明）
- mine 页面添加「隐私政策」入口链接
- 使用时长提示：累计使用超过 40 分钟时在 app.ts 中触发 `wx.showModal` 提示休息
- **完成标准**：合规内容完整，微信小程序审核标准可通过

### T-TEST：全链路测试补全

- 服务端测试覆盖率目标 >= 80%
- 补充测试：WebSocket 连接/推送逻辑、冲刺计划 CRUD、分页接口
- 小程序测试：核心用户流程 E2E 用例（拍照上传 → loading → summary → problem-detail → review）
- **完成标准**：`vitest --coverage` 输出覆盖率 >= 80%；核心流程测试通过

---

## Sprint 0：项目基础搭建（已完成）

### T-001 微信小程序项目初始化 [已完成]
- 微信小程序 TypeScript 项目初始化
- 基础路由和页面框架搭建完毕
- app.ts 含微信登录流程

### T-002 后端项目初始化 [已完成]
- Fastify + TypeScript + PostgreSQL（Prisma ORM）
- 核心数据表全部建立（users/students/chapters/training_plans/assignments/problems/dialogues/review_sessions/daily_check_ins）
- RESTful API 框架完整

### T-003 AI 识别服务集成 [已完成]
- OCR 服务（ocr.service.ts）接入
- AI 批改服务（ai.service.ts）接入 Claude API
- 完整 processAssignment 异步流水线

---

## Sprint 1：核心录入功能（已完成）

### T-101 拍照上传页面 [已完成]
- pages/camera/index.ts：wx.chooseMedia + presign 上传 + 跳转 loading

### T-102 AI 识别结果展示 [已完成]
- pages/summary/index.ts：展示批改结果，可查看题目列表
- pages/problem-detail/index.ts：详情 + AI 对话

### T-103 错题列表页 [已完成]
- pages/problem-list/index.ts：按 assignmentId 或 chapterId 展示题目列表

### T-104 错题详情页 [已完成]
- pages/problem-detail/index.ts：完整题目 + 知识点 + AI 对话

---

## Sprint 2：薄弱点分析（已完成）

### T-201 知识点体系 [已完成]
- prisma/seed.ts 预置章节数据

### T-202 薄弱点分析统计接口 [已完成]
- GET /api/analytics/weakpoints：返回 TOP N 薄弱知识点

### T-203 薄弱点可视化页面 [已完成]
- pages/analysis/index.ts：接入 weakpoints API，展示薄弱点

---

## Sprint 3：复习与打卡（已完成）

### T-301 每日复习题目生成 [已完成]
- GET /api/review/daily：Ebbinghaus 遗忘曲线算法

### T-302 复习卡片页面 [已完成]
- pages/review/index.ts：卡片翻转 + 标记掌握/需练习

### T-303 每日打卡功能 [已完成]
- POST /api/review/checkin：幂等打卡 + 连击计算
- GET /api/review/streak：获取当前连击天数

### T-304 推送通知 [部分完成]
- 订阅消息模板需上线后向微信申请，当前预留接口

---

## 技术选型

| 模块 | 技术 | 状态 |
|------|------|------|
| 小程序前端 | 原生小程序 + TypeScript | 已用 |
| 后端框架 | Node.js + Fastify v5 | 已用 |
| 实时推送 | @fastify/websocket | 待接入（批次1）|
| 数据库 | PostgreSQL + Prisma ORM | 已用 |
| 云服务 | 腾讯云 COS（presign 上传）| 已用 |
| OCR 识别 | 腾讯云 OCR | 已用 |
| AI 批改 | Claude API（claude-haiku-4-5）| 已用 |
| 测试 | Vitest | 已用，覆盖率待达标 |
