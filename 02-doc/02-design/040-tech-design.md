# 奥数练习册 · 前后端详细技术设计方案

**版本：** v1.0  
**日期：** 2026-04-22  
**范围：** MVP 阶段完整技术方案，覆盖小程序前端、服务端 API、数据库、AI 能力集成

---

## 一、技术架构总览

```
┌─────────────────────────────────────────────────────────┐
│                   微信小程序（前端）                       │
│  首页 · 拍照 · 批改等待 · 题目复盘 · 我的               │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS / WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                    API 服务层（Node.js）                   │
│  RESTful API + WebSocket（实时批改进度推送）               │
└──────┬───────────────┬──────────────────┬───────────────┘
       │               │                  │
┌──────▼──────┐ ┌──────▼──────┐  ┌───────▼───────┐
│  MySQL 主库  │ │  Redis 缓存  │  │  对象存储 OSS  │
│  业务数据    │ │  会话/队列   │  │  试卷图片      │
└─────────────┘ └─────────────┘  └───────────────┘
       │
┌──────▼──────────────────────────────────────────────────┐
│                    AI 能力层                              │
│  OCR 识题（腾讯云）· Claude API（对话/归因）              │
│  微信订阅消息（家长推送）                                  │
└─────────────────────────────────────────────────────────┘
```

### 技术选型

| 层 | 技术 | 说明 |
|---|---|---|
| 小程序前端 | 微信原生小程序 | 兼容性最佳，直接调用微信能力 |
| 服务端 | Node.js + Express | 轻量，AI 流式输出适配好 |
| 数据库 | MySQL 8.0 | 关系型，保证数据一致性 |
| 缓存 | Redis 7 | 会话状态、AI 对话上下文 |
| 图片存储 | 腾讯云 COS | 与微信同生态，权限管理简单 |
| OCR | 腾讯云 OCR | 手写体识别，小学生笔迹适配好 |
| AI 对话 | Claude claude-sonnet-4-6 | 苏格拉底式追问，流式输出 |
| 消息推送 | 微信订阅消息 | 家长端异步通知 |

---

## 二、数据库设计

### 2.1 核心表结构

#### `users` 家长账号表

一个微信 openid 对应一个家长账号，家长名下可有多名学生。

```sql
CREATE TABLE users (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  openid        VARCHAR(64) NOT NULL UNIQUE,   -- 家长微信 openid
  nickname      VARCHAR(32),
  parent_phone  VARCHAR(20),                   -- 家长手机号（备用联系方式）
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME ON UPDATE CURRENT_TIMESTAMP
);
```

#### `students` 学生档案表

```sql
CREATE TABLE students (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id       BIGINT NOT NULL,               -- 关联家长账号 users.id
  name          VARCHAR(32) NOT NULL,          -- 学生姓名/昵称
  grade         TINYINT NOT NULL,              -- 年级（1-6）
  avatar        VARCHAR(512),                  -- 头像 URL
  is_default    TINYINT DEFAULT 0,             -- 是否为该账号默认学生
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
);
```

> 后续所有业务表（training_plans、assignments 等）以 `student_id` 关联学生，而非 `user_id`，实现多学生数据隔离。

#### `chapters` 知识章节表（预置数据）

```sql
CREATE TABLE chapters (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  code        VARCHAR(32) NOT NULL UNIQUE,      -- 'ch01_counting'
  name        VARCHAR(64) NOT NULL,             -- '第1章·计数原理'
  subtitle    VARCHAR(128),                     -- '加法原理 · 乘法原理 · 排列组合'
  grade       TINYINT NOT NULL DEFAULT 0,       -- 适用年级（1-6；0=全年级通用）
  sort_order  INT DEFAULT 0,
  is_active   TINYINT DEFAULT 1
);
```

#### `training_plans` 训练计划表

```sql
CREATE TABLE training_plans (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id  BIGINT NOT NULL,                  -- 关联 students.id
  project     VARCHAR(64) NOT NULL DEFAULT '小学奥数',  -- 训练项目（小学奥数/初中数竞/…）
  chapter_id  INT NOT NULL,
  plan_date   DATE NOT NULL,
  topic       VARCHAR(128),                     -- '余数基本运算'
  key_points  JSON,                             -- ["知识点1", "知识点2"]
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_project_date (student_id, project, plan_date),
  INDEX idx_student (student_id)
);
```

#### `assignments` 作业提交表

```sql
CREATE TABLE assignments (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id      BIGINT NOT NULL,              -- 关联 students.id
  chapter_id      INT NOT NULL,
  plan_date       DATE NOT NULL,                -- 对应训练日期
  image_url       VARCHAR(512) NOT NULL,        -- 原始试卷图片
  image_url_thumb VARCHAR(512),                 -- 缩略图
  status          ENUM('ocr_pending','ocr_done','grading','graded','reviewed') DEFAULT 'ocr_pending',
  total_count     INT DEFAULT 0,                -- 识别题目数
  correct_count   INT DEFAULT 0,
  wrong_count     INT DEFAULT 0,
  unknown_count   INT DEFAULT 0,
  mood_text       TEXT,                         -- AI 生成的情绪价值文案
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_student_date (student_id, plan_date)
);
```

#### `problems` 题目表

```sql
CREATE TABLE problems (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  assignment_id   BIGINT NOT NULL,
  seq             INT NOT NULL,                 -- 题目序号（1,2,3…）
  ocr_text        TEXT,                         -- OCR 识别的题目原文
  student_answer  VARCHAR(256),                 -- 学生作答（OCR 识别）
  correct_answer  VARCHAR(256),                 -- AI 给出的正确答案
  result          ENUM('correct','wrong','unknown') NOT NULL,
  knowledge_point VARCHAR(128),                 -- '鸡兔同笼·列方程法'
  trap_desc       TEXT,                         -- 这道题的坑
  solution_text   TEXT,                         -- AI 解题思路
  root_cause      TEXT,                         -- 错误归因（wrong/unknown 时）
  review_status   ENUM('pending','done') DEFAULT 'pending',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_assignment (assignment_id)
);
```

#### `dialogues` 对话记录表

```sql
CREATE TABLE dialogues (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  problem_id    BIGINT NOT NULL,
  role          ENUM('ai','student') NOT NULL,
  content       TEXT NOT NULL,
  audio_url     VARCHAR(512),                   -- 学生语音原始文件（可选留存）
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_problem (problem_id)
);
```

#### `review_sessions` 复盘会话表

```sql
CREATE TABLE review_sessions (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  assignment_id   BIGINT NOT NULL UNIQUE,
  started_at      DATETIME,
  completed_at    DATETIME,
  summary_text    TEXT,                         -- 复盘小结
  notified_parent TINYINT DEFAULT 0,            -- 是否已推送家长
  notified_at     DATETIME
);
```

---

## 三、API 设计

### 3.1 API 规范

- Base URL: `https://api.example.com/v1`
- 认证：微信 `code` 换取 `access_token`，后续请求 Header 带 `Authorization: Bearer <token>`
- 响应格式：
```json
{
  "code": 0,
  "msg": "ok",
  "data": { ... }
}
```

### 3.2 接口列表

#### 认证

| Method | Path | 说明 |
|--------|------|------|
| POST | `/auth/wx-login` | 微信 code 换取 token |

```json
// Request
{ "code": "wx_auth_code" }

// Response
{
  "token": "eyJ...",
  "user": { "id": 1, "nickname": "小明", "grade": 5 }
}
```

---

#### 训练计划

| Method | Path | 说明 |
|--------|------|------|
| GET | `/training-plans` | 获取某月训练计划（日历数据）|

```
Query: year=2026&month=4
```

```json
// Response
{
  "plans": [
    {
      "date": "2026-04-22",
      "chapter": "第4章·整除与余数",
      "topic": "余数基本运算",
      "key_points": ["余数的加法法则", "余数的乘法法则"],
      "assignment_status": "not_uploaded"
      // not_uploaded | uploaded_pending | completed
    }
  ]
}
```

---

#### 章节

| Method | Path | 说明 |
|--------|------|------|
| GET | `/chapters` | 获取全部章节列表 |

---

#### 作业提交

| Method | Path | 说明 |
|--------|------|------|
| POST | `/assignments` | 创建作业（上传图片后调用）|
| GET | `/assignments/:id` | 获取作业详情（含批改结果）|
| GET | `/assignments` | 历史作业列表 |

```json
// POST /assignments Request
{
  "chapter_id": 4,
  "plan_date": "2026-04-22",
  "image_url": "https://cos.../xxx.jpg"
}

// Response（立即返回，批改异步进行）
{
  "assignment_id": 1001,
  "status": "ocr_pending"
}
```

**批改状态通过 WebSocket 推送：**

```
WS: wss://api.example.com/v1/ws?token=xxx

// 服务端推送消息
{ "type": "grading_progress", "step": "ocr_done", "total": 5 }
{ "type": "grading_progress", "step": "grading", "current": 3, "total": 5 }
{ "type": "grading_done", "assignment_id": 1001, "redirect": "/summary" }
```

---

#### 题目与对话

| Method | Path | 说明 |
|--------|------|------|
| GET | `/assignments/:id/problems` | 获取题目列表（含批改结果）|
| GET | `/problems/:id` | 获取单题详情 |
| POST | `/problems/:id/dialogue` | 发送语音/文字，获取 AI 回复（流式）|

```json
// POST /problems/:id/dialogue Request
{
  "content": "我设 x 是鸡的数量，然后鸡有 4 只脚…",
  "type": "text"    // text | audio_transcribed
}

// Response（SSE 流式）
data: {"delta": "找到了！"}
data: {"delta": "🎉 鸡是 2 只脚"}
data: {"delta": "，兔才是 4 只脚"}
data: {"type": "done", "full": "找到了！🎉 鸡是 2 只脚，兔才是 4 只脚…"}
```

---

#### 复盘完成

| Method | Path | 说明 |
|--------|------|------|
| POST | `/assignments/:id/complete-review` | 标记复盘完成，触发家长推送 |

```json
// Response
{
  "summary": "今天攻克了 1 个错题归因，搞懂了 1 道不会的题…",
  "parent_notified": true
}
```

---

#### 图片上传预签名

| Method | Path | 说明 |
|--------|------|------|
| POST | `/upload/presign` | 获取 COS 预签名 URL，前端直传 |

```json
// Response
{
  "upload_url": "https://cos.../put-presigned-url",
  "file_url": "https://cos.../xxx.jpg"
}
```

---

## 四、前端页面设计

### 4.1 页面路由结构

```
pages/
├── home/index              首页（训练日历）
├── chapter/index           选择章节
├── camera/index            拍照上传
├── loading/index           批改等待
├── summary/index           作业汇总
├── problem-list/index      题目列表
├── problem-detail/index    题目详情（wrong/correct/unknown 共用，参数区分）
├── review-done/index       复盘完成
└── mine/index              我的
```

### 4.2 页面状态管理

使用小程序原生 `globalData` 管理跨页面状态：

```javascript
// app.js
App({
  globalData: {
    token: null,
    userInfo: null,
    // 当前作业上下文（拍照→批改→复盘全流程共享）
    currentAssignment: {
      id: null,
      chapterId: null,
      planDate: null,
      problems: []
    }
  }
})
```

### 4.3 关键页面逻辑

#### 首页 · 训练日历

```javascript
// 日历格子状态判断逻辑
function getDayStatus(date, plansMap, assignmentsMap) {
  const plan = plansMap[date];
  const assignment = assignmentsMap[date];
  const isPast = new Date(date) <= new Date();

  if (!plan) return 'no_plan';                           // 灰色，无任务
  if (!assignment && isPast) return 'not_uploaded';      // 浅红，未上传
  if (assignment?.status === 'completed') return 'done'; // 浅绿，全部完成
  if (assignment) return 'uploaded_pending';             // 浅橙，待登记
  return 'planned';                                      // 有计划，未到期
}
```

#### 拍照页 · 上传流程

```
1. 小程序 wx.chooseMedia() 或 wx.scanCode() 拍照
2. POST /upload/presign 获取预签名 URL
3. wx.uploadFile() 直传 COS
4. POST /assignments 创建作业记录
5. 建立 WebSocket 连接，监听批改进度
6. 跳转 loading 页等待
```

#### 题目详情 · 语音交互

```
1. 用户按住语音按钮，wx.getRecorderManager() 录音
2. 松手后上传音频，调用微信语音转文字（或腾讯云 ASR）
3. POST /problems/:id/dialogue 发送转写文本
4. SSE 流式接收 AI 回复，逐字渲染气泡
5. 写入本地 dialogues 缓存，支持翻页查看历史
```

### 4.4 离线 & 异常处理

| 场景 | 处理策略 |
|------|---------|
| 拍照后网络断开 | 图片暂存本地，重连后自动重试上传 |
| AI 批改超时（>30s）| 展示「正在批改中，稍后查看」，可关闭页面 |
| OCR 识别失败 | 提示重拍，支持手动输入题目数量兜底 |
| 语音转文字失败 | 降级为键盘输入模式 |
| WebSocket 断线 | 指数退避重连，断线期间轮询 `/assignments/:id` |

---

## 五、AI 能力设计

### 5.1 OCR 识题

调用腾讯云「通用印刷体识别（高精度）」或「手写体识别」：

```
输入：试卷图片（JPG/PNG，≤10MB）
输出：题目文本块列表（按坐标分割每道题）
后处理：按 y 坐标排序，合并多行同题文本，识别学生答案区域
```

### 5.2 AI 批改 · System Prompt

```
你是一个专业的小学奥数批改助手。

给定一道题目的OCR文本和学生答案，你需要：
1. 判断答案是否正确（correct / wrong / unknown）
2. 给出正确答案
3. 识别涉及的知识点（精确到具体方法）
4. 指出这道题设置的陷阱（"坑"）
5. 给出简洁的解题思路
6. 若答案错误，给出初步错误归因（不超过2句话）

输出格式（JSON）：
{
  "result": "wrong",
  "correct_answer": "鸡12只，兔8只",
  "knowledge_point": "鸡兔同笼·列方程法",
  "trap_desc": "鸡是2只脚，兔是4只脚，系数容易搞反",
  "solution_text": "设鸡x只，兔y只：x+y=20，2x+4y=56，解得x=12",
  "root_cause": "你把鸡兔的脚数系数写反了，2x+4y应为正确列法"
}
```

### 5.3 苏格拉底对话 · 三种模式

#### 模式一：做错了（wrong）

```
System: 你是一位有耐心的奥数辅导老师。学生做错了这道题。
你已知：正确答案、学生的错误答案、初步归因。
目标：引导学生说出自己的解题思路，帮助他自己发现错误所在。
规则：
- 不要直接告诉学生哪里错了，先问他是怎么想的
- 每次只问一个问题
- 当学生说出关键错误时，给予正向反馈，再指出问题
- 对话不超过6轮
```

#### 模式二：不会做（unknown）

```
System: 你是一位有耐心的奥数辅导老师。学生完全不会这道题。
目标：用苏格拉底式引导，让学生自己一步步推导出答案。
规则：
- 第一步永远是"读题"——引导学生找出题目中的已知条件
- 每次只问一个子问题，循序渐进
- 不要跳步骤，每个推理步骤都要学生自己说出来
- 最后由学生得出答案，你做总结归因
```

#### 模式三：做对了（correct）

```
System: 你是一位奥数辅导老师。学生做对了这道题。
目标：帮助学生巩固解题思路，探索是否有更优方法。
规则：
- 先让学生说说自己的解法
- 对比 AI 的解法，指出异同
- 如有更简洁解法，引导学生理解，但不强求
- 语气轻松，以鼓励为主
```

### 5.4 情绪价值文案生成

批改完成后，根据得分率生成个性化鼓励文案：

```
输入：{ total: 5, correct: 3, wrong: 1, unknown: 1, chapter: "鸡兔同笼" }

Prompt：
根据以下成绩，生成一段鼓励性文案（2-3句话），要：
- 肯定做对的部分
- 对错题/不会的题给出有期待感的描述
- 语气像一个欣赏孩子的老师，不能过于夸张
- 不超过60字
```

### 5.5 家长推送文案

复盘完成后，生成微信订阅消息内容：

```json
{
  "touser": "parent_openid",
  "template_id": "xxx",
  "data": {
    "thing1": { "value": "第3章·鸡兔同笼" },    // 练习章节
    "number2": { "value": "3/5" },               // 答题情况
    "thing3": { "value": "列方程法需要再练" },   // 复盘小结
    "time4":  { "value": "2026-04-22 15:30" }   // 完成时间
  }
}
```

---

## 六、关键流程时序图

### 6.1 拍照批改主流程

```
小程序          API服务         OCR             AI（Claude）
  │                │              │                  │
  ├─POST presign──►│              │                  │
  │◄──upload_url───┤              │                  │
  ├─直传图片─────────────────────────────────────────►COS
  ├─POST /assignments─►│          │                  │
  │◄──assignment_id────┤          │                  │
  ├─建立WebSocket──►│              │                  │
  │                ├─调用OCR──────►│                  │
  │◄─WS: ocr_done──┤◄──题目文本───┤                  │
  │                ├─逐题批改──────────────────────►  │
  │◄─WS: progress──┤◄──批改结果──────────────────────┤
  │◄─WS: grading_done─┤           │                  │
  ├─跳转汇总页─────┤              │                  │
```

### 6.2 语音对话流程

```
小程序（录音）    API服务         ASR             Claude
  │                │              │                  │
  ├─录音完成────────────────────────────────────────  │
  ├─wx.uploadFile──►│             │                  │
  │                ├─调用ASR──────►│                  │
  │                │◄──转写文本───┤                  │
  │                ├─构建上下文──────────────────────►│
  │◄─SSE流式输出───┤◄──流式回复──────────────────────┤
  ├─逐字渲染气泡───┤              │                  │
  │                ├─写入dialogues─►DB               │
```

---

## 七、安全与性能

### 安全

| 项目 | 方案 |
|------|------|
| 身份认证 | JWT，有效期 7 天，刷新机制 |
| 图片访问 | COS 私有桶 + 临时签名 URL（有效期 1 小时）|
| API 限流 | 拍照上传：10次/分钟/用户；对话：60次/分钟/用户 |
| 输入过滤 | 语音转文字内容过滤敏感词 |
| 数据隔离 | 所有查询强制带 `user_id` 条件 |

### 性能

| 项目 | 目标 | 方案 |
|------|------|------|
| OCR 识别 | < 3s | 腾讯云高精度 OCR |
| AI 批改（5题） | < 20s | 并发批改，Promise.all |
| 对话首字延迟 | < 1s | SSE 流式输出 |
| 日历数据加载 | < 200ms | Redis 缓存月度计划 |
| 图片上传 | < 5s | 前端压缩至 ≤2MB 后直传 |

---

## 八、MVP 边界说明

### 本期做

- 微信小程序（iOS + Android）
- 拍照 OCR + AI 批改（≤10题/次）
- 三种题型语音对话复盘
- 训练日历（手动维护计划数据）
- 家长微信订阅消息推送
- 历史练习记录

### 本期不做（后续迭代）

- 训练计划自动排期（比赛日倒推）
- AI 举一反三出题
- 知识关卡地图
- 题库建设
- 学生端/家长端分角色视图
- 多学生管理（一个家长多个孩子）
