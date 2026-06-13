"""Step 6: 将 step4 解析结果直接写入 PBL_PREP MySQL pre_ 系列表（pymysql）"""
from __future__ import annotations

import json
from urllib.parse import urlparse

import pymysql
import pymysql.cursors

from utils.config import (
    PREP_DATABASE_URL,
    DB_INIT_STAGE,
    DB_DONE_STAGE,
    SOURCE_FILE_TYPE,
    SOURCE_IS_SCANNED,
    QUESTION_TYPE_DEFAULT,
    QUESTION_REVIEW_STATUS_DEFAULT,
)
from utils.logger import setup_logger

logger = setup_logger(__name__)


def _connect() -> pymysql.connections.Connection:
    """从 mysql://user:pass@host:port/dbname 格式 URL 建立连接"""
    p = urlparse(PREP_DATABASE_URL)
    return pymysql.connect(
        host=p.hostname,
        port=p.port or 3306,
        user=p.username,
        password=p.password,
        database=p.path.lstrip("/"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


# ── 幂等写入辅助 ──────────────────────────────────────────────────────────────

def upsert_source_lesson(cur, meta: dict) -> int:
    """插入或返回已有的 pre_source_lessons.id"""
    cur.execute(
        """
        INSERT IGNORE INTO pre_source_lessons
            (material_set, grade, level, semester, lesson_num, lesson_name,
             file_path, file_type, is_scanned, stage)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            meta["material_set"],
            meta["grade"],
            str(meta["level"]),
            str(meta["semester"]),
            meta["lesson_num"],
            meta["lesson_name"],
            meta["file_path"],
            SOURCE_FILE_TYPE,
            SOURCE_IS_SCANNED,
            DB_INIT_STAGE,
        ),
    )
    if cur.lastrowid:
        return cur.lastrowid

    cur.execute(
        """
        SELECT id FROM pre_source_lessons
        WHERE material_set = %s AND level = %s AND lesson_num = %s
        """,
        (meta["material_set"], str(meta["level"]), meta["lesson_num"]),
    )
    return cur.fetchone()["id"]


# ── 图片解析辅助 ──────────────────────────────────────────────────────────────

def _img_path(placeholder: str, img_map: dict) -> str | None:
    """从 img_map 取图片路径；img_map 值可以是 str 也可以是 dict"""
    entry = img_map.get(placeholder)
    if entry is None:
        return None
    return entry["path"] if isinstance(entry, dict) else entry


def _build_stem_raw(
    stem_latex: str | None, images: list[dict], img_map: dict
) -> str | None:
    """
    构建 stem_raw，排除答案二维码图片。
    无图时直接返回 stem_latex；有图时返回含路径的 JSON。
    """
    paths = []
    for img in images:
        ph = img.get("placeholder")
        if not ph or ph not in img_map:
            continue
        entry = img_map[ph]
        img_type = entry.get("type") if isinstance(entry, dict) else None
        if img_type == "qr" or img.get("desc") == "答案二维码":
            continue
        path = entry["path"] if isinstance(entry, dict) else entry
        paths.append(path)

    if not paths:
        return stem_latex
    if len(paths) == 1:
        return json.dumps({"text": stem_latex, "image_path": paths[0]}, ensure_ascii=False)
    return json.dumps({"text": stem_latex, "image_paths": paths}, ensure_ascii=False)


def _extract_qr_url(images: list[dict], img_map: dict) -> str | None:
    """从 stem_parts[j].images 中提取答案二维码 URL"""
    for img in images:
        ph = img.get("placeholder")
        if not ph or ph not in img_map:
            continue
        entry = img_map[ph]
        img_type = entry.get("type") if isinstance(entry, dict) else None
        if img_type == "qr" or img.get("desc") == "答案二维码":
            return entry.get("qr_url") if isinstance(entry, dict) else None
    return None


# ── 主写入函数 ────────────────────────────────────────────────────────────────

def write_lesson(meta: dict, lesson: dict, img_map: dict) -> int:
    """
    将一整讲数据写入 pre_ 表，返回 lesson_id。

    Args:
        meta:     material_set/grade/level/semester/lesson_num/lesson_name/file_path
        lesson:   step4 解析结果（含 kp_list, methods, exercises）
        img_map:  {placeholder: {"path": str, "type": str, "qr_url": str|None}}
                  或简单格式 {placeholder: path_str}

    Returns:
        lesson_id (int)
    """
    conn = _connect()
    logger.info("step6: 写入数据库  lesson=%s", meta.get("lesson_name"))
    try:
        with conn.cursor() as cur:
            lesson_id = upsert_source_lesson(cur, meta)

            _write_kps(cur, lesson_id, lesson.get("kp_list", []))
            _write_methods(cur, lesson_id, lesson.get("methods", []))
            _write_exercises(cur, lesson_id, lesson, img_map, meta)

            cur.execute(
                "UPDATE pre_source_lessons SET stage = %s WHERE id = %s",
                (DB_DONE_STAGE, lesson_id),
            )
        conn.commit()
        logger.info("step6: 完成  lesson_id=%d", lesson_id)
        return lesson_id
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── 分表写入 ──────────────────────────────────────────────────────────────────

def _write_kps(cur, lesson_id: int, kp_list: list) -> None:
    for kp in kp_list:
        cur.execute(
            """
            INSERT INTO pre_lecture_kp (lesson_id, seq, title, content_latex)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                content_latex = VALUES(content_latex)
            """,
            (lesson_id, kp["seq"], kp.get("title"), kp.get("content_latex")),
        )


def _write_methods(cur, lesson_id: int, methods: list) -> None:
    for method in methods:
        cur.execute(
            """
            INSERT INTO pre_lecture_methods (lesson_id, seq, title, summary)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                summary = VALUES(summary)
            """,
            (lesson_id, method["seq"], method.get("title"), None),
        )


def _write_exercises(
    cur, lesson_id: int, lesson: dict, img_map: dict, meta: dict
) -> None:
    """遍历 exercises[] 数组，每个 stem_part 写入一行 pre_questions。"""
    kp_ids = _fetch_kp_ids(cur, lesson_id)

    # method_seq → method_id 缓存，避免重复查询
    method_id_cache: dict[int, int | None] = {}

    for ex in lesson.get("exercises", []):
        method_seq = ex.get("method_seq")
        ex_type = ex.get("type", "")
        sol = ex.get("solution") or {}
        solution_latex = sol.get("solution_latex") if ex_type == "example" else None

        # 查 method_id
        method_id: int | None = None
        if method_seq is not None:
            if method_seq not in method_id_cache:
                cur.execute(
                    "SELECT id FROM pre_lecture_methods WHERE lesson_id = %s AND seq = %s",
                    (lesson_id, method_seq),
                )
                row = cur.fetchone()
                method_id_cache[method_seq] = row["id"] if row else None
            method_id = method_id_cache[method_seq]

        for p in ex.get("stem_parts", []):
            images = p.get("images") or []
            stem_raw_val = _build_stem_raw(p.get("stem_latex"), images, img_map)
            qr_url = _extract_qr_url(images, img_map)

            _insert_question(
                cur,
                lesson_id=lesson_id,
                method_id=method_id,
                question_type=QUESTION_TYPE_DEFAULT,
                seq_in_lesson=ex.get("seq"),
                stem_raw=stem_raw_val,
                stem_latex=p.get("stem_latex"),
                answer_latex=p.get("answer_latex"),
                answer_raw=qr_url,
                solution_latex=solution_latex,
                meta=meta,
                kp_ids=kp_ids,
            )


def _insert_question(
    cur,
    lesson_id: int,
    method_id: int | None,
    question_type: str,
    seq_in_lesson: int | None,
    stem_raw: str | None,
    stem_latex: str | None,
    answer_latex: str | None,
    answer_raw: str | None,
    solution_latex: str | None,
    meta: dict,
    kp_ids: list[int],
) -> int:
    cur.execute(
        """
        INSERT INTO pre_questions
            (lesson_id, method_id, question_type, material_set, grade, level,
             seq_in_lesson, stem_raw, stem_latex, answer_latex, answer_raw,
             solution_latex, review_status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            lesson_id,
            method_id,
            question_type,
            meta["material_set"],
            meta["grade"],
            str(meta["level"]),
            seq_in_lesson,
            stem_raw,
            stem_latex,
            answer_latex,
            answer_raw,
            solution_latex,
            QUESTION_REVIEW_STATUS_DEFAULT,
        ),
    )
    question_id = cur.lastrowid

    if kp_ids and question_id:
        cur.executemany(
            "INSERT IGNORE INTO pre_question_kp_map (question_id, kp_id) VALUES (%s, %s)",
            [(question_id, kp_id) for kp_id in kp_ids],
        )

    return question_id


def _fetch_kp_ids(cur, lesson_id: int) -> list[int]:
    cur.execute("SELECT id FROM pre_lecture_kp WHERE lesson_id = %s", (lesson_id,))
    return [row["id"] for row in cur.fetchall()]
