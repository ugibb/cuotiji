# -*- coding: utf-8 -*-
"""
统一日志配置：规范格式、美观输出。
所有步骤共用一个日志文件，按日期命名，一天一个文件：log/YYYYMMDD.log
"""
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Union

from utils.config import LOG_DIR

# 使用「按日期单日志文件」时传入此常量，不再按 step 区分日志文件
DAILY_LOG = "daily"

# 统一日志格式：时间 │ 级别 │ [logger名] 消息（文件内可区分来源）
LOG_FORMAT = "%(asctime)s │ %(levelname)-5s │ %(message)s"
LOG_FORMAT_FILE = "%(asctime)s │ %(levelname)-5s │ %(name)-10s │ %(message)s"
LOG_DATE_FORMAT = "%H:%M:%S"

# 分隔符
SEP_LINE = "─" * 50
SEP_DOUBLE = "═" * 50

# 按日期复用的文件 handler，避免同一天多 handler 写同一文件
_daily_handler: Optional[logging.FileHandler] = None
_daily_date: Optional[str] = None


def _get_daily_file_handler() -> Optional[logging.FileHandler]:
    """获取当日共用的文件 handler，同一天内复用同一个。"""
    global _daily_handler, _daily_date
    today = datetime.now().strftime("%Y%m%d")
    if _daily_date == today and _daily_handler is not None:
        return _daily_handler
    if _daily_handler is not None:
        try:
            _daily_handler.close()
        except Exception:
            pass
        _daily_handler = None
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    path = LOG_DIR / f"{today}.log"
    _daily_handler = logging.FileHandler(path, encoding="utf-8")
    _daily_handler.setFormatter(logging.Formatter(LOG_FORMAT_FILE, datefmt=LOG_DATE_FORMAT))
    _daily_date = today
    return _daily_handler


def setup_logger(
    name: str,
    log_file: Optional[Union[Path, str]] = DAILY_LOG,
    level: int = logging.INFO,
) -> logging.Logger:
    """
    配置并返回 logger，统一格式。
    默认使用按日期生成的单一日志文件（log/YYYYMMDD.log），所有步骤写入同一文件。

    Args:
        name: logger 名称（会写入日志，便于区分 step1/step2 等）
        log_file: 日志文件。DAILY_LOG（默认）表示按日期单文件；None 表示仅控制台；或传入路径/文件名
        level: 日志级别

    Returns:
        配置好的 Logger
    """
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(level)
    formatter = logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT)

    # 控制台输出
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    logger.addHandler(console)

    # 文件输出
    if log_file is not None:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        if log_file is DAILY_LOG or log_file == "daily":
            file_handler = _get_daily_file_handler()
            logger.addHandler(file_handler)
        else:
            path = LOG_DIR / log_file if isinstance(log_file, str) else log_file
            file_handler = logging.FileHandler(path, encoding="utf-8")
            file_handler.setFormatter(logging.Formatter(LOG_FORMAT_FILE, datefmt=LOG_DATE_FORMAT))
            logger.addHandler(file_handler)

    return logger
