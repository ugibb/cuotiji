# SimpleTex SGT 逆向工程技术预研报告

**日期：** 2026-06-08  
**背景：** 为 PDF 预处理 Pipeline（step2 OCR）寻找支持整页文档识别的 API 端点。

---

## 一、问题背景

SimpleTex 网页端「文档模式视觉 AI 增强」功能对 `img_p12_0.png`（学而思秘籍扫描页）识别效果极佳，能正确提取中文+LaTeX 混排内容。但同等图片通过公开 API 均返回 500 或空结果：

| 端点 | 状态 | 原因 |
|---|---|---|
| `/api/latex_ocr` | 200，但质量差 | 仅识别单个数学公式，非全文档 |
| `/api/latex_ocr_turbo` | 200，但质量差 | 同上 |
| `/api/doc_ocr` | 500（60s 后超时） | 刻意设计，见下文 |
| `/api/doc_latex_ocr` | 404 | 端点不存在 |

---

## 二、逆向工程过程

### 2.1 JS Bundle 分析

通过抓取 `https://simpletex.cn/ai/latex_ocr` 页面的所有 JS Bundle，在 `app-d87c119a.089bd3eb.js` 中发现关键常量对象：

```javascript
cn_gateway_ai_url: "https://server.simpletex.cn/api/sgt/",
net_gateway_ai_url: "https://server.simpletex.net/api/sgt/",
spt_v3_web_with_login: "simpletexpdf_v3_web_with_login",
get_pdf_progress_url: "https://pdfv3.simpletex.cn:55445/get_progress",
get_pdf_url_history: "https://pdfv3.simpletex.cn:55445/get_progress_result",
```

### 2.2 PDF OCR 调用链

在 `app-5c551db8.e9a90cf7.js` 中找到完整的上传函数 `pdf_ocr()`：

```javascript
async pdf_ocr(e) {
    // CY() 生成加密 URL
    let url = CY(bt.A.spt_v3_web_with_login);  // 参数="simpletexpdf_v3_web_with_login"
    let formData = new FormData();
    formData.append("file", e);
    formData.append("simpletex_app_version", "web_2024_9_8");
    formData.append("platform", "website");
    formData.append("arch", "website");
    formData.append("only_text_ocr", "false");
    axios.post(url, formData, { timeout: 600000, ... })
}
```

### 2.3 SGT URL 加密算法（module 695377 + 72553）

**CY() 函数逻辑（URL 生成器）：**

```
1. payload = { time: unix_timestamp, url: "simpletexpdf_v3_web_with_login", randomKey: randomVal }
2. plaintext = random_10_chars + "%%" + JSON.stringify(payload)
3. encrypted = AES-256-CBC(plaintext, KEY, IV)  → base64
4. encoded = encodeURI(encodeURIComponent(encrypted))  // 双重编码
5. final_url = "https://server.simpletex.cn/api/sgt/" + encoded + "/"
```

**AES 加密参数（从 module 72553 逆向，字符串数组 rotation=20）：**

| 参数 | 值 |
|---|---|
| Key (32字节) | `eHYASx7jiUvAilhF3iJ4EcMd2Aex3ogA` |
| IV (16字节) | `4/y!<PB4W=~X@_0Y` |
| 算法 | AES-256-CBC |
| Padding | PKCS7 |

### 2.4 验证结果

```javascript
// 用正确参数生成 URL，HEAD 请求验证
// 双重编码 URL → HTTP 200 ✓
// 单层编码 URL → HTTP 404 ✗

// POST 请求（含图片）返回 HTTP 200
// 响应体为 AES 加密的 JSON blob（解密密钥未完全确认）
```

---

## 三、核心结论

**`doc_ocr` 返回 500 是刻意设计，不是 Bug。** SimpleTex 将高质量文档 OCR（文档模式视觉 AI 增强）限制在付费 Web 端，通过 SGT（Smart Gateway Token）AES 加密 URL 机制防止直接 API 调用。

架构本质：

```
公开 API (token 鉴权)          Web 专属 API (SGT + token)
/api/latex_ocr                /api/sgt/{AES加密token}/
/api/latex_ocr_turbo    vs    → 路由到 pdfv3.simpletex.cn:55445
/api/doc_ocr (已废弃)         → 返回加密 JSON 响应
```

虽然已逆向出加密算法和密钥，但继续深入（解密响应、处理 session/cookie 验证）投入产出比过低，且可能触碰服务条款。

---

## 四、推荐替代方案

| 方案 | 优点 | 缺点 | 适用场景 |
|---|---|---|---|
| **Qwen-VL-Max（推荐）** | 公开 API，中文+公式混排强，约 ¥0.02/张 | 需阿里云账号 | Pipeline step2 首选替代 |
| GPT-4o / Claude Vision | 识别质量最高 | 成本较高（约 ¥0.1/张） | 高精度场景 |
| 百度 OCR 高精度+公式版 | 国内备案，中文成熟 | 公式识别弱于 SimpleTex | 纯文字页面 |
| MathPix API | 专为数学文档设计 | 需信用卡，无中文官网 | 公式密集型 |

**下一步行动：** 将 `step2_ocr.py` 的 OCR 实现切换为 Qwen-VL-Max（`qwen-vl-max` 模型，通义千问视觉），替换 SimpleTex 调用链。

---

*本文档记录了一次完整的 Web API 逆向工程预研，历时约 3 小时，最终决策为放弃并切换方向。*
