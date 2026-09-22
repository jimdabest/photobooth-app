import os
import socket
from pathlib import Path
from dotenv import load_dotenv

# Load biến môi trường từ .env (backend/.env)
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# Thư mục gốc chứa dữ liệu ảnh lẻ, ảnh cloud (chia theo từng phiên)
BASE_SAVE_DIR = os.path.join(os.getcwd(), "photobooth_data")
os.makedirs(BASE_SAVE_DIR, exist_ok=True)

# Thư mục chung lưu tất cả ảnh in (Admin có thể đổi thành ổ D, ổ E tùy ý)
PRINT_EXPORT_DIR = os.path.join(os.getcwd(), "photobooth_prints_all")
os.makedirs(PRINT_EXPORT_DIR, exist_ok=True)

# Cloudflare R2 Configuration
R2_ENABLED = os.getenv("R2_ENABLED", "false").lower() == "true"
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY = os.getenv("R2_ACCESS_KEY", "")
R2_SECRET_KEY = os.getenv("R2_SECRET_KEY", "")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "photobooth-prints")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "")


def get_local_ip():
    """Tự động phát hiện IP LAN của máy đang chạy"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip


# URL công khai của frontend (dùng cho QR code)
FRONTEND_URL = os.getenv("PUBLIC_URL", "https://simplex-photobooth.pages.dev")