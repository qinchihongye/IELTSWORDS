"""
用户头像存储工具
"""

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
_ALLOWED_SUFFIXES_FOR_BUILTIN = {".png", ".jpg", ".jpeg", ".webp"}
BUILTIN_AVATAR_KEYS = []
if BUILTIN_AVATAR_UPLOAD_DIR.exists():
    BUILTIN_AVATAR_KEYS = [
        f.name for f in BUILTIN_AVATAR_UPLOAD_DIR.iterdir()
        if f.is_file() and f.suffix.lower() in _ALLOWED_SUFFIXES_FOR_BUILTIN
    ]
VIP_ONLY_BUILTIN_AVATAR_KEYS = {
    "花舞霓裳.png",
    "石灰灯.png",
    "香草草莓.png",
    "白二岐.png",
    "幻想曲.png",
    "雪后.png",
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
DEFAULT_BUILTIN_AVATAR_KEY = "恋物语.png"
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


def _seed_builtin_avatars_from_frontend():
    """将前端打包的内置头像复制到 data/builtin-avatars/ 目录。"""
    frontend_assets_dir = BASE_DIR / "frontend" / "src" / "assets" / "builtin-avatars"
    if not frontend_assets_dir.exists():
        return

    for src_path in frontend_assets_dir.iterdir():
        if not src_path.is_file():
            continue
        if src_path.suffix.lower() not in ALLOWED_SUFFIXES:
            continue
        dest_path = BUILTIN_AVATAR_UPLOAD_DIR / src_path.name
        if not dest_path.exists():
            dest_path.write_bytes(src_path.read_bytes())


def _scan_builtin_avatar_files() -> list[str]:
    """扫描 data/builtin-avatars/ 目录下的所有图片文件。"""
    if not BUILTIN_AVATAR_UPLOAD_DIR.exists():
        return []
    files = []
    for p in BUILTIN_AVATAR_UPLOAD_DIR.iterdir():
        if p.is_file() and p.suffix.lower() in ALLOWED_SUFFIXES:
            files.append(p.name)
    return sorted(files)


def get_all_builtin_avatar_keys() -> list[str]:
    """返回所有可用内置头像 key（硬编码 + 上传目录中的）。"""
    uploaded = _scan_builtin_avatar_files()
    merged = list(BUILTIN_AVATAR_KEYS)
    for f in uploaded:
        if f not in merged:
            merged.append(f)
    return merged


def refresh_valid_builtin_keys():
    """刷新 VALID_BUILTIN_AVATAR_KEYS 集合（上传或删除后调用）。"""
    global VALID_BUILTIN_AVATAR_KEYS
    VALID_BUILTIN_AVATAR_KEYS = set(get_all_builtin_avatar_keys())


def is_hardcoded_builtin_avatar(filename: str) -> bool:
    return filename in BUILTIN_AVATAR_KEYS


async def save_builtin_avatar(file: UploadFile) -> str:
    import io
    from PIL import Image, ImageDraw

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

    try:
        img = Image.open(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"解析图片文件失败: {e}",
        )

    # 1. Ensure RGBA mode for transparency support
    if img.mode != 'RGBA':
        img = img.convert('RGBA')

    # 2. Centered square crop at its original resolution (No dimension reduction)
    width, height = img.size
    min_dim = min(width, height)
    left = (width - min_dim) // 2
    top = (height - min_dim) // 2
    right = left + min_dim
    bottom = top + min_dim
    cropped = img.crop((left, top, right, bottom))

    # 3. Circular transparency mask
    size = cropped.size
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size[0], size[1]), fill=255)

    # Apply transparency mask as alpha channel
    circular = cropped.copy()
    circular.putalpha(mask)

    # 4. Generate save filename (Force PNG to support transparency)
    original_stem = Path(file.filename or "avatar.png").stem
    filename = f"{original_stem}.png"
    destination = BUILTIN_AVATAR_UPLOAD_DIR / filename

    # 5. Save circular transparent image to disk (Original dimensions preserved)
    try:
        buffer = io.BytesIO()
        circular.save(buffer, format="PNG", optimize=True)
        img_bytes = buffer.getvalue()
        
        # Save to backend dynamic storage
        destination.write_bytes(img_bytes)
        
        # Replicate/copy to frontend assets directory so they can be bundled/committed
        frontend_assets_dir = BASE_DIR / "frontend" / "src" / "assets" / "builtin-avatars"
        if frontend_assets_dir.exists():
            (frontend_assets_dir / filename).write_bytes(img_bytes)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"保存圆形头像失败: {e}",
        )

    refresh_valid_builtin_keys()
    return f"{BUILTIN_AVATAR_URL_PREFIX}/{filename}"


def delete_builtin_avatar_file(filename: str):
    if is_hardcoded_builtin_avatar(filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无法删除内置的默认头像，仅可删除自行上传的头像",
        )
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
    
    # Also delete from frontend assets directory to keep them perfectly in sync
    frontend_assets_dir = BASE_DIR / "frontend" / "src" / "assets" / "builtin-avatars"
    if frontend_assets_dir.exists():
        frontend_file_path = frontend_assets_dir / filename
        if frontend_file_path.exists():
            frontend_file_path.unlink()
            
    refresh_valid_builtin_keys()


_seed_builtin_avatars_from_frontend()
refresh_valid_builtin_keys()
