"""Filesystem helpers for the centralized photobooth data directory."""

from datetime import datetime
from pathlib import Path

from app.config import FINAL_IMAGES_DIR, SESSION_DIR


def create_session_folder() -> tuple[str, str, str]:
    session_id = datetime.now().strftime("%y%m%d-%H%M%S")
    session_path = SESSION_DIR / session_id
    session_path.mkdir(parents=True, exist_ok=True)
    final_path = FINAL_IMAGES_DIR / f"{session_id}.jpg"
    return session_id, str(session_path), str(final_path)
