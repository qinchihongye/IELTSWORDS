"""
本地配图读取工具
"""

from collections import defaultdict
from pathlib import Path
import re
from typing import Dict, List, Optional, Tuple

from .config.settings import BASE_DIR

LOCAL_IMAGE_DIR = BASE_DIR / "data" / "images"
LOCAL_IMAGE_PATTERN = re.compile(
    r"^(?P<chapter_no>[^-]+)-.+?-(?P<group_id>group[^-]*)-.+-配图(?P<number>\d+)(?P<suffix>\.[^.]+)$",
    re.IGNORECASE,
)
IMAGE_MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}
IMAGE_SUFFIX_PRIORITY = {
    ".webp": 0,
    ".jpg": 1,
    ".jpeg": 1,
    ".png": 2,
}


def _parse_local_image_path(path: Path) -> Optional[Tuple[str, str, int]]:
    if not path.is_file():
        return None

    match = LOCAL_IMAGE_PATTERN.match(path.name)
    if not match:
        return None

    suffix = match.group("suffix").lower()
    if suffix not in IMAGE_MIME_TYPES:
        return None

    return (
        match.group("chapter_no"),
        match.group("group_id"),
        int(match.group("number")),
    )


def _iter_local_group_images(chapter_no: str, group_id: str) -> List[tuple[int, Path]]:
    if not LOCAL_IMAGE_DIR.exists():
        return []

    matched_files: List[tuple[int, Path]] = []

    for path in LOCAL_IMAGE_DIR.iterdir():
        parsed = _parse_local_image_path(path)
        if not parsed:
            continue
        current_chapter_no, current_group_id, image_number = parsed
        if current_chapter_no != chapter_no or current_group_id != group_id:
            continue
        matched_files.append((image_number, path))

    deduped_files: List[tuple[int, Path]] = []
    seen_numbers = set()
    for image_number, path in sorted(
        matched_files,
        key=lambda item: (
            item[0],
            IMAGE_SUFFIX_PRIORITY.get(item[1].suffix.lower(), 99),
            item[1].name,
        ),
    ):
        if image_number in seen_numbers:
            continue
        seen_numbers.add(image_number)
        deduped_files.append((image_number, path))

    return deduped_files


def get_local_group_image_numbers(chapter_no: str, group_id: str) -> List[int]:
    return [image_number for image_number, _ in _iter_local_group_images(chapter_no, group_id)]


def get_local_group_image_path(chapter_no: str, group_id: str, image_number: int) -> Optional[Path]:
    for current_number, path in _iter_local_group_images(chapter_no, group_id):
        if current_number == image_number:
            return path
    return None


def get_local_image_media_type(path: Path) -> str:
    return IMAGE_MIME_TYPES.get(path.suffix.lower(), "application/octet-stream")


def get_local_image_count_map() -> Dict[Tuple[str, str], int]:
    if not LOCAL_IMAGE_DIR.exists():
        return {}

    counts: Dict[Tuple[str, str], set[int]] = defaultdict(set)
    for path in LOCAL_IMAGE_DIR.iterdir():
        parsed = _parse_local_image_path(path)
        if not parsed:
            continue
        chapter_no, group_id, image_number = parsed
        counts[(chapter_no, group_id)].add(image_number)

    return {
        key: len(image_numbers)
        for key, image_numbers in counts.items()
    }


def get_local_image_count_map_for_chapter(chapter_no: str) -> Dict[str, int]:
    return {
        group_id: count
        for (current_chapter_no, group_id), count in get_local_image_count_map().items()
        if current_chapter_no == chapter_no
    }
