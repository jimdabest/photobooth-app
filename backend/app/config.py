"""Cấu hình dùng chung cho backend Photobooth."""

import os
import socket
from pathlib import Path

from dotenv import load_dotenv


# config.py nằm trong backend/app, vì vậy BASE_DIR là backend và PROJECT_DIR là gốc dự án.
BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BASE_DIR.parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

# All runtime data lives beneath one project-level directory unless an
# operator explicitly configures another location.
_configured_data_dir = os.getenv("PTB_DATA_DIR", "").strip()
if _configured_data_dir:
    _candidate_data_dir = Path(_configured_data_dir).expanduser()
    BASE_DATA_DIR = _candidate_data_dir if _candidate_data_dir.is_absolute() else PROJECT_DIR / _candidate_data_dir
else:
    BASE_DATA_DIR = PROJECT_DIR / "ptb_data"
CONFIG_DIR = BASE_DATA_DIR / "config"
TEMPLATE_DIR = BASE_DATA_DIR / "template"
SESSION_DIR = BASE_DATA_DIR / "session"
FINAL_IMAGES_DIR = BASE_DATA_DIR / "final_images"
OFFLINE_QUEUE_DIR = BASE_DATA_DIR / "offline_queue"
HOT_FOLDER_DIR = BASE_DATA_DIR / "hot_folder"
MOCK_PRINTED_DIR = BASE_DATA_DIR / "mock_printed"
SETTINGS_FILE = CONFIG_DIR / "settings.json"

for directory in (
    BASE_DATA_DIR,
    CONFIG_DIR,
    TEMPLATE_DIR,
    SESSION_DIR,
    FINAL_IMAGES_DIR,
    OFFLINE_QUEUE_DIR,
    HOT_FOLDER_DIR,
):
    directory.mkdir(parents=True, exist_ok=True)

# Giới hạn cứng do vận hành đặt qua biến môi trường. Cài đặt Admin chỉ có thể
# giảm giới hạn này, không thể vượt nó.
MAX_PRINT_COPIES = int(os.getenv("MAX_PRINT_COPIES", "10"))
DEFAULT_PRINT_COPIES = int(os.getenv("DEFAULT_PRINT_COPIES", "1"))
WEB_IMAGE_MAX_WIDTH = int(os.getenv("WEB_IMAGE_MAX_WIDTH", "1920"))
WEB_IMAGE_QUALITY = int(os.getenv("WEB_IMAGE_QUALITY", "82"))

# Cloudflare R2 Configuration
R2_ENABLED = os.getenv("R2_ENABLED", "false").lower() == "true"
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY = os.getenv("R2_ACCESS_KEY", "")
R2_SECRET_KEY = os.getenv("R2_SECRET_KEY", "")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "photobooth-prints")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "")


def get_local_ip():
    """Tự động phát hiện IP LAN của máy đang chạy."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        sock.close()


# URL công khai của frontend (dùng cho QR code)
FRONTEND_URL = os.getenv("PUBLIC_URL", "https://simplex-photobooth.pages.dev")
