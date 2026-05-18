"""
内置头像列表 API
"""

from fastapi import APIRouter

from ..avatar_storage import (
    BUILTIN_AVATAR_URL_PREFIX,
    VIP_ONLY_BUILTIN_AVATAR_KEYS,
    get_all_builtin_avatar_keys,
    is_hardcoded_builtin_avatar,
)

router = APIRouter()


def _get_label(filename: str) -> str:
    return filename.rsplit(".", 1)[0]


@router.get("/builtin")
async def list_builtin_avatars():
    keys = get_all_builtin_avatar_keys()
    return [
        {
            "key": k,
            "label": _get_label(k),
            "vip_only": k in VIP_ONLY_BUILTIN_AVATAR_KEYS,
            "url": f"{BUILTIN_AVATAR_URL_PREFIX}/{k}",
            "is_hardcoded": is_hardcoded_builtin_avatar(k),
        }
        for k in keys
    ]
