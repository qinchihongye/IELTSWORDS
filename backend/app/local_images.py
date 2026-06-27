"""
本地配图读取工具 (新版：支持 group 和 word 子文件夹)
"""

from collections import defaultdict
from pathlib import Path
import re
from typing import Dict, List, Optional, Tuple

from .config.settings import BASE_DIR

LOCAL_IMAGE_DIR = BASE_DIR / "data" / "images"
LOCAL_GROUP_IMAGE_DIR = LOCAL_IMAGE_DIR / "group"
LOCAL_WORD_IMAGE_DIR = LOCAL_IMAGE_DIR / "word"

IMAGE_MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


def _iter_local_group_images(chapter_no: str, group_id: str) -> List[tuple[int, Path]]:
    if not LOCAL_GROUP_IMAGE_DIR.exists():
        return []

    matched_files: List[tuple[int, Path]] = []
    prefix = f"{chapter_no}-"
    group_part = f"-{group_id}-"

    for path in LOCAL_GROUP_IMAGE_DIR.iterdir():
        if not path.is_file():
            continue
        name = path.name
        suffix = path.suffix.lower()
        if suffix not in IMAGE_MIME_TYPES:
            continue

        if name.startswith(prefix) and group_part in name:
            matched_files.append((1, path))
            break  # 每个 group 只有一张组图

    return matched_files


def get_local_group_image_numbers(chapter_no: str, group_id: str) -> List[int]:
    return [image_number for image_number, _ in _iter_local_group_images(chapter_no, group_id)]


def get_local_group_image_path(chapter_no: str, group_id: str, image_number: int) -> Optional[Path]:
    if image_number != 1:
        return None
    for current_number, path in _iter_local_group_images(chapter_no, group_id):
        if current_number == image_number:
            return path
    return None


def get_local_word_image_path(chapter_no: str, group_id: str, word: str) -> Optional[Path]:
    if not LOCAL_WORD_IMAGE_DIR.exists():
        return None

    # 清理并统一格式
    clean_word = re.sub(r'[\\/*?:"<>|]', '-', word).strip().lower()
    prefix = f"{chapter_no}-"
    group_part = f"-{group_id}-"

    for path in LOCAL_WORD_IMAGE_DIR.iterdir():
        if not path.is_file():
            continue
        suffix = path.suffix.lower()
        if suffix not in IMAGE_MIME_TYPES:
            continue

        name = path.name.lower()
        if name.startswith(prefix.lower()) and group_part.lower() in name:
            stem = path.stem.lower()
            if stem.endswith(f"-{clean_word}"):
                return path
    return None


def get_local_image_media_type(path: Path) -> str:
    return IMAGE_MIME_TYPES.get(path.suffix.lower(), "application/octet-stream")


def get_local_image_count_map() -> Dict[Tuple[str, str], int]:
    if not LOCAL_GROUP_IMAGE_DIR.exists():
        return {}

    counts: Dict[Tuple[str, str], int] = {}
    for path in LOCAL_GROUP_IMAGE_DIR.iterdir():
        if not path.is_file():
            continue
        parts = path.name.split('-')
        if len(parts) >= 3:
            chapter_no = parts[0]
            group_id = None
            for p in parts:
                if p.lower().startswith("group"):
                    group_id = p
                    break
            if group_id:
                counts[(chapter_no, group_id)] = 1

    return counts


def get_local_image_count_map_for_chapter(chapter_no: str) -> Dict[str, int]:
    return {
        group_id: count
        for (current_chapter_no, group_id), count in get_local_image_count_map().items()
        if current_chapter_no == chapter_no
    }
