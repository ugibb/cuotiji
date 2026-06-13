"""Step 5: 将 step4 解析结果生成 SQL INSERT 文件，输出到 output/05-sql/{tag}.sql"""
from __future__ import annotations

import json
from pathlib import Path

from utils.config import (
    SOURCE_FILE_TYPE,
    SOURCE_IS_SCANNED,
    DB_INIT_STAGE,
    QUESTION_TYPE_DEFAULT,
    QUESTION_REVIEW_STATUS_DEFAULT,
)
from utils.logger import setup_logger

logger = setup_logger(__name__)


# ── SQL 值转义 ────────────────────────────────────────────────────────────────

def _s(v: str | None) -> str:
    """将 Python 值转为 SQL 字面量（字符串带引号，None → NULL）"""
    if v is None:
        return "NULL"
    return "'" + str(v).replace("\\", "\\\\").replace("'", "\\'") + "'"


def _b(v: bool) -> str:
    return "1" if v else "0"


def _i(v: int | None) -> str:
    return str(v) if v is not None else "NULL"


# ── 图片路径映射 ──────────────────────────────────────────────────────────────

def _build_img_map(extracted_images: list[dict]) -> dict[str, str]:
    """placeholder → local_path"""
    return {img["placeholder"]: img["path"] for img in extracted_images}


# ── stem_raw 构建 ─────────────────────────────────────────────────────────────

def _stem_raw(stem_latex: str | None, images: list[dict], img_map: dict[str, str]) -> str | None:
    """
    从 stem_parts[j].images 构建 stem_raw。
    答案二维码（desc="答案二维码"）不计入题干图片。
    无图时直接返回 stem_latex；有图时返回含路径的 JSON。
    """
    paths = [
        img_map[img["placeholder"]]
        for img in images
        if img.get("placeholder") and img["placeholder"] in img_map
        and img.get("desc") != "答案二维码"
    ]
    if not paths:
        return stem_latex
    if len(paths) == 1:
        return json.dumps({"text": stem_latex, "image_path": paths[0]}, ensure_ascii=False)
    return json.dumps({"text": stem_latex, "image_paths": paths}, ensure_ascii=False)


# ── SQL 块生成 ────────────────────────────────────────────────────────────────

def _lesson_sql(meta: dict) -> str:
    return (
        "INSERT IGNORE INTO pre_source_lessons\n"
        "    (material_set, grade, level, semester, lesson_num, lesson_name,\n"
        "     file_path, file_type, is_scanned, stage)\n"
        f"VALUES ({_s(meta['material_set'])}, {_i(meta['grade'])}, {_s(str(meta['level']))},\n"
        f"        {_s(str(meta['semester']))}, {_i(meta['lesson_num'])}, {_s(meta['lesson_name'])},\n"
        f"        {_s(meta['file_path'])}, {_s(SOURCE_FILE_TYPE)}, {_b(SOURCE_IS_SCANNED)}, {_s(DB_INIT_STAGE)});\n"
        "SET @lesson_id := IF(ROW_COUNT() > 0, LAST_INSERT_ID(),\n"
        f"    (SELECT id FROM pre_source_lessons WHERE material_set = {_s(meta['material_set'])}\n"
        f"     AND level = {_s(str(meta['level']))} AND lesson_num = {_i(meta['lesson_num'])}));\n"
    )


def _kp_sql(kp_list: list[dict]) -> list[str]:
    lines = []
    for kp in kp_list:
        seq = _i(kp.get("seq"))
        lines.append(
            f"INSERT INTO pre_lecture_kp (lesson_id, seq, title, content_latex)\n"
            f"VALUES (@lesson_id, {seq}, {_s(kp.get('title'))}, {_s(kp.get('content_latex'))})\n"
            f"ON DUPLICATE KEY UPDATE title = VALUES(title), content_latex = VALUES(content_latex);\n"
        )
    return lines


def _methods_sql(methods: list[dict]) -> list[str]:
    lines = []
    for method in methods:
        seq = _i(method.get("seq"))
        lines.append(
            f"INSERT INTO pre_lecture_methods (lesson_id, seq, title, summary)\n"
            f"VALUES (@lesson_id, {seq}, {_s(method.get('title'))}, NULL)\n"
            f"ON DUPLICATE KEY UPDATE title = VALUES(title);\n"
        )
    return lines


def _exercises_sql(lesson: dict, img_map: dict[str, str]) -> list[str]:
    """
    将 exercises[] 数组生成 INSERT pre_questions SQL。
    每个 stem_parts 子题对应一行记录。
    """
    lines = []
    for ex in lesson.get("exercises", []):
        method_seq = ex.get("method_seq")
        ex_type = ex.get("type", "")
        sol = ex.get("solution") or {}
        solution_latex = sol.get("solution_latex") if ex_type == "example" else None

        if method_seq is not None:
            method_id_expr = (
                f"(SELECT id FROM pre_lecture_methods"
                f" WHERE lesson_id = @lesson_id AND seq = {_i(method_seq)})"
            )
        else:
            method_id_expr = "NULL"

        for p in ex.get("stem_parts", []):
            images = p.get("images") or []
            stem_raw_val = _stem_raw(p.get("stem_latex"), images, img_map)
            answer_latex = p.get("answer_latex")

            lines.append(
                f"INSERT INTO pre_questions\n"
                f"    (lesson_id, method_id, question_type, material_set, grade, level,\n"
                f"     seq_in_lesson, stem_raw, stem_latex, answer_latex, answer_raw,\n"
                f"     solution_latex, review_status)\n"
                f"VALUES (@lesson_id, {method_id_expr}, {_s(QUESTION_TYPE_DEFAULT)},\n"
                f"        @mat_set, @grade, @level,\n"
                f"        {_i(ex.get('seq'))}, {_s(stem_raw_val)}, {_s(p.get('stem_latex'))},\n"
                f"        {_s(answer_latex)}, NULL,\n"
                f"        {_s(solution_latex)}, {_s(QUESTION_REVIEW_STATUS_DEFAULT)});\n"
            )
    return lines


# ── 主函数 ────────────────────────────────────────────────────────────────────

def generate_sql(meta: dict, lesson: dict, extracted_images: list[dict], sql_dir: Path, tag: str) -> Path:
    """
    生成一讲的 SQL INSERT 文件。

    Args:
        meta:             lesson 元数据（material_set/grade/level/semester/lesson_num/lesson_name/file_path）
        lesson:           step4 解析结果
        extracted_images: step2 提取的图片列表
        sql_dir:          output/05-sql/
        tag:              如 L11_lesson01

    Returns:
        生成的 .sql 文件路径
    """
    sql_dir.mkdir(parents=True, exist_ok=True)
    out_path = sql_dir / f"{tag}.sql"

    img_map = _build_img_map(extracted_images)

    kp_list  = lesson.get("kp_list", [])
    methods  = lesson.get("methods", [])
    exercises = lesson.get("exercises", [])

    blocks: list[str] = [
        f"-- {tag} · {meta.get('lesson_name', '')}\n",
        f"-- material_set={meta['material_set']}  level={meta['level']}  lesson={meta['lesson_num']}\n\n",
        "START TRANSACTION;\n\n",
        "-- 绑定固定标量（避免重复）\n",
        f"SET @mat_set := {_s(meta['material_set'])};\n",
        f"SET @grade   := {_i(meta['grade'])};\n",
        f"SET @level   := {_s(str(meta['level']))};\n\n",
        "-- 1. 讲次\n",
        _lesson_sql(meta),
        "\n-- 2. 知识点\n",
    ]

    blocks.extend(_kp_sql(kp_list))

    blocks.append("\n-- 3. 好方法\n")
    blocks.extend(_methods_sql(methods))

    blocks.append("\n-- 4. 习题（例题 / 举一反三 / 挑战自我 / 探索知识巅峰）\n")
    blocks.extend(_exercises_sql(lesson, img_map))

    blocks.append(
        "\n-- 5. 更新讲次状态\n"
        "UPDATE pre_source_lessons SET stage = 'db_written' WHERE id = @lesson_id;\n\n"
        "COMMIT;\n"
    )

    sql_text = "".join(blocks)
    out_path.write_text(sql_text, encoding="utf-8")

    ex_counts = {}
    for ex in exercises:
        t = ex.get("type", "unknown")
        ex_counts[t] = ex_counts.get(t, 0) + 1

    logger.info(
        "step5: SQL 生成完成  file=%s | kps/methods/exercises=%d/%d/%d  ",
        out_path.name,
        len(kp_list),
        len(methods),
        len(exercises),
        # ex_counts,
        # out_path,
    )
    return out_path
