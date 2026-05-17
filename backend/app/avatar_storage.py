"""
用户头像存储工具
"""

from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from .config.settings import BASE_DIR

AVATAR_UPLOAD_DIR = BASE_DIR / "data" / "uploads" / "avatars"
AVATAR_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

AVATAR_URL_PREFIX = "/uploads/avatars"
MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024
BUILTIN_AVATAR_KEYS = [
    "花舞霓裳.png",
    "万华镜.png",
    "三河千鸟.png",
    "恋物语.png",
    "无尽夏.png",
    "石灰灯.png",
    "花手鞠.png",
    "薄荷拇指.png",
    "香草草莓.png",
    "魔幻海洋.png",
    "坦尼克.jpg",
    "白二岐.jpg",
    "萨利安.jpg",
    "白锦龟背竹.png",
    "绿天鹅绒.png",
    "银虎.png",
    "黑桃.png",
    "婉尼拉.png",
    "女王之心.jpg",
]
VIP_ONLY_BUILTIN_AVATAR_KEYS = {
    "花舞霓裳.png",
}
LEGACY_BUILTIN_AVATAR_KEYS = [
    "万华镜.png",
    "三河千鸟.png",
    "恋物语.png",
    "无尽夏.png",
    "石灰灯.png",
    "花手鞠.png",
    "花舞霓裳.png",
    "薄荷拇指.png",
    "香草草莓.png",
    "魔幻海洋.png",
]
DEFAULT_BUILTIN_AVATAR_KEY = "万华镜.png"
RENAMED_BUILTIN_AVATAR_KEY_MAP = {
    "石头灯.png": "石灰灯.png",
}
LEGACY_BUILTIN_AVATAR_KEY_MAP = {
    f"avatar-{index:02d}": avatar_key
    for index, avatar_key in enumerate(LEGACY_BUILTIN_AVATAR_KEYS, start=1)
}
VALID_BUILTIN_AVATAR_KEYS = set(BUILTIN_AVATAR_KEYS)

ALLOWED_SUFFIXES = {
    ".png": ".png",
    ".jpg": ".jpg",
    ".jpeg": ".jpg",
    ".webp": ".webp",
}

ALLOWED_MIME_TYPES = {
    "image/png": ".png",
    "image/jpg": ".jpg",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}


def normalize_builtin_avatar_key(avatar_key: str) -> str:
    value = (avatar_key or "").strip()
    if value in VALID_BUILTIN_AVATAR_KEYS:
        return value

    renamed_key = RENAMED_BUILTIN_AVATAR_KEY_MAP.get(value)
    if renamed_key:
        return renamed_key

    legacy_key = LEGACY_BUILTIN_AVATAR_KEY_MAP.get(value)
    if legacy_key:
        return legacy_key

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="内置头像不存在",
    )


def validate_builtin_avatar_key(avatar_key: str) -> str:
    return normalize_builtin_avatar_key(avatar_key)


def is_vip_only_builtin_avatar(avatar_key: str) -> bool:
    return normalize_builtin_avatar_key(avatar_key) in VIP_ONLY_BUILTIN_AVATAR_KEYS


def get_avatar_upload_url(filename: str) -> str:
    return f"{AVATAR_URL_PREFIX}/{filename}"


def resolve_avatar_disk_path(avatar_value: str | None) -> Path | None:
    if not avatar_value or not avatar_value.startswith(f"{AVATAR_URL_PREFIX}/"):
        return None

    file_path = (AVATAR_UPLOAD_DIR / avatar_value.split("/")[-1]).resolve()
    try:
        file_path.relative_to(AVATAR_UPLOAD_DIR.resolve())
    except ValueError:
        return None

    return file_path


def delete_uploaded_avatar_file(avatar_value: str | None):
    file_path = resolve_avatar_disk_path(avatar_value)
    if file_path and file_path.exists():
        file_path.unlink(missing_ok=True)


async def save_uploaded_avatar(user_id: int, file: UploadFile) -> str:
    suffix = ALLOWED_MIME_TYPES.get(file.content_type or "")
    if not suffix:
        raw_suffix = Path(file.filename or "").suffix.lower()
        suffix = ALLOWED_SUFFIXES.get(raw_suffix)

    if not suffix:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅支持 PNG、JPG、WEBP 格式头像",
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="上传文件不能为空",
        )

    if len(content) > MAX_AVATAR_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="头像大小不能超过 2MB",
        )

    filename = f"user_{user_id}_{uuid4().hex}{suffix}"
    destination = AVATAR_UPLOAD_DIR / filename
    destination.write_bytes(content)
    return get_avatar_upload_url(filename)
