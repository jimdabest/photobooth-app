"""Persistent kiosk settings and template configuration."""

import json
import os
import re
import threading
from pathlib import Path
from typing import Any

from app.config import MAX_PRINT_COPIES, SETTINGS_FILE

_settings_lock = threading.RLock()
_PATH_SEGMENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_. -]*$")

DEFAULT_TEMPLATES = [
    {"id": "tpl_1", "name": "Khung 4x6", "print_format": "s4x6"},
    {"id": "tpl_2", "name": "Khung 2x6", "print_format": "s6x2_2"},
]
DEFAULT_HOT_FOLDER_DIR = "ptb_data/hot_folder"

DEFAULT_SETTINGS = {
    "printer_model": "RX1HS",
    "enable_review_page": True,
    "offline_mode": False,
    "auto_print": False,
    "enable_retake": True,
    "hot_folder_dir": DEFAULT_HOT_FOLDER_DIR,
    "save_session_raw_images": False,
    "templates": DEFAULT_TEMPLATES,
    "countdown_capture": 3,
    "review_timeout": 20,
    "qr_timeout": 15,
    "max_print_copies": min(10, MAX_PRINT_COPIES),
    "bg_url": "",
}


def _normalise_template(template: Any) -> dict[str, Any]:
    if not isinstance(template, dict):
        raise ValueError("Mỗi template phải là một object")
    result = dict(template)
    for key in ("id", "name", "print_format"):
        value = str(result.get(key, "s4x6" if key == "print_format" else "")).strip()
        if not value:
            raise ValueError(f"Template thiếu {key}")
        result[key] = value
    if not _PATH_SEGMENT.fullmatch(result["print_format"]):
        raise ValueError("print_format chỉ được chứa chữ, số, khoảng trắng, dấu gạch dưới, gạch ngang hoặc dấu chấm")
    # A kiosk 2x6 layout must be delivered as one 4x6 two-up image to HFP's
    # s6x2_2 queue. The single-strip s2x6 queue can hold a job while waiting
    # for media processing, so migrate the old temporary mapping on load.
    if result["print_format"] == "s2x6":
        result["print_format"] = "s6x2_2"
    return result


def _normalise(settings: dict[str, Any]) -> dict[str, Any]:
    result = {**DEFAULT_SETTINGS, **settings}
    for key in ("enable_review_page", "offline_mode", "auto_print", "enable_retake", "save_session_raw_images"):
        if type(result[key]) is not bool:
            raise ValueError(f"{key} phải là boolean")

    printer_model = str(result.get("printer_model") or "").strip()
    if not _PATH_SEGMENT.fullmatch(printer_model):
        raise ValueError("printer_model không hợp lệ")
    result["printer_model"] = printer_model
    result["bg_url"] = str(result.get("bg_url") or "")
    hot_folder_dir = str(result.get("hot_folder_dir") or "").strip()
    if not hot_folder_dir or "\x00" in hot_folder_dir or len(hot_folder_dir) > 1024:
        raise ValueError("hot_folder_dir không hợp lệ")
    result["hot_folder_dir"] = hot_folder_dir

    templates = result.get("templates")
    if not isinstance(templates, list) or not templates:
        raise ValueError("templates phải là mảng không rỗng")
    result["templates"] = [_normalise_template(template) for template in templates]
    template_ids = [template["id"] for template in result["templates"]]
    if len(template_ids) != len(set(template_ids)):
        raise ValueError("id template bị trùng")

    for key, default, minimum, maximum in (
        ("countdown_capture", 3, 0, 60),
        ("review_timeout", 20, 1, 600),
        ("qr_timeout", 15, 1, 600),
        ("max_print_copies", min(10, MAX_PRINT_COPIES), 1, min(10, MAX_PRINT_COPIES)),
    ):
        try:
            result[key] = max(minimum, min(int(result.get(key, default)), maximum))
        except (TypeError, ValueError):
            result[key] = default
    result.pop("templates_order", None)
    return result


def _read_raw_settings() -> dict[str, Any]:
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as file:
            raw = json.load(file)
        if not isinstance(raw, dict):
            raise ValueError("settings.json phải là object")
        return raw
    except FileNotFoundError:
        return {}


def _write_settings(settings: dict[str, Any]) -> None:
    settings_path = Path(SETTINGS_FILE)
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = settings_path.with_suffix(".json.tmp")
    try:
        with open(temporary, "w", encoding="utf-8") as file:
            json.dump(settings, file, ensure_ascii=False, indent=2)
        os.replace(temporary, settings_path)
    except OSError:
        temporary.unlink(missing_ok=True)
        raise


def load_settings() -> dict[str, Any]:
    """Return complete settings from the centralized configuration file."""
    try:
        raw = _read_raw_settings()
        settings = _normalise(raw)
        if raw != settings:
            _write_settings(settings)
        return settings
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"[SETTINGS] Dùng cấu hình mặc định: {exc}")
        return _normalise(DEFAULT_SETTINGS)


def save_settings(changes: dict[str, Any]) -> dict[str, Any]:
    """Merge, validate, and atomically persist settings.json."""
    if not isinstance(changes, dict):
        raise ValueError("Cấu hình phải là JSON object")
    with _settings_lock:
        settings = _normalise({**load_settings(), **changes})
        _write_settings(settings)
        return settings
