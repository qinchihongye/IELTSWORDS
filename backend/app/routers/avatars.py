"""
内置头像列表 API
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..avatar_unlocks import build_current_user_avatar_catalog
from ..avatar_storage import (
    BUILTIN_AVATAR_URL_PREFIX,
    VIP_ONLY_BUILTIN_AVATAR_KEYS,
    get_all_builtin_avatar_keys,
    get_preferred_builtin_avatar_filename,
    is_hardcoded_builtin_avatar,
    load_builtin_avatar_metadata,
)
from ..database import get_db
from ..dependencies import get_current_user

router = APIRouter()


def _get_label(filename: str) -> str:
    return filename.rsplit(".", 1)[0]


@router.get("/builtin")
async def list_builtin_avatars():
    keys = get_all_builtin_avatar_keys()
    metadata = load_builtin_avatar_metadata()
    return [
        {
            "key": k,
            "label": _get_label(k),
            "variety": str((metadata.get(k) or {}).get("variety") or "").strip() or "未分类",
            "vip_only": k in VIP_ONLY_BUILTIN_AVATAR_KEYS,
            "url": f"{BUILTIN_AVATAR_URL_PREFIX}/{get_preferred_builtin_avatar_filename(k)}",
            "is_hardcoded": is_hardcoded_builtin_avatar(k),
        }
        for k in keys
    ]


@router.get("/me/options", response_model=schemas.CurrentUserAvatarCatalog)
async def list_current_user_avatar_options(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return build_current_user_avatar_catalog(db, current_user)
