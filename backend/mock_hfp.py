"""Development-only simulator for the HFP file consumer."""

import shutil
import time
from pathlib import Path

from app.config import MOCK_PRINTED_DIR
from app.services.image_service import get_hot_folder_dir


def _unique_destination(source: Path) -> Path:
    destination = MOCK_PRINTED_DIR / source.name
    suffix = 2
    while destination.exists():
        destination = MOCK_PRINTED_DIR / f"{source.stem}_{suffix}{source.suffix}"
        suffix += 1
    return destination


def run() -> None:
    hot_folder_dir = get_hot_folder_dir()
    hot_folder_dir.mkdir(parents=True, exist_ok=True)
    MOCK_PRINTED_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Theo dõi Hot Folder: {hot_folder_dir}")
    try:
        while True:
            # Đồng bộ với HFP thật: chỉ nhận JPG nằm trực tiếp trong Hot Folder.
            for print_file in sorted(hot_folder_dir.rglob("*.jpg")):
                if not print_file.is_file():
                    continue
                print(f"Đang xử lý in... {print_file.name}")
                time.sleep(2)
                try:
                    shutil.move(str(print_file), str(_unique_destination(print_file)))
                except FileNotFoundError:
                    continue
            time.sleep(1)
    except KeyboardInterrupt:
        print("Đã dừng giả lập máy in.")


if __name__ == "__main__":
    run()
