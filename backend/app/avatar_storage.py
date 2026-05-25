"""
用户头像存储工具
"""

import io
import json
import re
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from .config.settings import BASE_DIR

AVATAR_UPLOAD_DIR = BASE_DIR / "data" / "uploads" / "avatars"
AVATAR_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

BUILTIN_AVATAR_UPLOAD_DIR = BASE_DIR / "data" / "builtin-avatars"
BUILTIN_AVATAR_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

AVATAR_URL_PREFIX = "/uploads/avatars"
BUILTIN_AVATAR_URL_PREFIX = "/builtin-avatars"
MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024
MAX_AVATAR_PIXELS = 4_000_000
MAX_AVATAR_DIMENSION = 512
_ALLOWED_SUFFIXES_FOR_BUILTIN = {".png", ".jpg", ".jpeg", ".webp"}
BUILTIN_AVATAR_KEYS = []
if BUILTIN_AVATAR_UPLOAD_DIR.exists():
    BUILTIN_AVATAR_KEYS = [
        f.name for f in BUILTIN_AVATAR_UPLOAD_DIR.iterdir()
        if f.is_file() and f.suffix.lower() in _ALLOWED_SUFFIXES_FOR_BUILTIN
    ]
VIP_ONLY_BUILTIN_AVATAR_KEYS = {
    "花舞霓裳.png",
}
PUBLIC_DEFAULT_BUILTIN_AVATAR_KEYS = {
    "石灰灯.png",
    "香草草莓.png",
}
LEGACY_BUILTIN_AVATAR_KEYS = [
    "三河千鸟.png",
    "恋物语.png",
    "无尽夏.png",
    "石灰灯.png",
    "花舞霓裳.png",
    "香草草莓.png",
    "魔幻海洋.png",
]
PREFERRED_DEFAULT_BUILTIN_AVATAR_KEY = "恋物语.png"
DEFAULT_BUILTIN_AVATAR_KEY = ""
ROLES_WITH_VIP_BUILTIN_ACCESS = {"premium_user", "admin", "super_admin"}
RENAMED_BUILTIN_AVATAR_KEY_MAP = {
    "石头灯.png": "石灰灯.png",
    "坦尼克.jpg": "坦尼克.png",
    "白二岐.jpg": "白二岐.png",
    "萨利安.jpg": "萨利安.png",
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


def _normalize_builtin_avatar_candidate(avatar_key: str | None) -> str:
    value = (avatar_key or "").strip()
    if not value:
        return ""

    renamed_key = RENAMED_BUILTIN_AVATAR_KEY_MAP.get(value)
    if renamed_key:
        return renamed_key

    return LEGACY_BUILTIN_AVATAR_KEY_MAP.get(value, value)


def role_can_use_vip_builtin_avatar(role: str | None) -> bool:
    return (role or "").strip() in ROLES_WITH_VIP_BUILTIN_ACCESS


def get_default_builtin_avatar_key(include_vip: bool = True) -> str:
    keys = get_all_builtin_avatar_keys()
    if not include_vip:
        keys = [key for key in keys if key not in VIP_ONLY_BUILTIN_AVATAR_KEYS]

    if not keys:
        return DEFAULT_BUILTIN_AVATAR_KEY

    if PREFERRED_DEFAULT_BUILTIN_AVATAR_KEY in keys:
        return PREFERRED_DEFAULT_BUILTIN_AVATAR_KEY

    return keys[0]


def get_role_default_builtin_avatar_key(role: str | None) -> str:
    return get_default_builtin_avatar_key(include_vip=role_can_use_vip_builtin_avatar(role))


def resolve_builtin_avatar_value(avatar_key: str | None, include_vip: bool = True) -> str:
    value = _normalize_builtin_avatar_candidate(avatar_key)
    valid_keys = set(get_all_builtin_avatar_keys())
    if not include_vip:
        valid_keys = {key for key in valid_keys if key not in VIP_ONLY_BUILTIN_AVATAR_KEYS}

    if value in VALID_BUILTIN_AVATAR_KEYS:
        if include_vip or value not in VIP_ONLY_BUILTIN_AVATAR_KEYS:
            return value

    if value in valid_keys:
        return value

    return get_default_builtin_avatar_key(include_vip=include_vip)


def resolve_role_builtin_avatar_value(avatar_key: str | None, role: str | None) -> str:
    return resolve_builtin_avatar_value(
        avatar_key,
        include_vip=role_can_use_vip_builtin_avatar(role),
    )


def normalize_builtin_avatar_key(avatar_key: str) -> str:
    value = _normalize_builtin_avatar_candidate(avatar_key)
    if value in VALID_BUILTIN_AVATAR_KEYS:
        return value

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="内置头像不存在",
    )


def validate_builtin_avatar_key(avatar_key: str) -> str:
    return normalize_builtin_avatar_key(avatar_key)


def is_vip_only_builtin_avatar(avatar_key: str) -> bool:
    value = _normalize_builtin_avatar_candidate(avatar_key)
    return value in VIP_ONLY_BUILTIN_AVATAR_KEYS


def get_avatar_upload_url(filename: str) -> str:
    return f"{AVATAR_URL_PREFIX}/{filename}"


def get_preferred_builtin_avatar_filename(filename: str) -> str:
    """Return WebP sibling for built-in avatars when it exists."""
    raw_path = Path(filename)
    if raw_path.suffix.lower() == ".webp":
        return filename

    webp_path = BUILTIN_AVATAR_UPLOAD_DIR / raw_path.with_suffix(".webp").name
    if webp_path.exists():
        return webp_path.name

    return filename


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


def _read_limited_upload(content: bytes, ignore_size_limit: bool = False):
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="上传文件不能为空",
        )

    if not ignore_size_limit and len(content) > MAX_AVATAR_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="头像大小不能超过 2MB",
        )


def _safe_avatar_stem(filename: str | None) -> str:
    stem = Path(filename or "avatar").stem.strip() or "avatar"
    stem = re.sub(r'[\\/:*?"<>|]+', "_", stem)
    return stem[:80] or "avatar"


def _build_avatar_png(content: bytes, circular: bool = False) -> bytes:
    try:
        from PIL import Image, ImageDraw, ImageOps
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="服务器暂未安装头像图片处理依赖 Pillow",
        ) from exc

    Image.MAX_IMAGE_PIXELS = MAX_AVATAR_PIXELS
    try:
        with Image.open(io.BytesIO(content)) as probe:
            probe.verify()
        with Image.open(io.BytesIO(content)) as img:
            img = ImageOps.exif_transpose(img)
            img.load()
            width, height = img.size
            if width <= 0 or height <= 0 or width * height > MAX_AVATAR_PIXELS:
                raise ValueError("图片尺寸过大")

            min_dim = min(width, height)
            left = (width - min_dim) // 2
            top = (height - min_dim) // 2
            img = img.crop((left, top, left + min_dim, top + min_dim))
            img.thumbnail((MAX_AVATAR_DIMENSION, MAX_AVATAR_DIMENSION), Image.Resampling.LANCZOS)
            if img.mode != "RGBA":
                img = img.convert("RGBA")

            if circular:
                mask = Image.new("L", img.size, 0)
                draw = ImageDraw.Draw(mask)
                draw.ellipse((0, 0, img.size[0], img.size[1]), fill=255)
                img.putalpha(mask)

            buffer = io.BytesIO()
            img.save(buffer, format="PNG", optimize=True)
            return buffer.getvalue()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="上传文件不是有效的图片，或图片尺寸过大",
        ) from exc


async def save_uploaded_avatar(user_id: int, file: UploadFile, ignore_size_limit: bool = False) -> str:
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
    _read_limited_upload(content, ignore_size_limit)
    avatar_bytes = _build_avatar_png(content, circular=False)

    filename = f"user_{user_id}_{uuid4().hex}.png"
    destination = AVATAR_UPLOAD_DIR / filename
    destination.write_bytes(avatar_bytes)
    return get_avatar_upload_url(filename)


def _seed_builtin_avatars_from_frontend():
    pass


def _scan_builtin_avatar_files() -> list[str]:
    """扫描 data/builtin-avatars/ 目录下的头像 key。

    WebP files generated next to an original PNG/JPG are delivery variants, not
    separate selectable avatar keys.
    """
    if not BUILTIN_AVATAR_UPLOAD_DIR.exists():
        return []
    candidates = [
        p for p in BUILTIN_AVATAR_UPLOAD_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in ALLOWED_SUFFIXES
    ]
    source_stems = {
        p.stem for p in candidates
        if p.suffix.lower() in {".png", ".jpg", ".jpeg"}
    }
    files = [
        p.name for p in candidates
        if p.suffix.lower() != ".webp" or p.stem not in source_stems
    ]
    return sorted(files)


def load_builtin_avatar_metadata() -> dict[str, dict]:
    metadata_path = BUILTIN_AVATAR_UPLOAD_DIR / "metadata.json"
    if not metadata_path.exists():
        return {}

    try:
        data = json.loads(metadata_path.read_text(encoding="utf-8"))
    except Exception:
        return {}

    if not isinstance(data, dict):
        return {}

    return {
        str(key): value
        for key, value in data.items()
        if isinstance(value, dict)
    }


def get_all_builtin_avatar_keys() -> list[str]:
    """返回当前磁盘上实际可用的内置头像 key。"""
    return _scan_builtin_avatar_files()


def refresh_valid_builtin_keys():
    """刷新 VALID_BUILTIN_AVATAR_KEYS 集合（上传或删除后调用）。"""
    global VALID_BUILTIN_AVATAR_KEYS
    VALID_BUILTIN_AVATAR_KEYS = set(get_all_builtin_avatar_keys())


def is_hardcoded_builtin_avatar(filename: str) -> bool:
    return filename in BUILTIN_AVATAR_KEYS


async def save_builtin_avatar(
    file: UploadFile,
    variety: str | None = None,
    avatars_name: str | None = None,
    source_mtime: float | None = None
) -> str:
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
    _read_limited_upload(content, ignore_size_limit=True)
    img_bytes = _build_avatar_png(content, circular=True)

    # Force PNG to support transparency and strip metadata.
    original_stem = _safe_avatar_stem(file.filename)
    filename = f"{original_stem}.png"
    destination = BUILTIN_AVATAR_UPLOAD_DIR / filename

    try:
        # Save to backend dynamic storage
        destination.write_bytes(img_bytes)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"保存圆形头像失败: {e}",
        )

    if variety and avatars_name:
        metadata = {}
        metadata_path = BUILTIN_AVATAR_UPLOAD_DIR / "metadata.json"
        if metadata_path.exists():
            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            except Exception:
                pass
        metadata[filename] = {"variety": variety, "avatars_name": avatars_name}
        if source_mtime is not None:
            metadata[filename]["source_mtime"] = source_mtime
        metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    refresh_valid_builtin_keys()
    return f"{BUILTIN_AVATAR_URL_PREFIX}/{filename}"


def delete_builtin_avatar_file(filename: str):
    file_path = (BUILTIN_AVATAR_UPLOAD_DIR / filename).resolve()
    try:
        file_path.relative_to(BUILTIN_AVATAR_UPLOAD_DIR.resolve())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="非法的文件路径",
        )
    if file_path.exists():
        file_path.unlink()

    metadata = load_builtin_avatar_metadata()
    if filename in metadata:
        del metadata[filename]
        metadata_path = BUILTIN_AVATAR_UPLOAD_DIR / "metadata.json"
        metadata_path.write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    refresh_valid_builtin_keys()


_seed_builtin_avatars_from_frontend()
refresh_valid_builtin_keys()
