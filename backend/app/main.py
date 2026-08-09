from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from app.routers import socket_router, api_router  # Import thêm api_router
from app.config import BASE_SAVE_DIR

app = FastAPI(title="Photobooth Backend", version="1.0.0")

# Cấu hình CORS để Frontend (React) có thể gọi API mà không bị lỗi mạng
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Cho phép tất cả nguồn gọi tới
    allow_credentials=True,
    allow_methods=["*"],  # Cho phép GET, POST...
    allow_headers=["*"],
)

# Cấp quyền phát thư mục chứa dữ liệu
app.mount("/data", StaticFiles(directory=BASE_SAVE_DIR), name="data")

# Đăng ký các cổng giao tiếp
app.include_router(socket_router.router)
app.include_router(api_router.router)  # Đăng ký các API của Admin