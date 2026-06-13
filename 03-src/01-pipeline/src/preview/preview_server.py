"""
preview.html 本地服务：静态文件 + 保存 OCR 修改。

用法：
  python -m utils.preview_server
"""
from __future__ import annotations

import base64
import json
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import OUTPUT_DIR

_PORT = 7788


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(OUTPUT_DIR), **kwargs)

    def end_headers(self) -> None:
        # 预览页与 .md 均禁用缓存，刷新后读到最新保存内容
        path = self.path.split("?", 1)[0]
        if path.endswith(".md") or path.endswith("preview.html"):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
        super().end_headers()

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == "/api/save":
            self._handle_save()
        elif path == "/api/replace-image":
            self._handle_replace_image()
        else:
            self.send_error(404)

    def _handle_save(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        rel_path = body.get("path", "")
        content = body.get("content", "")

        if not rel_path or ".." in rel_path:
            self._json(400, {"ok": False, "error": "非法路径"})
            return

        target = (OUTPUT_DIR / rel_path).resolve()
        if not str(target).startswith(str(OUTPUT_DIR.resolve())):
            self._json(400, {"ok": False, "error": "路径越界"})
            return

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        self._json(200, {"ok": True, "path": rel_path})

    def _handle_replace_image(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        rel_path = body.get("path", "")
        data_b64 = body.get("data", "")

        if not rel_path or ".." in rel_path:
            self._json(400, {"ok": False, "error": "非法路径"})
            return

        ext = Path(rel_path).suffix.lower()
        if ext not in {".png", ".jpg", ".jpeg", ".webp"}:
            self._json(400, {"ok": False, "error": "仅支持图片格式"})
            return

        target = (OUTPUT_DIR / rel_path).resolve()
        if not str(target).startswith(str(OUTPUT_DIR.resolve())):
            self._json(400, {"ok": False, "error": "路径越界"})
            return

        try:
            image_bytes = base64.b64decode(data_b64)
        except Exception:
            self._json(400, {"ok": False, "error": "图片数据解码失败"})
            return

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(image_bytes)
        self._json(200, {"ok": True, "path": rel_path})

    def _json(self, code: int, data: dict) -> None:
        payload = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[preview] {self.address_string()} - {fmt % args}")


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", _PORT), PreviewHandler)
    url = f"http://127.0.0.1:{_PORT}/preview.html"
    print(f"Preview 服务已启动: {url}")
    print("  保存 API:    POST /api/save")
    print("  替换图片 API: POST /api/replace-image")
    print("  Ctrl+C 停止")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
