# AI 答题复盘 · 技术实施方案 v1.0

> 生成于 2026-06-02，基于产品讨论与代码库探索
> 对应原始讨论记录：082-ai-review-solution-raw.md

---

## 一、核心设计

### 1.1 整体流程

```
进入题目复盘页（problem-detail，isReviewMode = true）
    ↓
POST /api/problems/:id/review-start
  → 生成 AI 开场消息（按 result 类型）
  → 保存到 Stu_Dialogue（role: ai, stageCode: PROBE_THINKING）
  → 返回开场消息给前端
    ↓
学生看到 AI 消息，输入框开放（文字 / 图片）
    ↓
POST /api/problems/:id/dialogue
  → 保存学生消息（含 imageUrl）
  → 读取当前 reviewStage + 本阶段 turnCount
  → 路由 AI 模型（domestic → Qwen2.5-VL / international → Claude Sonnet 4.6）
  → 构造多模态上下文（System Prompt + 历史对话 + 新消息）
  → 解析 AI 返回 JSON：{ reply, stageComplete, suggestNext }
  → stageComplete → 更新 reviewStage 到下一阶段
  → suggestNext → reviewStatus = done，session 归档，禁止追加
  → 保存 AI 回复，返回前端
    ↓
suggestNext = true → 前端显示「进入下一题复盘」卡片，输入框禁用
```

### 1.2 Session 设计：一道题一个 session

- `Stu_Dialogue` 按 `problemId` 自然隔离，每题独立上下文
- Session 终止条件：`reviewStatus = done`（AI 判断 COMPLETE 后写入）
- 终止后不允许追加消息，前端输入框禁用
- 跨题之间上下文完全独立，不累积

### 1.3 状态机

`Stu_Problem.reviewStage`（Int）→ 代码层映射到阶段名：


| Int | 阶段名                | 适用 result       |
| --- | ------------------ | --------------- |
| 0   | NOT_STARTED        | 所有              |
| 1   | PROBE_THINKING     | correct / wrong |
| 2   | VERIFY_DEPTH       | correct         |
| 3   | EXPLORE_VARIANTS   | correct         |
| 4   | IDENTIFY_ERROR     | wrong           |
| 5   | ROOT_CAUSE         | wrong           |
| 6   | GUIDE_READING      | unknown         |
| 7   | IDENTIFY_KNOWLEDGE | unknown         |
| 8   | GUIDED_SOLVING     | unknown         |
| 9   | COMPLETE           | 所有              |


**各路径阶段顺序（每阶段最多 5 轮，超出强制推进）：**


| result  | 阶段顺序          |
| ------- | ------------- |
| correct | 1 → 2 → 3 → 9 |
| wrong   | 1 → 4 → 5 → 9 |
| unknown | 6 → 7 → 8 → 9 |


### 1.4 模型路由


| 区域     | 模型                | 接入方式                       |
| ------ | ----------------- | -------------------------- |
| 国内（默认） | Qwen2.5-VL        | DashScope OpenAI 兼容接口，支持视觉 |
| 海外     | Claude Sonnet 4.6 | 已有 Anthropic client，支持视觉   |


路由依据：环境变量 `AI_REGION=domestic|international`（默认 domestic）

### 1.5 存储

- 对话消息 → `Stu_Dialogue`（新增 `imageUrl`、`stageCode` 字段）
- 图片文件 → 腾讯云 COS（同微信生态，延迟低）
- DB 存 COS URL，AI 通过 URL 读取图片内容

---

## 二、数据库变更

**文件：** `03-src/02-server/prisma/schema.prisma`

```prisma
model Stu_Dialogue {
  id        BigInt       @id @default(autoincrement())
  problemId BigInt       @map("problem_id")
  role      DialogueRole
  content   String       @db.Text
  audioUrl  String?      @map("audio_url") @db.VarChar(512)
  imageUrl  String?      @map("image_url") @db.VarChar(512)   // 新增
  stageCode String?      @map("stage_code") @db.VarChar(32)   // 新增，用于按阶段计算 turnCount
  createdAt DateTime     @default(now()) @map("created_at")

  problem Stu_Problem @relation(fields: [problemId], references: [id])

  @@index([problemId])
  @@index([problemId, stageCode])   // 新增
  @@map("stu_dialogues")
}
```

`Stu_Problem.reviewStage` 保持 `Int`，代码层做阶段映射（避免 MySQL 类型变更迁移风险）。

执行：`npx prisma db push`（开发环境，无 shadow DB 权限时用此替代 migrate dev）

---

## 三、后端实现

### 3.1 阶段常量

**新建：** `03-src/02-server/src/constants/review-stages.ts`

```typescript
export const REVIEW_STAGE = {
  NOT_STARTED: 0,
  PROBE_THINKING: 1,
  VERIFY_DEPTH: 2,
  EXPLORE_VARIANTS: 3,
  IDENTIFY_ERROR: 4,
  ROOT_CAUSE: 5,
  GUIDE_READING: 6,
  IDENTIFY_KNOWLEDGE: 7,
  GUIDED_SOLVING: 8,
  COMPLETE: 9,
} as const;

export type ReviewStageValue = typeof REVIEW_STAGE[keyof typeof REVIEW_STAGE];

export const STAGE_CODE: Record<ReviewStageValue, string> = {
  0: 'NOT_STARTED',
  1: 'PROBE_THINKING',
  2: 'VERIFY_DEPTH',
  3: 'EXPLORE_VARIANTS',
  4: 'IDENTIFY_ERROR',
  5: 'ROOT_CAUSE',
  6: 'GUIDE_READING',
  7: 'IDENTIFY_KNOWLEDGE',
  8: 'GUIDED_SOLVING',
  9: 'COMPLETE',
};

// 各 result 类型的阶段推进路径
export const STAGE_PATH = {
  correct: [1, 2, 3, 9],
  wrong: [1, 4, 5, 9],
  unknown: [6, 7, 8, 9],
} as const;

export const MAX_TURNS_PER_STAGE = 5;
```

### 3.2 COS 图片上传

**新增端点：** `POST /api/problems/:id/chat-image`

**依赖：** `npm install cos-nodejs-sdk-v5 @types/cos-nodejs-sdk-v5`

**环境变量：**

```
COS_SECRET_ID=xxx
COS_SECRET_KEY=xxx
COS_BUCKET=xxx
COS_REGION=ap-guangzhou
```

**命名规则：** `review/{problemId}/{timestamp}-{random}.jpg`

### 3.3 AI Service 重构

**文件：** `03-src/02-server/src/services/ai.service.ts`

新增方法：

```typescript
// 生成复盘开场消息（AI 主动发起）
async generateReviewOpening(problem: Problem): Promise<string>

// 生成复盘对话回复
async generateReviewReply(params: {
  problem: Problem;
  stageCode: string;
  studentMessage: string;
  imageUrl?: string;
  history: Dialogue[];
  turnCount: number;
}): Promise<{ reply: string; stageComplete: boolean; suggestNext: boolean }>
```

**AI 输出格式（结构化 JSON）：**

```json
{
  "reply": "回复学生的自然语言内容",
  "stageComplete": true,
  "suggestNext": false
}
```

- `stageComplete: true` → 服务端推进到下一阶段
- `suggestNext: true` → 已到 COMPLETE，前端显示「进入下一题」卡片

**System Prompt 结构（每个阶段独立）：**

```
你是一位专业的奥数辅导老师，正在通过苏格拉底式对话引导学生复盘一道题。

题目信息：
- 题目内容：{ocrText}
- 学生答题结果：{result}（正确/错误/不会）
- 正确答案：{correctAnswer}
- 知识点：{knowledgePoint}
- 常见坑点：{trapDesc}
- 标准解题步骤：{solutionText}
- 错误归因（如有）：{rootCause}

当前复盘阶段：{stageName}（阶段说明）
当前已交流 {turnCount} 轮。

你的任务：（具体任务描述按阶段不同）

输出格式要求：必须返回合法 JSON，格式为：
{"reply": "...", "stageComplete": true/false, "suggestNext": true/false}
```

### 3.4 新增路由

**文件：** `03-src/02-server/src/routes/assignments.ts`

```
POST /api/problems/:id/review-start
  → 检查 reviewStatus，若已 done 则返回错误
  → 若 dialogues 已有记录则直接返回（防重复触发）
  → 调用 generateReviewOpening(problem)
  → 保存 AI 消息（role: ai, stageCode: 'PROBE_THINKING'）
  → 更新 reviewStage = 1
  → 返回 { message: string, stageCode: 'PROBE_THINKING' }

POST /api/problems/:id/chat-image
  → 接收 multipart 图片
  → 上传到 COS
  → 返回 { imageUrl: string }

POST /api/problems/:id/dialogue（更新原有逻辑）
  → 接收 { content, imageUrl? }
  → 检查 reviewStatus，若 done 则拒绝
  → 保存学生消息（含 stageCode）
  → 计算本阶段 turnCount
  → 判断是否强制推进（turnCount >= MAX_TURNS_PER_STAGE）
  → 调用 generateReviewReply()
  → 解析 JSON，处理 stageComplete / suggestNext
  → 若 suggestNext → reviewStatus = done
  → 保存 AI 回复（含 stageCode）
  → 返回 { reply, suggestNext, currentStage }
```

---

## 四、小程序前端

### 4.1 review-start 触发

**文件：** `03-src/03-miniprogram/pages/checkin/problem-detail/index.ts`

```typescript
async onLoad(options) {
  await this.loadProblem();
  await this.loadDialogues();

  // 复盘模式 + 无历史对话 → 自动触发 AI 开场
  if (this.data.isReviewMode && this.data.dialogues.length === 0) {
    await this.startReview();
  }
}

async startReview() {
  this.setData({ loading: true });
  const res = await api.post(`/problems/${this.data.problemId}/review-start`);
  // 追加到对话列表
  this.appendDialogue({ role: 'ai', content: res.data.message });
}
```

### 4.2 图片发送

**文件：** `03-src/03-miniprogram/components/chat-input/index.ts`

去掉"即将上线"限制，实现完整图片上传：

```typescript
async handleCamera() {
  const res = await wx.chooseMedia({ count: 1, mediaType: ['image'] });
  const filePath = res.tempFiles[0].tempFilePath;

  // 上传到服务端 → COS
  const uploadRes = await wx.uploadFile({
    url: `${BASE_URL}/problems/${problemId}/chat-image`,
    filePath,
    name: 'file',
  });
  const { imageUrl } = JSON.parse(uploadRes.data);

  this.triggerEvent('send', { type: 'image', content: '', imageUrl });
}
```

### 4.3 图片气泡

**文件：** `03-src/03-miniprogram/pages/checkin/problem-detail/index.wxml`

```xml
<view wx:for="{{dialogues}}" class="bubble {{item.role}}">
  <image wx:if="{{item.imageUrl}}"
         src="{{item.imageUrl}}"
         class="chat-image"
         mode="widthFix"
         bindtap="previewImage" />
  <text wx:if="{{item.content}}">{{item.content}}</text>
</view>
```

### 4.4 复盘完成态交互（重要）

复盘完成有两个触发时机：

1. **实时完成**：当前对话中 AI 返回 `suggestNext: true`
2. **重新进入**：学生退出后再次打开已完成复盘的题目（`reviewStatus = done`）

两种情况下的 UI 状态完全一致：

#### ① 结束标识（对话区底部固定展示）

```xml
<!-- 复盘完成标识，插入在对话列表末尾 -->
<view wx:if="{{reviewDone}}" class="review-complete-banner">
  <image src="/images/icons/check-circle.png" class="complete-icon" />
  <text class="complete-text">本题复盘已完成</text>
  <text class="complete-subtext">你的复盘记录已保存</text>
</view>
```

样式要求：居中展示，与最后一条 AI 消息之间有明显间距，视觉上有「结束感」（可用分隔线 + 勾选图标 + 灰色文字）。

#### ② 输入框替换为禁用状态

复盘完成后，底部输入栏整体替换为提示条，不再显示输入框：

```xml
<!-- 正常状态：显示输入框 -->
<chat-input wx:if="{{!reviewDone}}" ... />

<!-- 复盘完成状态：替换为提示条 -->
<view wx:else class="review-done-bar">
  <text>复盘已完成，无法继续输入</text>
</view>
```

#### ③ 「进入下一题复盘」行动卡片

已有 `suggestNext` 预留，确保：

- 只在 `reviewDone = true` 且 `isReviewMode = true` 时显示
- 在 `review-complete-banner` 下方展示（不是替代 banner，而是跟在后面）
- 最后一题完成后，卡片文案改为「查看今日打卡总结」

#### ④ 数据层：页面加载时判断 reviewDone

```typescript
async loadProblem() {
  const problem = await api.getProblem(this.data.problemId);
  const reviewDone = problem.reviewStatus === 'done';
  this.setData({ problem, reviewDone });
}

// 实时更新（收到 AI 回复后）
handleDialogueResponse(res: DialogueResponse) {
  this.appendDialogue({ role: 'ai', content: res.reply });
  if (res.suggestNext) {
    this.setData({ reviewDone: true, suggestNext: true });
    this.scrollToBottom(); // 确保结束标识滚动到可见区域
  }
}
```

### 4.5 API 封装更新

**文件：** `03-src/03-miniprogram/services/api.ts`

```typescript
// 开始复盘（AI 主动发起）
reviewStart(problemId: string): Promise<{ message: string; stageCode: string }>

// 图片上传
uploadChatImage(problemId: string, filePath: string): Promise<{ imageUrl: string }>

// 对话（更新返回类型）
sendDialogue(problemId: string, data: {
  content: string;
  imageUrl?: string;
}): Promise<{ reply: string; suggestNext: boolean; currentStage: string }>
```

---

## 五、实施顺序

1. **Prisma 变更** → `npx prisma db push`（已完成 schema 修改）
2. **阶段常量文件** → `review-stages.ts`
3. **COS 集成** → 安装依赖 + `chat-image` 端点
4. **AI Service 重构** → 多模型路由 + 开场 + 对话回复（JSON 输出）
5. **路由更新** → `review-start` + `dialogue` 状态机逻辑
6. **小程序：图片发送 + 气泡渲染**
7. **小程序：review-start 触发 + suggestNext 联动 + 输入框禁用**

---

## 六、验证方式

1. **AI 开场测试**：进入一道 `wrong` 题复盘页，确认自动出现 AI 开场消息，学生未发任何消息
2. **状态机测试**：对同一题连续回复 6 次，确认第 6 次时强制推进到下一阶段
3. **图片上传测试**：发送一张图，确认 COS 有文件、AI 回复内容基于图片分析
4. **多模型测试**：切换 `AI_REGION=international`，确认 Claude 正常接入
5. **归档测试**：走完完整流程到 COMPLETE，确认输入框禁用、「进入下一题」卡片出现
6. **防重测试**：刷新已完成复盘的题目页，确认不会重新触发 review-start

---

## 七、API 申请与配置落地指引

### 7.1 Qwen2.5-VL（国内用户 · 默认模型）

**申请入口：** 阿里云百炼大模型平台

1. 注册 / 登录阿里云账号：<https://www.aliyun.com>
2. 进入百炼控制台：<https://bailian.console.aliyun.com>
3. 左侧菜单 → **API-KEY 管理** → 创建 API Key
4. 复制 API Key，填入 `.env`：

```env
DASHSCOPE_API_KEY="sk-xxxxxxxxxxxxxxxxxxxx"
```

**调用模型名：** `qwen-vl-plus`（视觉理解，支持图文）

> 新用户有免费 Token 额度，测试期间足够。计费参考：<https://help.aliyun.com/zh/model-studio/billing>

---

### 7.2 Claude Sonnet 4.6（海外用户 · 备用模型）

**申请入口：** Anthropic Console

1. 注册 / 登录：<https://console.anthropic.com>
2. 左侧菜单 → **API Keys** → Create Key
3. 复制 API Key，填入 `.env`：

```env
ANTHROPIC_API_KEY="sk-ant-xxxxxxxxxxxxxxxxxxxx"
```

**调用模型名：** `claude-sonnet-4-6`（已在代码中配置）

> 切换为海外模式：`.env` 中设置 `AI_REGION="international"`

---

### 7.3 腾讯云 COS（图片存储）

**申请入口：** 腾讯云对象存储

1. 登录腾讯云：<https://cloud.tencent.com>
2. 进入 COS 控制台：<https://console.cloud.tencent.com/cos>
3. 创建存储桶（Bucket）：
   - 地域选 **广州（ap-guangzhou）**（与服务器同地域延迟最低）
   - 访问权限选 **私有读写**
4. 进入 **密钥管理**：<https://console.cloud.tencent.com/cam/capi>
   - 创建子账号密钥（推荐，权限最小化）
   - 或使用主账号 SecretId / SecretKey
5. 填入 `.env`：

```env
COS_SECRET_ID="AKIDxxxxxxxxxxxxxxxxxxxx"
COS_SECRET_KEY="xxxxxxxxxxxxxxxxxxxx"
COS_BUCKET="your-bucket-name-1234567890"
COS_REGION="ap-guangzhou"
```

> Bucket 名称格式为 `{自定义名}-{APPID}`，APPID 在控制台概览页可查。

---

### 7.4 配置完成后快速验证

```bash
# 1. 启动服务端
cd 03-src/02-server && npm run dev

# 2. 测试 review-start（需先有一道 problem 记录）
curl -X POST http://localhost:3002/api/problems/{problemId}/review-start \
  -H "Authorization: Bearer {token}"

# 3. 确认返回 AI 开场消息
# { "success": true, "data": { "message": "...", "stageCode": "PROBE_THINKING" } }
```

