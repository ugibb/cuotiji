"""
评估指标计算模块
每个函数接收预测结果列表和 Ground Truth，返回指标字典。
"""
from __future__ import annotations
import subprocess
import tempfile
from pathlib import Path
from typing import Any


# ── Stage 3: Skill 标注 ──────────────────────────────────────────────────────

def skill_tagging_metrics(
    predictions: list[dict],
    ground_truth: list[dict],
    low_conf_threshold: float = 0.7,
) -> dict[str, Any]:
    """
    predictions: [{"question_id": "q001", "skill_ids": ["S2_3_2", ...], "confidence": 0.85}, ...]
    ground_truth: [{"question_id": "q001", "skill_id": "S2_3_2"}, ...]
    """
    gt_map = {item["question_id"]: item["skill_id"] for item in ground_truth}
    pred_map = {item["question_id"]: item for item in predictions}

    top1_correct = 0
    top3_correct = 0
    low_conf_count = 0
    confidences = []
    evaluated = 0

    for qid, gt_skill in gt_map.items():
        if qid not in pred_map:
            continue
        pred = pred_map[qid]
        skill_ids = pred.get("skill_ids", [])
        conf = pred.get("confidence", 0.0)
        confidences.append(conf)
        evaluated += 1

        if skill_ids and skill_ids[0] == gt_skill:
            top1_correct += 1
        if gt_skill in skill_ids[:3]:
            top3_correct += 1
        if conf < low_conf_threshold:
            low_conf_count += 1

    if evaluated == 0:
        return {"error": "no evaluated samples"}

    return {
        "evaluated":        evaluated,
        "top1_accuracy":    round(top1_correct / evaluated, 4),
        "top3_accuracy":    round(top3_correct / evaluated, 4),
        "avg_confidence":   round(sum(confidences) / evaluated, 4),
        "low_conf_rate":    round(low_conf_count / evaluated, 4),
        "low_conf_count":   low_conf_count,
    }


# ── Stage 2: 题目分割 ────────────────────────────────────────────────────────

def segmentation_metrics(
    predicted: list[dict],
    ground_truth: list[dict],
) -> dict[str, Any]:
    """
    predicted / ground_truth: [
        {"lesson_id": "juyi_3A_L01", "question_count": 12, "has_sub_questions": True}, ...
    ]
    """
    gt_map = {item["lesson_id"]: item for item in ground_truth}
    pred_map = {item["lesson_id"]: item for item in predicted}

    count_correct = 0
    sub_q_tp = sub_q_fp = sub_q_fn = 0
    evaluated = 0

    for lid, gt in gt_map.items():
        if lid not in pred_map:
            continue
        pred = pred_map[lid]
        evaluated += 1

        if pred["question_count"] == gt["question_count"]:
            count_correct += 1

        gt_has_sub  = gt.get("has_sub_questions", False)
        pred_has_sub = pred.get("has_sub_questions", False)
        if gt_has_sub and pred_has_sub:
            sub_q_tp += 1
        elif gt_has_sub and not pred_has_sub:
            sub_q_fn += 1
        elif not gt_has_sub and pred_has_sub:
            sub_q_fp += 1

    precision = sub_q_tp / (sub_q_tp + sub_q_fp) if (sub_q_tp + sub_q_fp) > 0 else 0.0
    recall    = sub_q_tp / (sub_q_tp + sub_q_fn) if (sub_q_tp + sub_q_fn) > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

    return {
        "evaluated":              evaluated,
        "count_accuracy":         round(count_correct / evaluated, 4) if evaluated else 0,
        "sub_question_precision": round(precision, 4),
        "sub_question_recall":    round(recall, 4),
        "sub_question_f1":        round(f1, 4),
    }


# ── Stage 4: LaTeX 标准化 ────────────────────────────────────────────────────

def latex_metrics(
    predictions: list[dict],
    ground_truth: list[dict],
) -> dict[str, Any]:
    """
    predictions: [{"expr_id": "e001", "latex": "\\frac{1}{2}"}, ...]
    ground_truth: [{"expr_id": "e001", "latex": "\\frac{1}{2}"}, ...]
    """
    gt_map   = {item["expr_id"]: item["latex"] for item in ground_truth}
    pred_map = {item["expr_id"]: item["latex"] for item in predictions}

    syntax_valid = 0
    exact_match  = 0
    evaluated    = 0

    for eid, gt_latex in gt_map.items():
        if eid not in pred_map:
            continue
        pred_latex = pred_map[eid]
        evaluated += 1

        if _latex_syntax_valid(pred_latex):
            syntax_valid += 1
        if pred_latex.strip() == gt_latex.strip():
            exact_match += 1

    return {
        "evaluated":        evaluated,
        "syntax_valid_rate": round(syntax_valid / evaluated, 4) if evaluated else 0,
        "exact_match_rate":  round(exact_match / evaluated, 4) if evaluated else 0,
    }


def _latex_syntax_valid(latex: str) -> bool:
    """用简单括号匹配检验 LaTeX 基本语法有效性（快速版，无需完整编译）。"""
    braces = 0
    for ch in latex:
        if ch == "{":
            braces += 1
        elif ch == "}":
            braces -= 1
        if braces < 0:
            return False
    return braces == 0


# ── Stage 5: 几何图形 ────────────────────────────────────────────────────────

def geometry_metrics(results: list[dict]) -> dict[str, Any]:
    """
    results: [
        {
            "fig_id": "fig_001",
            "complexity": "simple" | "complex",
            "figure_type": "tikz" | "needs_review",
            "tikz": "...",          # 仅 figure_type=="tikz" 时存在
            "svg_render_ok": True,  # TikZ → SVG 编译是否通过
        }, ...
    ]
    """
    total = len(results)
    if total == 0:
        return {"error": "no results"}

    simple_items  = [r for r in results if r["complexity"] == "simple"]
    complex_items = [r for r in results if r["complexity"] == "complex"]

    simple_tikz_ok   = sum(1 for r in simple_items  if r.get("figure_type") == "tikz")
    complex_flagged  = sum(1 for r in complex_items if r.get("figure_type") == "needs_review")
    svg_ok           = sum(1 for r in results if r.get("svg_render_ok", False))

    return {
        "total":                  total,
        "simple_count":           len(simple_items),
        "complex_count":          len(complex_items),
        "simple_tikz_success_rate": round(simple_tikz_ok / len(simple_items), 4) if simple_items else 0,
        "complex_flagged_rate":   round(complex_flagged / len(complex_items), 4) if complex_items else 0,
        "svg_render_pass_rate":   round(svg_ok / total, 4),
    }


def tikz_to_svg(tikz_code: str, output_path: Path | None = None) -> tuple[bool, str]:
    """
    将 TikZ 代码编译为 SVG，返回 (成功, svg内容或错误信息)。
    依赖系统安装：pdflatex + dvisvgm（或 pdf2svg）。
    """
    template = r"""
\documentclass[tikz,border=2pt]{standalone}
\usepackage{tikz}
\begin{document}
\begin{tikzpicture}
%s
\end{tikzpicture}
\end{document}
""" % tikz_code

    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = Path(tmpdir) / "fig.tex"
        tex_path.write_text(template, encoding="utf-8")

        result = subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", "fig.tex"],
            cwd=tmpdir, capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            return False, result.stderr[:500]

        pdf_path = Path(tmpdir) / "fig.pdf"
        svg_out  = Path(tmpdir) / "fig.svg"
        result2 = subprocess.run(
            ["pdf2svg", str(pdf_path), str(svg_out)],
            capture_output=True, text=True, timeout=15,
        )
        if result2.returncode != 0:
            return False, result2.stderr[:500]

        svg_content = svg_out.read_text(encoding="utf-8")
        if output_path:
            output_path.write_text(svg_content, encoding="utf-8")
        return True, svg_content


# ── Stage 1: 文本提取（辅助） ────────────────────────────────────────────────

def extraction_metrics(
    predicted_text: str,
    ground_truth_text: str,
) -> dict[str, Any]:
    """字符级准确率（简化版，按行对比非空行）。"""
    pred_lines = [l.strip() for l in predicted_text.splitlines() if l.strip()]
    gt_lines   = [l.strip() for l in ground_truth_text.splitlines() if l.strip()]

    total = max(len(gt_lines), 1)
    matched = sum(1 for p, g in zip(pred_lines, gt_lines) if p == g)

    char_total   = sum(len(l) for l in gt_lines)
    char_matched = sum(
        sum(1 for a, b in zip(p, g) if a == b)
        for p, g in zip(pred_lines, gt_lines)
    )

    return {
        "line_accuracy": round(matched / total, 4),
        "char_accuracy": round(char_matched / char_total, 4) if char_total else 0,
        "gt_line_count": len(gt_lines),
        "pred_line_count": len(pred_lines),
    }
