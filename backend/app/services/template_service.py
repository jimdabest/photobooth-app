"""Template persistence backed by the templates array in settings.json."""

from io import BytesIO
from pathlib import Path
from time import time
from typing import Any

from PIL import Image

from app.config import TEMPLATE_DIR
from app.services.settings_service import load_settings, save_settings

TEMPLATES_DIR = TEMPLATE_DIR
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg"}


def list_templates() -> list[dict[str, Any]]:
    return list(load_settings()["templates"])


def get_template(template_id: str) -> dict[str, Any] | None:
    return next((template for template in list_templates() if template["id"] == template_id), None)


def _save_templates(templates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return save_settings({"templates": templates})["templates"]


def update_template(template_id: str, changes: dict[str, Any]) -> dict[str, Any]:
    templates = list_templates()
    for index, current in enumerate(templates):
        if current["id"] == template_id:
            updated = {**current, **changes, "id": template_id}
            templates[index] = updated
            return next(template for template in _save_templates(templates) if template["id"] == template_id)
    raise ValueError("Không tìm thấy template")


def delete_template(template_id: str) -> None:
    templates = list_templates()
    remaining = [template for template in templates if template["id"] != template_id]
    if len(remaining) == len(templates):
        raise ValueError("Không tìm thấy template")
    if not remaining:
        raise ValueError("Phải có ít nhất một template")
    _save_templates(remaining)
    for extension in ALLOWED_EXTENSIONS:
        (TEMPLATES_DIR / f"{template_id}.{extension}").unlink(missing_ok=True)


def create_template(name: str, filename: str, content: bytes, print_format: str = "s4x6") -> dict[str, Any]:
    extension = Path(filename).suffix.lower().removeprefix(".")
    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError("Chỉ hỗ trợ file PNG hoặc JPEG")
    safe_name = name.strip()
    if not safe_name:
        raise ValueError("Tên template không được để trống")

    with Image.open(BytesIO(content)) as image:
        width, height = image.size
    template_id = f"tpl_{int(time() * 1000)}"
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    (TEMPLATES_DIR / f"{template_id}.{extension}").write_bytes(content)

    slot_width = int(width * 0.85)
    slot_height = int(slot_width * 9 / 16)
    slot_x = int((width - slot_width) / 2)
    start_y = int(height * 0.12)
    gap_y = int(slot_height * 1.1)
    template = {
        "id": template_id,
        "name": safe_name,
        "print_format": print_format,
        "hidden": False,
        "image_url": f"http://127.0.0.1:8000/data/template/{template_id}.{extension}",
        "orientation": "portrait" if height > width else "landscape",
        "canvas_size": {"width": width, "height": height},
        "num_poses": 4,
        "slots": [
            {"pose_index": index + 1, "x": slot_x, "y": start_y + gap_y * index,
             "width": slot_width, "height": slot_height, "rotation": 0}
            for index in range(4)
        ],
        "qr_config": {"print_on_photo": True, "x": max(0, width - 160), "y": max(0, height - 180), "size": 130},
        "guide_config": {"enabled": False, "opacity": 0.4},
    }
    _save_templates([*list_templates(), template])
    return template
