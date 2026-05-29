"""
汇总各 Stage 测试结果，生成 report/tech-selection.md。
运行：python evaluation/compare.py
"""
from __future__ import annotations
import json
import sys
from datetime import date
from pathlib import Path

# 将 pilot/ 加入路径
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import REPORT_DIR, MIN_ACCEPTABLE_TOP1, MIN_ACCEPTABLE_TOP3, MIN_LATEX_VALID_RATE, MIN_TIKZ_SIMPLE_RATE

RESULTS_DIR = Path(__file__).parent.parent / "results"


def load(name: str) -> dict:
    p = RESULTS_DIR / f"{name}.json"
    if not p.exists():
        return {}
    return json.loads(p.read_text(encoding="utf-8"))


def pass_fail(value: float, threshold: float) -> str:
    return "PASS" if value >= threshold else "FAIL"


def build_report() -> str:
    s1 = load("stage1")
    s2 = load("stage2")
    s3 = load("stage3")
    s4 = load("stage4")
    s5 = load("stage5")

    lines: list[str] = []
    a = lines.append

    a(f"# 技术选型报告")
    a(f"")
    a(f"> 生成日期：{date.today()}  ")
    a(f"> 样本规模：Stage1 50页 / Stage2 20课 / Stage3 100题 / Stage4 100式 / Stage5 30图")
    a(f"")
    a(f"---")
    a(f"")

    # ── 决策汇总 ──────────────────────────────────────────────────────────────
    a(f"## 一、技术选型决策汇总")
    a(f"")
    a(f"| Stage | 选定方案 | 备选方案 | 决策依据 |")
    a(f"|-------|---------|---------|---------|")
    a(f"| S1 文本提取 | {s1.get('selected', '待定')} | {s1.get('alt', '—')} | {s1.get('reason', '—')} |")
    a(f"| S2 题目分割 | {s2.get('selected', '待定')} | {s2.get('alt', '—')} | {s2.get('reason', '—')} |")
    a(f"| S3 Skill标注 | {s3.get('selected', '待定')} | {s3.get('alt', '—')} | {s3.get('reason', '—')} |")
    a(f"| S4 LaTeX标准化 | {s4.get('selected', '待定')} | {s4.get('alt', '—')} | {s4.get('reason', '—')} |")
    a(f"| S5 几何图形 | {s5.get('selected', '待定')} | {s5.get('alt', '—')} | {s5.get('reason', '—')} |")
    a(f"")

    # ── Stage 3 详细对比（最关键） ────────────────────────────────────────────
    a(f"## 二、Stage 3 Skill 标注详细对比")
    a(f"")
    s3_models = s3.get("models", {})
    if s3_models:
        a(f"| 指标 | " + " | ".join(s3_models.keys()) + " | 阈值 |")
        a(f"|-----|" + "------|" * (len(s3_models) + 1))

        metrics_rows = [
            ("Top-1 准确率", "top1_accuracy", MIN_ACCEPTABLE_TOP1),
            ("Top-3 准确率", "top3_accuracy", MIN_ACCEPTABLE_TOP3),
            ("平均置信度",   "avg_confidence", None),
            ("低置信度比例", "low_conf_rate", None),
        ]
        for label, key, threshold in metrics_rows:
            row = f"| {label} |"
            for m_data in s3_models.values():
                val = m_data.get(key, "—")
                cell = f" {val:.2%} |" if isinstance(val, float) else f" {val} |"
                row += cell
            row += f" {threshold:.0%} |" if threshold else " — |"
            a(row)

        a(f"")
        a(f"| 每题成本($) | " + " | ".join(
            f"{m.get('cost_per_question', '—')}" for m in s3_models.values()
        ) + " | — |")
    else:
        a(f"*Stage 3 结果文件未找到，请先运行测试脚本。*")
    a(f"")

    # ── Stage 4 LaTeX ─────────────────────────────────────────────────────────
    a(f"## 三、Stage 4 LaTeX 标准化对比")
    a(f"")
    s4_models = s4.get("models", {})
    if s4_models:
        a(f"| 指标 | " + " | ".join(s4_models.keys()) + " | 阈值 |")
        a(f"|-----|" + "------|" * (len(s4_models) + 1))
        for label, key, threshold in [
            ("语法有效率", "syntax_valid_rate", MIN_LATEX_VALID_RATE),
            ("精确匹配率", "exact_match_rate", None),
        ]:
            row = f"| {label} |"
            for m_data in s4_models.values():
                val = m_data.get(key, "—")
                cell = f" {val:.2%} |" if isinstance(val, float) else f" {val} |"
                row += cell
            row += f" {threshold:.0%} |" if threshold else " — |"
            a(row)
    else:
        a(f"*Stage 4 结果文件未找到，请先运行测试脚本。*")
    a(f"")

    # ── Stage 5 几何图形 ──────────────────────────────────────────────────────
    a(f"## 四、Stage 5 几何图形 TikZ 生成")
    a(f"")
    s5_data = s5.get("metrics", {})
    if s5_data:
        a(f"| 指标 | 结果 | 阈值 |")
        a(f"|-----|------|------|")
        rows = [
            ("简单图形 TikZ 成功率", "simple_tikz_success_rate", MIN_TIKZ_SIMPLE_RATE),
            ("复杂图形标记率",       "complex_flagged_rate", None),
            ("SVG 渲染通过率",      "svg_render_pass_rate", None),
        ]
        for label, key, threshold in rows:
            val = s5_data.get(key, "—")
            cell = f"{val:.2%}" if isinstance(val, float) else str(val)
            flag = f" ({pass_fail(val, threshold)})" if isinstance(val, float) and threshold else ""
            a(f"| {label} | {cell}{flag} | {threshold:.0%} |" if threshold else f"| {label} | {cell} | — |")
    else:
        a(f"*Stage 5 结果文件未找到，请先运行测试脚本。*")
    a(f"")

    # ── 成本预测 ──────────────────────────────────────────────────────────────
    a(f"## 五、全量成本预测")
    a(f"")
    a(f"| 方案 | Stage1 | Stage2 | Stage3 | Stage4 | 合计 |")
    a(f"|------|--------|--------|--------|--------|------|")
    plan_a = s3.get("cost_plan_a", {})
    plan_b = s3.get("cost_plan_b", {})
    if plan_a:
        a(f"| 方案A（全Claude） | ${plan_a.get('s1','?')} | ${plan_a.get('s2','?')} | ${plan_a.get('s3','?')} | ${plan_a.get('s4','?')} | **${plan_a.get('total','?')}** |")
    if plan_b:
        a(f"| 方案B（混合） | ${plan_b.get('s1','?')} | ${plan_b.get('s2','?')} | ${plan_b.get('s3','?')} | ${plan_b.get('s4','?')} | **${plan_b.get('total','?')}** |")
    a(f"")

    # ── 风险提示 ──────────────────────────────────────────────────────────────
    a(f"## 六、风险提示")
    a(f"")
    risks = []
    if s3_models:
        for name, data in s3_models.items():
            top1 = data.get("top1_accuracy", 0)
            if isinstance(top1, float) and top1 < MIN_ACCEPTABLE_TOP1:
                risks.append(f"- **{name}** Top-1 准确率 {top1:.1%} 低于阈值 {MIN_ACCEPTABLE_TOP1:.0%}，不建议单独使用。")
    if not risks:
        risks.append("- 暂无高风险项（请在测试完成后重新生成报告）。")
    for r in risks:
        a(r)
    a(f"")
    a(f"---")
    a(f"*本报告由 `evaluation/compare.py` 自动生成*")

    return "\n".join(lines)


def main():
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    report = build_report()
    out = REPORT_DIR / "tech-selection.md"
    out.write_text(report, encoding="utf-8")
    print(f"报告已写入：{out}")
    print(report[:500])


if __name__ == "__main__":
    main()
