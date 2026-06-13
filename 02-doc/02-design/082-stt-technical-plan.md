# STT 语音输入技术方案

> 基于现有 `chat-input` 组件，接入后端 STT 服务，完成「按住说话 → 转文字 → 发送」闭环

---

## 零、关于「使用现成插件替代自定义组件」的调研结论

> 调研了两个微信小程序官方/官方生态语音插件，**均不适合替换 `chat-input` 组件**。

| 插件 | AppID | 问题 |
|------|-------|------|
| 微信同声传译（官方） | `wx069ba97219f66d99` | **个人小程序不可用**，仅限企业主体；且只提供 STT 引擎，UI 仍需自建 |
| 腾讯云智能语音插件 | `wx3e17776051baf153` | SecretId/SecretKey 写在小程序代码里，可被逆向，**密钥明文暴露，安全不可接受** |

**结论：保持 `chat-input` 自定义组件 + 后端中转方案，不引入任何插件。**

---

## 一、现状盘点

### 已完成（无需重写）

| 位置 | 内容 |
|------|------|
| `components/chat-input/index.ts` | `RecorderManager` 录音、触摸状态机（开始/取消/超时） |
| `components/chat-input/index.ts` | `voiceEnd` 事件，携带 `filePath`（mp3，16kHz）|
| `components/chat-input/index.ts` | `fillText(text)` / `resetVoice(msg)` 供父页面回调 |
| `03-src/02-server` | Fastify + `@fastify/multipart`（文件上传）+ `axios` |

### 需要新增

```
小程序父页面          新增 voiceEnd handler → 上传 mp3 → 等待识别结果
后端 src/routes/stt.ts   接收音频 → 调 STT 服务 → 返回文字
.env                  新增 STT_PROVIDER / 各平台 key
```

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────┐
│                微信小程序                            │
│                                                     │
│  按住 → RecorderManager.start()                     │
│  松手 → RecorderManager.stop()                      │
│       → 触发 voiceEnd { filePath }                  │
│       → wx.uploadFile(filePath → /api/stt)          │
│       → 等待响应 → chatInput.fillText(text)          │
└──────────────────────┬──────────────────────────────┘
                       │ multipart/form-data (mp3)
┌──────────────────────▼──────────────────────────────┐
│           Fastify 后端  POST /api/stt               │
│                                                     │
│  1. 接收音频文件（@fastify/multipart）               │
│  2. 根据 STT_PROVIDER 环境变量选择服务商              │
│  3. 调用 STT 服务 → 返回 { text }                   │
└──────────────────────┬──────────────────────────────┘
          ┌────────────┴────────────┐
          ▼                        ▼
  腾讯云 ASR（默认）          讯飞 / Whisper（备选）
```

---

## 三、STT 服务选型对比

| 维度 | 腾讯云 ASR（一句话识别）| 讯飞 实时语音转写 | OpenAI Whisper API |
|------|------------------------|------------------|--------------------|
| 适用场景 | 短句，≤60s | 实时流式，长句 | 通用，≤25MB |
| 接入方式 | REST（最简单）| WebSocket | REST |
| 中文准确率 | ★★★★☆ | ★★★★★ | ★★★☆☆ |
| 延迟（短句）| ~300-500ms | 流式逐字返回 | ~1-2s |
| 免费额度 | 每月 1 万次 | 每日 500 次 | 按 token 计费 |
| 网络要求 | 国内节点，快 | 国内节点，快 | 需境外网络 |
| 推荐指数 | ✅ **首选** | 备选 | 兜底/出海 |

**结论：优先接腾讯云 ASR「一句话识别」，接口最简单，延迟低，免费额度够 MVP 阶段用。**

---

## 四、接口开通步骤

### 4.1 腾讯云 ASR（首选，必须开通）

1. **开通服务**
   👉 [https://console.cloud.tencent.com/asr](https://console.cloud.tencent.com/asr)
   → 点击「立即开通」→ 免费额度每月 1 万次

2. **获取密钥**
   👉 [https://console.cloud.tencent.com/cam/capi](https://console.cloud.tencent.com/cam/capi)
   → 新建密钥 → 记录 `SecretId` + `SecretKey`

3. **API 文档参考**
   👉 [一句话识别 API](https://cloud.tencent.com/document/product/1093/35646)
   - 接口：`POST https://asr.tencentcloudapi.com`
   - Action：`SentenceRecognition`
   - 音频：Base64 或 URL，支持 mp3

---

### 4.2 讯飞 ASR（备选，按需开通）

1. **注册并创建应用**
   👉 [https://console.xfyun.cn/app/myapp](https://console.xfyun.cn/app/myapp)
   → 创建应用 → 选择「实时语音转写」→ 记录 `APPID` + `APIKey` + `APISecret`

2. **API 文档参考**
   👉 [实时语音转写 API](https://www.xfyun.cn/doc/asr/rtasr/API.html)
   - 接口：WebSocket
   - 音频：PCM 流，实时推送

---

### 4.3 OpenAI Whisper（兜底，按需开通）

1. **获取 API Key**
   👉 [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)

2. **API 文档参考**
   👉 [Whisper API 文档](https://platform.openai.com/docs/guides/speech-to-text)
   - 接口：`POST https://api.openai.com/v1/audio/transcriptions`
   - 音频：mp3 文件，最大 25MB
   - 注意：需要境外服务器或代理

---

## 五、实现清单

### 5.1 后端（优先）

**新增文件：`src/routes/stt.ts`**

```
POST /api/stt
  - 接收 multipart 音频文件
  - 根据 STT_PROVIDER 路由到不同服务
  - 返回 { success: true, data: { text: "识别结果" } }
```

**`.env` 新增变量：**

```env
STT_PROVIDER=tencent              # tencent | xfyun | openai

# 腾讯云
TENCENT_SECRET_ID=xxx
TENCENT_SECRET_KEY=xxx

# 讯飞（备用）
XFYUN_APP_ID=xxx
XFYUN_API_KEY=xxx
XFYUN_API_SECRET=xxx

# OpenAI（兜底）
OPENAI_API_KEY=xxx
```

**`src/index.ts` 新增注册：**

```ts
import { sttRoutes } from './routes/stt'
api.register(sttRoutes)
```

---

### 5.2 小程序父页面（problem-detail 或其他使用 chat-input 的页面）

**绑定 voiceEnd 事件：**

```ts
// WXML
<chat-input bind:voiceEnd="onVoiceEnd" ... />

// TS
async onVoiceEnd(e: WechatMiniprogram.CustomEvent) {
  const { filePath } = e.detail
  wx.uploadFile({
    url: `${API_BASE}/api/stt`,
    filePath,
    name: 'audio',
    header: { Authorization: `Bearer ${token}` },
    success: (res) => {
      const { data } = JSON.parse(res.data)
      this.chatInput.fillText(data.text)
    },
    fail: () => {
      this.chatInput.resetVoice('识别失败，请重试')
    }
  })
}
```

---

## 六、开发顺序

```
Step 1  开通腾讯云 ASR，拿到 SecretId + SecretKey      （10 分钟）
Step 2  后端实现 POST /api/stt（腾讯云版本）            （1-2 小时）
Step 3  小程序父页面绑定 voiceEnd，联调上传 + 回显      （1 小时）
Step 4  端到端跑通：按住 → 松手 → 显示文字 → 发送      （0.5 小时）
Step 5  异常处理：超时/网络失败/权限被拒               （0.5 小时）
        ──────────────────────────────────────
        合计约 4 小时完成功能闭环
```

---

## 七、关键约束

| 约束 | 说明 |
|------|------|
| 音频格式 | 已配置 mp3 + 16000Hz，腾讯云 ASR 直接支持，无需转码 |
| 文件大小 | 短句（≤30s）约 100-500KB，后端已配置 10MB 上限，足够 |
| 超时处理 | 组件内已有 30s STT 超时兜底，后端建议设 10s 超时 |
| 权限 | 录音权限已在组件内处理（引导去设置），无需额外处理 |
| Token | 后端 `/api/stt` 接口需要 JWT 鉴权（复用现有 `authenticate` hook）|

---

*方案版本：v1.0 · 2026-06-02*
