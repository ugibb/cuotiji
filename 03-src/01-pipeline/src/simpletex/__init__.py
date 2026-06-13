"""SimpleTex OCR provider — 公式识别（latex_ocr / latex_ocr_turbo）"""
import time

import requests

from utils.config import SIMPLETEX_TOKEN, SIMPLETEX_BASE_URL, SIMPLETEX_RETRY_DELAYS, SIMPLETEX_TIMEOUT
from utils.logger import setup_logger

logger = setup_logger(__name__)

_DOC_OCR_URL     = f"{SIMPLETEX_BASE_URL}/doc_ocr"
_TURBO_OCR_URL   = f"{SIMPLETEX_BASE_URL}/latex_ocr_turbo"
_FORMULA_OCR_URL = f"{SIMPLETEX_BASE_URL}/latex_ocr"

_HEADERS = {"token": SIMPLETEX_TOKEN}
_RETRY_DELAYS = SIMPLETEX_RETRY_DELAYS


def _call_endpoint(url: str, image_path: str) -> tuple[bool, str, float]:
    for attempt, delay in enumerate(_RETRY_DELAYS, 1):
        try:
            with open(image_path, "rb") as f:
                t0 = time.time()
                resp = requests.post(url, headers=_HEADERS, files={"file": f}, timeout=SIMPLETEX_TIMEOUT)
            elapsed = time.time() - t0

            logger.debug(f"  {url.split('/')[-1]}  attempt={attempt}  status={resp.status_code}  {elapsed:.1f}s")

            if resp.status_code == 429:
                logger.warning(f"  429 并发限制，等待 {delay}s 后重试…")
                time.sleep(delay)
                continue
            if resp.status_code == 404:
                return False, "", 0.0
            if resp.status_code == 200:
                data = resp.json()
                if not data.get("status"):
                    err = data.get("err_info", {}).get("err_msg", "unknown")
                    logger.warning(f"  API status=false: {err}")
                    return False, "", 0.0
                res = data.get("res", {})
                latex = res.get("latex") or res.get("content") or res.get("text") or ""
                conf  = float(res.get("conf") or res.get("confidence") or 0.0)
                return True, latex, conf

            logger.warning(f"  非预期状态码 {resp.status_code}: {resp.text[:100]}")

        except requests.Timeout:
            logger.warning(f"  超时 (attempt={attempt})，等待 {delay}s…")
            time.sleep(delay)
        except requests.RequestException as e:
            logger.warning(f"  请求异常: {e}")
            time.sleep(delay)

    return False, "", 0.0


def ocr_page(image_path: str) -> tuple[str, str, list[dict]]:
    """
    按优先级尝试端点：latex_ocr_turbo → latex_ocr。
    返回 (endpoint, markdown_text, detected_images)。
    SimpleTex 为纯公式 OCR，不做图片区域检测，detected_images 始终为空列表。
    """
    for url, label in [
        (_TURBO_OCR_URL,   "latex_ocr_turbo"),
        (_FORMULA_OCR_URL, "latex_ocr"),
    ]:
        ok, latex, conf = _call_endpoint(url, image_path)
        if ok and latex.strip():
            logger.info(f"    ✓ simpletex/{label}  conf={conf:.3f}  len={len(latex)}")
            return f"simpletex/{label}", latex, [], {}
        if ok:
            logger.debug(f"    simpletex/{label} 返回空内容，降级…")

    logger.warning("    SimpleTex 所有端点均失败，返回空")
    return "simpletex/none", "", [], {}
