from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.routers import socket_router
from app.config import BASE_SAVE_DIR

app = FastAPI(title="Photobooth Backend", version="1.0.0")

# Cấp quyền phát thư mục photobooth_data thành link web để React có thể tải ảnh
app.mount("/data", StaticFiles(directory=BASE_SAVE_DIR), name="data")

app.include_router(socket_router.router)