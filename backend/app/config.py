import os

# Thư mục gốc chứa dữ liệu ảnh lẻ, ảnh cloud (vẫn chia theo từng phiên)
BASE_SAVE_DIR = os.path.join(os.getcwd(), "photobooth_data")
os.makedirs(BASE_SAVE_DIR, exist_ok=True)

# THƯ MỤC CHUNG LƯU TẤT CẢ ẢNH IN (Admin có thể đổi thành ổ D, ổ E tùy ý)
PRINT_EXPORT_DIR = os.path.join(os.getcwd(), "photobooth_prints_all")
os.makedirs(PRINT_EXPORT_DIR, exist_ok=True)