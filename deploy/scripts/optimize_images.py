#!/usr/bin/env python3
import argparse
from pathlib import Path

from PIL import Image, ImageOps


SUPPORTED_SUFFIXES = {".png", ".jpg", ".jpeg"}


def iter_source_images(image_dir: Path):
    for path in sorted(image_dir.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in SUPPORTED_SUFFIXES:
            continue
        yield path


def optimize_image(source_path: Path, quality: int, max_side: int, force: bool) -> tuple[bool, int, int]:
    target_path = source_path.with_suffix(".webp")
    source_size = source_path.stat().st_size

    if target_path.exists() and not force:
        return False, source_size, target_path.stat().st_size

    with Image.open(source_path) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")

        width, height = image.size
        longest = max(width, height)
        if longest > max_side:
            scale = max_side / longest
            next_size = (max(1, round(width * scale)), max(1, round(height * scale)))
            image = image.resize(next_size, Image.Resampling.LANCZOS)

        image.save(target_path, "WEBP", quality=quality, method=6)

    target_size = target_path.stat().st_size
    return True, source_size, target_size


def main() -> int:
    root_dir = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Create optimized WebP copies for IELTSWORDS local images.")
    parser.add_argument("--image-dir", type=Path, default=root_dir / "data" / "images")
    parser.add_argument("--quality", type=int, default=72)
    parser.add_argument("--max-side", type=int, default=1400)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    image_dir = args.image_dir
    if not image_dir.exists():
        raise SystemExit(f"Image directory does not exist: {image_dir}")

    created = 0
    skipped = 0
    source_total = 0
    target_total = 0

    for source_path in iter_source_images(image_dir):
        did_create, source_size, target_size = optimize_image(
            source_path,
            quality=args.quality,
            max_side=args.max_side,
            force=args.force,
        )
        source_total += source_size
        target_total += target_size
        if did_create:
            created += 1
            print(f"optimized: {source_path.name} -> {source_path.with_suffix('.webp').name}")
        else:
            skipped += 1

    saved = source_total - target_total
    print()
    print(f"created/updated: {created}")
    print(f"skipped: {skipped}")
    print(f"original total: {source_total / 1024 / 1024:.1f} MB")
    print(f"webp total: {target_total / 1024 / 1024:.1f} MB")
    print(f"estimated saved per full image set: {saved / 1024 / 1024:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
