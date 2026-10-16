"""Run the shared backend using a synthetic camera, optionally a USB webcam.

    python backend/run_test.py
    python backend/run_test.py --webcam

All settings, templates, printing and background uploads use the production
routers/services. No Canon SDK is imported in this process.
"""
import argparse
import os

from venv_bootstrap import use_project_venv


if __name__ == '__main__':
    use_project_venv(__file__)


def parse_args():
    parser = argparse.ArgumentParser(description='Photobooth không cần máy ảnh Canon')
    parser.add_argument('--webcam', action='store_true', help='Dùng webcam; không có thì tạo ảnh giả lập')
    # Keep the test server reachable from the kiosk and phones on the LAN,
    # matching run.py and the previous mock server.
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=8000)
    return parser.parse_args()


# Select the adapter BEFORE importing app.main and its routers.
args = parse_args() if __name__ == '__main__' else None
os.environ['PHOTOBOOTH_CAMERA_MODE'] = 'webcam' if args and args.webcam else 'mock'

import uvicorn
from app.main import app
from app.config import R2_BUCKET_NAME, R2_ENABLED, R2_PUBLIC_URL, SETTINGS_FILE
from app.services.image_service import get_hot_folder_dir
from app.services.settings_service import load_settings


if __name__ == '__main__':
    settings = load_settings()
    print('PHOTOBOOTH TEST SERVER - không cần Canon hoặc EDSDK')
    print(f'Camera: {os.environ["PHOTOBOOTH_CAMERA_MODE"]}')
    print(f'Backend: http://{args.host}:{args.port}')
    print(f'Settings: {SETTINGS_FILE}')
    print(f'Hot Folder: {get_hot_folder_dir(settings)}')
    print(f'Printer: {settings["printer_model"]}')
    print(f'Offline: {settings["offline_mode"]}; R2 enabled: {R2_ENABLED}')
    if R2_ENABLED:
        print(f'R2 Bucket: {R2_BUCKET_NAME}')
        print(f'R2 URL: {R2_PUBLIC_URL}')
    print('Dùng chung dữ liệu và cấu hình thật. Dừng run.py trước khi chạy trên cổng 8000.')
    uvicorn.run(app, host=args.host, port=args.port)
