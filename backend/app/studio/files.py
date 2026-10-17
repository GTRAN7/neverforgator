"""Files on disk. Each palace has a folder data/palaces/<id>/ with its room files and stop crops;
generated pictures are shared in data/cache/. Everything else is in the database."""
import os
import secrets
from pathlib import Path

from app import config

PALACES_DIR = Path(config.DATA_DIR) / "palaces"
CACHE_DIR = Path(config.DATA_DIR) / "cache"
PALACES_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def palace_dir(palace_id: int) -> Path:
    path = PALACES_DIR / str(int(palace_id))
    path.mkdir(exist_ok=True)
    return path


def new_name(prefix: str, ext: str) -> str:
    """A random file name, so file URLs can't be guessed (they're served without login)."""
    return f"{prefix}-{secrets.token_hex(6)}{ext}"


def link_or_copy(src: Path, dst: Path) -> None:
    """Hard-link (a 95 MB scan isn't duplicated per user), or copy if linking isn't possible."""
    if dst.exists() and os.path.samefile(src, dst):
        return  # already linked
    # A failed copy is rolled back in the database but leaves its files, and the next palace can
    # get the same id (and folder), so replace leftovers instead of failing on them.
    dst.unlink(missing_ok=True)
    try:
        os.link(src, dst)
    except OSError:
        import shutil
        shutil.copyfile(src, dst)
