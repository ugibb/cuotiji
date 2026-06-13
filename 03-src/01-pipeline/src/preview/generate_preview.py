"""
扫描 output/02-ocr 和 output/03-merge，生成可直接打开的 preview.html。

用法：
  python -m preview.generate_preview
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import OUTPUT_DIR

_TEMPLATE   = Path(__file__).parent / "preview_template.html"
_OUTPUT     = OUTPUT_DIR / "preview.html"
_OCR_ROOT   = OUTPUT_DIR / "02-ocr"
_MERGE_ROOT = OUTPUT_DIR / "03-merge"
_JSON_ROOT  = OUTPUT_DIR / "04-json"


def collect_ocr_files() -> list[dict]:
    """扫描 output/02-ocr/L*/page_XX.md（逐页模式）"""
    files: list[dict] = []
    for md in sorted(_OCR_ROOT.glob("*/*.md")):
        if md.stem.endswith("_raw"):
            continue
        lesson   = md.parent.name                    # L11_lesson01
        page     = md.stem                           # page_07
        rel_path = f"02-ocr/{lesson}/{md.name}"      # 相对于 output/
        content  = md.read_text(encoding="utf-8")
        files.append({
            "lesson": lesson,
            "page":   page,
            "label":  f"{lesson} · {page}",
            "path":   rel_path,
            "content": content,
        })
    return files


def collect_json_files() -> list[dict]:
    """扫描 output/04-json/*_lesson.json（每讲一个结构化 JSON）"""
    if not _JSON_ROOT.exists():
        return []
    files: list[dict] = []
    for jf in sorted(_JSON_ROOT.glob("*_lesson.json")):
        lesson   = jf.stem.removesuffix("_lesson")   # L07_lesson01_lesson → L07_lesson01
        rel_path = f"04-json/{jf.name}"
        content  = jf.read_text(encoding="utf-8")
        files.append({
            "lesson":  lesson,
            "page":    lesson,
            "label":   lesson,
            "path":    rel_path,
            "content": content,
        })
    return files


def collect_merge_files() -> list[dict]:
    """扫描 output/03-merge/*.md（每讲一个合并文件）"""
    files: list[dict] = []
    for md in sorted(_MERGE_ROOT.glob("*.md")):
        lesson   = md.stem.removesuffix("_merged")   # L11_lesson01_merged → L11_lesson01
        rel_path = f"03-merge/{md.name}"              # 相对于 output/
        content  = md.read_text(encoding="utf-8")
        files.append({
            "lesson": lesson,
            "page":   lesson,
            "label":  lesson,
            "path":   rel_path,
            "content": content,
        })
    return files


def generate() -> Path:
    if not _TEMPLATE.exists():
        raise FileNotFoundError(f"模板不存在: {_TEMPLATE}")

    files_ocr   = collect_ocr_files()
    files_merge = collect_merge_files()
    files_json  = collect_json_files()
    template     = _TEMPLATE.read_text(encoding="utf-8")
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M")

    html = template.replace("__FILES_OCR_JSON__",   json.dumps(files_ocr,   ensure_ascii=False))
    html = html.replace(    "__FILES_MERGE_JSON__",  json.dumps(files_merge, ensure_ascii=False))
    html = html.replace(    "__FILES_JSON_JSON__",   json.dumps(files_json,  ensure_ascii=False))
    html = html.replace(    "__GENERATED_AT__",      generated_at)

    _OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if _OUTPUT.exists():
        _OUTPUT.chmod(0o644)
    _OUTPUT.write_text(html, encoding="utf-8")

    print(f"已生成: {_OUTPUT}")
    print(f"  02-ocr  逐页: {len(files_ocr)} 页")
    print(f"  03-merge 合并: {len(files_merge)} 讲")
    print(f"  04-json  结构: {len(files_json)} 讲")
    return _OUTPUT


if __name__ == "__main__":
    generate()
