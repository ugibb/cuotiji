"""每套教材的特殊处理规则。

新增教材时只需在 BOOK_PROFILES 中添加一条记录；
split_pdf 及后续步骤会自动读取对应的 BookProfile。
"""
from dataclasses import dataclass, field


@dataclass
class BookProfile:
    # 丢弃头部 N 页（封面、版权页等）
    skip_head: int = 0
    # 丢弃尾部 N 页（版权声明、广告页等）
    skip_tail: int = 0
    # --- 预留扩展字段 ---
    # 例如：强制灰度、自定义 DPI、章节分割规则……
    extra: dict = field(default_factory=dict)


# key 与 config.MATERIAL_SET 保持一致
BOOK_PROFILES: dict[str, BookProfile] = {
    "学而思秘籍2022": BookProfile(skip_head=4, skip_tail=2),
}


def get_profile(material_set: str) -> BookProfile:
    """返回指定教材的 BookProfile；未注册的教材返回默认（全保留）。"""
    return BOOK_PROFILES.get(material_set, BookProfile())
