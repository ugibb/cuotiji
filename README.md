# 奥数练习册（cuoti-ai）

错题/奥数练习相关能力：微信小程序 + Node 服务端。详细设计见 `02-doc/02-design/040-tech-design.md`。

## 仓库结构（摘要）

| 路径 | 说明 |
|------|------|
| `04-code/miniprogram/` | 微信小程序源码与 `project.config.json` |
| `04-code/server/` | Node.js API 服务 |

## 微信开发者工具 · 导入与 npm

1. **导入目录**：请选择 **`04-code/miniprogram`** 作为小程序项目根目录（该目录下需同时存在 `project.config.json`、`app.json`、`package.json`）。
2. **npm 构建**：工具会按 `package.json` 的 **`dependencies`** 构建到 `miniprogram_npm`。当前默认 `dependencies` 为空，**无需执行「工具 → 构建 npm」**；若后续添加小程序可用的 npm 包，请写入 `dependencies` 后在该目录执行 `npm install`，再执行构建。
3. **路径说明**：`project.config.json` 已设置 `miniprogramRoot` 为 `./`，并启用 `packNpmManually` + `packNpmRelationList`，将 `package.json` 与构建输出目录显式指向本目录，避免 1.06.x 工具报「NPM packages not found」时路径歧义。

修改 `project.config.json` 后建议**重启开发者工具**或重新打开项目。

## 本地联调端口

- 后端默认端口为 `3001`（见 `04-code/server/.env`）。
- 小程序默认请求地址为 `http://localhost:3001/api`（见 `04-code/miniprogram/app.ts`）。
- 若你本机有其他服务占用 `3000`，请保持以上配置以避免请求命中错误服务导致 `404`。
- 启动后端：在 `04-code/server` 下执行 `./start.sh`（开发）或 `./start.sh prod`（需先 `npm run build`）。

## 常见问题 / Troubleshooting

### STT 语音识别报 `network timeout`

**现象**：小程序录音结束后，服务端日志出现：
```
TencentCloudSDKHttpException: network timeout at: https://asr.tencentcloudapi.com/
```

**根因**：腾讯云 ASR SDK 的 `reqTimeout`（单位：秒）设置过短。空 GET 请求到该端点本身就需要 ~3s，带 base64 音频 payload 的实际调用在网络稍慢时轻易超时。

**定位方法**：
```bash
curl -o /dev/null -s -w "http_code=%{http_code} time_total=%{time_total}s\n" --max-time 10 https://asr.tencentcloudapi.com/
# 正常返回 http_code=200；time_total > 2s 说明端点本身偏慢，需留足余量
```

**修复**：将 `03-src/02-server/src/routes/stt.ts` 中的 `reqTimeout` 调大：
```ts
httpProfile: { endpoint: 'asr.tencentcloudapi.com', reqTimeout: 60 }
// 原来是 15，60s 对短录音（≤30s）足够
```

**其他注意事项**：
- 录音超过 30 秒时，腾讯云处理时间更长，仍可能偶发超时；建议小程序侧将 `duration` 限制在 30s 以内。
- 该错误与鉴权凭证无关，`TENCENT_SECRET_ID / KEY` 正确即可。
