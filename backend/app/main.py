import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from app.routers import api_router
from app.config import BASE_DATA_DIR
from app.services.camera_provider import canon_cam

@asynccontextmanager
async def lifespan(app):
    try:
        yield
    finally:
        if hasattr(canon_cam, 'shutdown'):
            await asyncio.to_thread(canon_cam.shutdown)


app = FastAPI(title="Photobooth Backend", version="1.0.0", lifespan=lifespan)

# Cấu hình CORS để Frontend (React) có thể gọi API mà không bị lỗi mạng
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Cho phép tất cả nguồn gọi tới
    allow_credentials=True,
    allow_methods=["*"],  # Cho phép GET, POST...
    allow_headers=["*"],
)

# Cấp quyền phát thư mục chứa dữ liệu
app.mount("/data", StaticFiles(directory=BASE_DATA_DIR), name="data")

# Đăng ký REST API của kiosk và Admin.
app.include_router(api_router.router)
