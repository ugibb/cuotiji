#!/usr/bin/env python3
"""
PDF 批量去头去尾

用法: python pilot/scripts/trim_pdf.py
修改下方配置区后直接运行即可。
"""

import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

# ─── 配置区（按需修改）────────────────────────────────────────────────────────

INPUT_DIR  = Path("pilot/samples/text_pdf")       # 输入目录（递归处理所有 PDF）
OUTPUT_DIR = Path("pilot/samples/trimmed_pdf")    # 输出目录（保留原始目录结构）

FRONT_SKIP = 4   # 去掉每份 PDF 前 N 页
BACK_SKIP  = 2   # 去掉每份 PDF 后 M 页

# ─────────────────────────────────────────────────────────────────────────────


def short_name(stem: str) -> str:
    """从文件名中提取短标识，如「第15讲」；无匹配则取末尾 12 字符。"""
    m = re.search(r'第\d+讲', stem)
    if m:
        return m.group()
    m = re.search(r'参考答案|答案|附录', stem)
    if m:
        return m.group()
    return stem[-12:]


def run() -> None:
    pdfs = sorted(INPUT_DIR.rglob("*.pdf"))
    if not pdfs:
        print(f"[ERROR] 未找到 PDF：{INPUT_DIR}")
        sys.exit(1)

    print(f"找到 {len(pdfs)} 份 PDF，去头 {FRONT_SKIP} 页 + 去尾 {BACK_SKIP} 页")
    print(f"输出目录：{OUTPUT_DIR.resolve()}\n")
    print("文件名  标识  原始  裁剪后")
    print("─" * 40)

    done = skipped = 0
    for src in pdfs:
        rel = src.relative_to(INPUT_DIR)
        dst = OUTPUT_DIR / rel
        dst.parent.mkdir(parents=True, exist_ok=True)

        doc   = fitz.open(str(src))
        total = doc.page_count
        keep  = total - FRONT_SKIP - BACK_SKIP

        if keep <= 0:
            print(f"{src.name}  ✗ {short_name(src.stem)}  跳过（仅 {total} 页）")
            doc.close()
            skipped += 1
            continue

        out = fitz.open()
        out.insert_pdf(doc, from_page=FRONT_SKIP, to_page=total - BACK_SKIP - 1)
        out.save(str(dst))
        out.close()
        doc.close()

        print(f"{src.name}  {short_name(src.stem)}  {total} 页  {keep} 页")
        done += 1

    print("─" * 40)
    print(f"完成 {done} 份" + (f"，跳过 {skipped} 份（页数不足）" if skipped else ""))


if __name__ == "__main__":
    run()
